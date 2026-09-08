/**
 * Story 29.54 — verificação por reversão.
 *
 * A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
 * Cada teste tem que FALHAR com o defeito de volta; um teste que sobrevive à
 * reversão é decorativo.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  calcularTendencia,
  diaDeNegocio,
  ultimoDiaFechado,
  direcao,
  tendenciaDaEntidade,
  JANELAS_TENDENCIA,
  type PontoDiario,
} from "@/lib/utils/perpetual-tendencia";

function ponto(dateIso: string, spend: number, revenue: number, feeRate = 0): PontoDiario {
  return { dateIso, spend, revenue, margin: revenue * (1 - feeRate) - spend };
}

/** 7 dias, ROAS subindo no fim. */
const SEMANA: PontoDiario[] = [
  ponto("2026-08-02", 100, 100),
  ponto("2026-08-03", 100, 120),
  ponto("2026-08-04", 100, 140),
  ponto("2026-08-05", 100, 160),
  ponto("2026-08-06", 100, 200),
  ponto("2026-08-07", 100, 240),
  ponto("2026-08-08", 100, 300),
];

describe("as três janelas, ancoradas no fim do período", () => {
  const t = calcularTendencia(SEMANA)!;

  it("1d é o último dia, 3d os três últimos, 7d a semana", () => {
    expect(t.fim).toBe("2026-08-08");
    expect(t.janelas.map((j) => j.dias)).toEqual([...JANELAS_TENDENCIA]);
    expect(t.janelas[0]!.revenue).toBe(300);
    expect(t.janelas[1]!.revenue).toBe(200 + 240 + 300);
    expect(t.janelas[2]!.revenue).toBe(1260);
  });

  it("ROAS = Σfaturamento ÷ Σinvestimento em cada janela", () => {
    expect(t.janelas[0]!.roas).toBeCloseTo(3, 6); // 300 / 100
    expect(t.janelas[1]!.roas).toBeCloseTo(740 / 300, 6);
    expect(t.janelas[2]!.roas).toBeCloseTo(1260 / 700, 6);
    expect(t.periodo.roas).toBeCloseTo(1260 / 700, 6);
  });

  it("a coluna Período cobre o range inteiro", () => {
    expect(t.diasDoPeriodo).toBe(7);
    expect(t.periodo.dias).toBe(7);
    expect(t.periodo.parcial).toBe(false);
  });
});

describe("REVERSÃO: razão de somas vira média de médias", () => {
  /**
   * O dia de R$ 5 com uma venda de R$ 500 tem ROAS de 100x. Na razão de somas
   * ele quase não pesa — R$ 5 em R$ 205 de investimento. Numa média de médias
   * ele sozinho arrasta a janela para 34x e a tela mandaria escalar um funil
   * que está empatando.
   */
  const comDiaMinusculo: PontoDiario[] = [
    ponto("2026-08-06", 100, 100),
    ponto("2026-08-07", 100, 110),
    ponto("2026-08-08", 5, 500),
  ];
  const t = calcularTendencia(comDiaMinusculo)!;
  const janela3d = t.janelas[1]!;

  it("o dia de investimento minúsculo NÃO sequestra a janela", () => {
    expect(janela3d.roas).toBeCloseTo(710 / 205, 6); // ≈ 3,46
    expect(janela3d.roas!).toBeLessThan(4);
  });

  it("e a média de médias — o defeito — daria mais de 30x", () => {
    const mediaDeMedias =
      comDiaMinusculo.reduce((s, p) => s + p.revenue / p.spend, 0) / comDiaMinusculo.length;
    expect(mediaDeMedias).toBeGreaterThan(30);
  });
});

describe("REVERSÃO: a janela ancora em 'hoje' em vez do fim do range", () => {
  /**
   * Período de julho, filtrado hoje em agosto. Ancorada em hoje, a janela `7d`
   * cairia inteiramente fora do range e devolveria zero — os cards falando de
   * julho e a tendência, do vazio.
   */
  const julho: PontoDiario[] = [
    ponto("2026-07-10", 100, 200),
    ponto("2026-07-11", 100, 250),
  ];
  const t = calcularTendencia(julho)!;

  it("a âncora é o último dia COM DADO, não a data de hoje", () => {
    expect(t.fim).toBe("2026-07-11");
    expect(t.janelas[0]!.revenue).toBe(250);
    expect(t.janelas[2]!.revenue).toBe(450);
  });
});

describe("REVERSÃO: imposto aplicado duas vezes", () => {
  /**
   * O caso de aceite que fecha o circuito (story, §Verificação): com o range de
   * EXATAMENTE 1 dia, `ROAS_1d` tem que ser idêntico ao ROAS do card. Se
   * divergir, as duas bases não são a mesma — e o suspeito nº 1 é o gross-up de
   * 12,15% aplicado de novo sobre um `spend` que já o tem (Story 29.27).
   */
  const umDia = [ponto("2026-08-08", 814.8, 2841.13)];
  const t = calcularTendencia(umDia)!;
  const roasDoCard = 2841.13 / 814.8;

  it("range de 1 dia: ROAS_1d === ROAS do card", () => {
    expect(t.janelas[0]!.roas).toBeCloseTo(roasDoCard, 10);
    expect(t.periodo.roas).toBeCloseTo(roasDoCard, 10);
  });

  it("e com o imposto duplicado o número seria 12% menor", () => {
    const comImpostoDeNovo = 2841.13 / (814.8 / (1 - 0.1215));
    expect(Math.abs(comImpostoDeNovo - roasDoCard)).toBeGreaterThan(0.4);
  });
});

describe("REVERSÃO: período curto exibe janela parcial como cheia (AC6)", () => {
  const quatroDias: PontoDiario[] = [
    ponto("2026-08-05", 100, 100),
    ponto("2026-08-06", 100, 120),
    ponto("2026-08-07", 100, 140),
    ponto("2026-08-08", 100, 160),
  ];
  const t = calcularTendencia(quatroDias)!;

  it("7d num range de 4 dias vem MARCADA como parcial", () => {
    const j7 = t.janelas[2]!;
    expect(j7.parcial).toBe(true);
    expect(j7.diasCobertos).toBe(4);
    expect(j7.dias).toBe(7);
  });

  it("1d e 3d cabem no range e não são parciais", () => {
    expect(t.janelas[0]!.parcial).toBe(false);
    expect(t.janelas[1]!.parcial).toBe(false);
  });

  it("a 7d parcial repete o número do período — não inventa uma semana", () => {
    expect(t.janelas[2]!.revenue).toBe(t.periodo.revenue);
    expect(t.janelas[2]!.roas).toBeCloseTo(t.periodo.roas!, 10);
  });
});

describe("margem: soma dos dias, com o fee da plataforma", () => {
  const comFee: PontoDiario[] = [
    ponto("2026-08-07", 100, 300, 0.1),
    ponto("2026-08-08", 100, 400, 0.1),
  ];
  const t = calcularTendencia(comFee)!;

  it("Margem_2d = Σ(receita líquida) − Σ(investimento)", () => {
    // (300 + 400) × 0,9 − 200 = 430
    expect(t.janelas[1]!.margem).toBeCloseTo(430, 6);
  });

  it("margem negativa continua negativa — o card a pinta de vermelho", () => {
    const noVermelho = calcularTendencia([ponto("2026-08-08", 500, 100)])!;
    expect(noVermelho.janelas[0]!.margem).toBeCloseTo(-400, 6);
  });
});

describe("AC5 — a mesma tendência, por entidade", () => {
  const periodo = { inicio: "2026-08-02", fim: "2026-08-08" };

  it("a entidade usa a MESMA janela do bloco agregado", () => {
    const byDate = {
      "2026-08-07": { spend: 100, revenue: 200, margin: 100 },
      "2026-08-08": { spend: 100, revenue: 400, margin: 300 },
    };
    const t = tendenciaDaEntidade(byDate, periodo)!;
    expect(t.fim).toBe("2026-08-08");
    expect(t.janelas[0]!.roas).toBeCloseTo(4, 6);
    expect(t.janelas[1]!.roas).toBeCloseTo(3, 6);
  });

  /**
   * Uma campanha que parou no dia 4 não pode ter a "janela de 1 dia" ancorada
   * no dia 4 e aparecer ao lado de outra ancorada no dia 8 — as duas linhas da
   * tabela estariam falando de tempos diferentes com o mesmo rótulo.
   */
  it("entidade parada: a janela ancora no fim do PERÍODO, e vem vazia", () => {
    const byDate = { "2026-08-04": { spend: 100, revenue: 500, margin: 400 } };
    const t = tendenciaDaEntidade(byDate, periodo)!;
    expect(t.fim).toBe("2026-08-08");
    expect(t.janelas[0]!.roas).toBeNull(); // 1d: nada investido → célula vazia
    expect(t.janelas[0]!.spend).toBe(0);
    expect(t.janelas[2]!.roas).toBeCloseTo(5, 6); // 7d ainda alcança o dia 4
  });

  it("entidade nova NÃO dispara o aviso de janela parcial — aquilo é do período", () => {
    const byDate = { "2026-08-08": { spend: 50, revenue: 150, margin: 100 } };
    const t = tendenciaDaEntidade(byDate, periodo)!;
    expect(t.diasDoPeriodo).toBe(7);
    expect(t.janelas.every((j) => !j.parcial)).toBe(true);
  });

  it("entidade sem nenhum dia devolve null — a linha não aparece", () => {
    expect(tendenciaDaEntidade({}, periodo)).toBeNull();
  });
});

describe("as ausências, declaradas", () => {
  it("sem nenhum dia, não há tendência — `null`, não zero", () => {
    expect(calcularTendencia([])).toBeNull();
  });

  it("janela sem investimento tem ROAS nulo, não 0x", () => {
    const t = calcularTendencia([ponto("2026-08-08", 0, 500)])!;
    expect(t.janelas[0]!.roas).toBeNull();
  });

  it("direção só existe com as duas pontas, e empate não vira seta", () => {
    expect(direcao(2.4, 1.8)).toBe("sobe");
    expect(direcao(1.2, 1.8)).toBe("desce");
    expect(direcao(1.8, 1.8)).toBeNull();
    expect(direcao(null, 1.8)).toBeNull();
    expect(direcao(1.8, null)).toBeNull();
  });
});

// ============================================================================
// Story 29.57 — a âncora é o último dia FECHADO
//
// A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
//
// ⚠️ Todos os casos passam `ancoraMaxima` explícito. Depender do relógio faria
// esta suíte mudar de resultado à meia-noite — e o projeto já tem três testes
// date-dependent que quebram sozinhos no CI. O default (`ultimoDiaFechado()`)
// é exercido no `describe` do fuso, que é onde ele é o objeto do teste.
// ============================================================================

/** Uma semana em que o ÚLTIMO dia é parcial — o retrato do bug em produção. */
const SEMANA_COM_HOJE: PontoDiario[] = [
  ponto("2026-08-18", 1050, 2100),
  ponto("2026-08-19", 860, 1720),
  ponto("2026-08-20", 740, 1480),
  ponto("2026-08-21", 980, 1960),
  ponto("2026-08-22", 827, 1654),
  ponto("2026-08-23", 842, 1684),
  // 24/08 às 11h: 35% do investimento de um dia normal, e a planilha de vendas
  // ainda não recebeu nada. É este dia que sequestrava a janela de 1d.
  ponto("2026-08-24", 308, 0),
];

/** Ontem, do ponto de vista da série acima. */
const ONTEM = "2026-08-23";

describe("a âncora é o último dia fechado", () => {
  it("1d fala de ontem, não do dia em andamento", () => {
    const t = calcularTendencia(SEMANA_COM_HOJE, JANELAS_TENDENCIA, ONTEM)!;
    expect(t.ancora).toBe(ONTEM);
    // Com o defeito de volta a janela pegaria o dia parcial: spend 308,
    // revenue 0, ROAS 0.
    expect(t.janelas[0]!.spend).toBe(842);
    expect(t.janelas[0]!.revenue).toBe(1684);
    expect(t.janelas[0]!.roas).toBeCloseTo(2, 10);
  });

  it("3d e 7d também excluem o dia em andamento (AC2)", () => {
    const t = calcularTendencia(SEMANA_COM_HOJE, JANELAS_TENDENCIA, ONTEM)!;
    // 3d = 21, 22, 23 — sem o 24.
    expect(t.janelas[1]!.spend).toBe(980 + 827 + 842);
    // 7d = 18..23, seis dias fechados. O 24 não entra em nenhuma.
    expect(t.janelas[2]!.spend).toBe(1050 + 860 + 740 + 980 + 827 + 842);
    expect(t.janelas.every((j) => j.revenue > 0)).toBe(true);
  });

  it("as três janelas terminam no MESMO dia — nenhuma fica para trás", () => {
    const t = calcularTendencia(SEMANA_COM_HOJE, JANELAS_TENDENCIA, ONTEM)!;
    // Se só a de 1d fosse recortada, a de 3d carregaria o dia parcial e a
    // comparação entre elas — a única razão de estarem lado a lado — seria
    // inválida. 3d ⊃ 1d tem que valer nas somas.
    expect(t.janelas[1]!.spend).toBeGreaterThan(t.janelas[0]!.spend);
    expect(t.janelas[2]!.spend).toBeGreaterThan(t.janelas[1]!.spend);
    // E nenhuma delas pode conter o spend do dia parcial.
    expect(t.janelas[2]!.spend).not.toBe(
      1050 + 860 + 740 + 980 + 827 + 842 + 308,
    );
  });
});

describe("período que já acabou não é recortado", () => {
  it("filtro no passado ancora no fim DELE, não em ontem", () => {
    // A SEMANA termina em 08/08 e a âncora máxima é 23/08. Recortar aqui
    // faria a tendência falar de agosto enquanto os cards falam de julho —
    // exatamente o que o AC1 da 29.54 evitou, e que esta story não desfaz.
    const t = calcularTendencia(SEMANA, JANELAS_TENDENCIA, ONTEM)!;
    expect(t.ancora).toBe("2026-08-08");
    expect(t.janelas[0]!.revenue).toBe(300);
  });

  it("o `min` não vira `max`: a âncora nunca ultrapassa o fim do período", () => {
    const t = calcularTendencia(SEMANA, JANELAS_TENDENCIA, ONTEM)!;
    expect(t.ancora <= t.fim).toBe(true);
  });
});

describe("a coluna Período continua sendo o range inteiro (AC3)", () => {
  const t = calcularTendencia(SEMANA_COM_HOJE, JANELAS_TENDENCIA, ONTEM)!;

  it("Período inclui o dia em andamento — é o que o gestor filtrou", () => {
    // Recortá-la faria a tendência divergir dos cards de investimento, que
    // somam o dia corrente.
    expect(t.periodo.spend).toBe(1050 + 860 + 740 + 980 + 827 + 842 + 308);
    expect(t.fim).toBe("2026-08-24");
    expect(t.diasDoPeriodo).toBe(7);
  });

  it("mas as janelas têm um dia a menos de material (AC7)", () => {
    expect(t.diasFechados).toBe(6);
    // 7d num período de 7 dias com só 6 fechados É parcial, e precisa dizer.
    expect(t.janelas[2]!.parcial).toBe(true);
    expect(t.janelas[2]!.diasCobertos).toBe(6);
    // 1d e 3d têm material de sobra — o aviso não pode vazar para elas.
    expect(t.janelas[0]!.parcial).toBe(false);
    expect(t.janelas[1]!.parcial).toBe(false);
  });
});

describe("período sem nenhum dia fechado declara, não mente (AC5)", () => {
  it("filtro só do dia corrente devolve null", () => {
    const t = calcularTendencia([ponto("2026-08-24", 308, 0)], JANELAS_TENDENCIA, ONTEM);
    // Com o defeito de volta viria uma janela com ROAS 0 — um número que o
    // gestor leria como "despencou" quando o dia mal começou.
    expect(t).toBeNull();
  });

  it("o dia seguinte à âncora também não vira tendência", () => {
    expect(
      calcularTendencia([ponto("2026-09-01", 100, 500)], JANELAS_TENDENCIA, ONTEM),
    ).toBeNull();
  });
});

describe("a tendência por entidade usa a MESMA âncora (AC4)", () => {
  const periodoComHoje = { inicio: "2026-08-18", fim: "2026-08-24" };

  it("entidade que só gastou no dia parcial não inventa janela de 1d", () => {
    const byDate = { "2026-08-24": { spend: 308, revenue: 0, margin: -308 } };
    const t = tendenciaDaEntidade(byDate, periodoComHoje, JANELAS_TENDENCIA, ONTEM)!;
    expect(t.ancora).toBe(ONTEM);
    expect(t.janelas[0]!.spend).toBe(0);
    expect(t.janelas[0]!.roas).toBeNull();
  });

  it("duas entidades com fins diferentes ancoram no mesmo dia", () => {
    const cedo = { "2026-08-19": { spend: 100, revenue: 300, margin: 200 } };
    const tarde = { "2026-08-23": { spend: 100, revenue: 200, margin: 100 } };
    const a = tendenciaDaEntidade(cedo, periodoComHoje, JANELAS_TENDENCIA, ONTEM)!;
    const b = tendenciaDaEntidade(tarde, periodoComHoje, JANELAS_TENDENCIA, ONTEM)!;
    expect(a.ancora).toBe(b.ancora);
    expect(a.ancora).toBe(ONTEM);
  });
});

describe("o dia de negócio não é o do processo", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it("22h em São Paulo ainda é o mesmo dia, com o processo em UTC", () => {
    // 2026-08-24T01:30:00Z = 23h30 de 23/08 em São Paulo. Um `getDate()` no
    // processo em UTC devolveria 24; o dia de negócio é 23.
    process.env.TZ = "UTC";
    const instante = new Date("2026-08-24T01:30:00Z");
    expect(diaDeNegocio(instante)).toBe("2026-08-23");
    expect(ultimoDiaFechado(instante)).toBe("2026-08-22");
  });

  it("o mesmo instante dá o mesmo dia com o processo em Tóquio", () => {
    // O fuso do NAVEGADOR não pode mudar o que a tela mostra: dois gestores
    // lado a lado precisam ler a mesma tendência.
    process.env.TZ = "Asia/Tokyo";
    const instante = new Date("2026-08-24T01:30:00Z");
    expect(diaDeNegocio(instante)).toBe("2026-08-23");
    expect(ultimoDiaFechado(instante)).toBe("2026-08-22");
  });

  it("a virada do mês retrocede corretamente", () => {
    // 01/09 às 03:00Z = 00h de 01/09 em São Paulo. Ontem é 31/08, não 00/09.
    expect(ultimoDiaFechado(new Date("2026-09-01T03:00:00Z"))).toBe("2026-08-31");
  });
});

/**
 * Story 44.27 — com a janela alinhada, a Tendência 7D no seletor de 7 dias é
 * ESTRUTURALMENTE parcial, e precisa dizer isso.
 *
 * A âncora é o último dia FECHADO (ontem). Um seletor de 7 dias cobre
 * hoje−6..hoje, logo só SEIS deles estão fechados. A janela de 7 dias nunca
 * fecha ali — e antes da 44.27 ela fechava por acidente, porque a série trazia
 * um dia a mais vindo só do lado das vendas.
 *
 * Era esse dia órfão (receita sem custo) que produzia 1.61x onde os seletores
 * de 30d/90d, cobrindo os mesmos dias dos DOIS lados, produziam 1.36x.
 */
describe("Story 44.27 — janela alinhada e a parcial declarada", () => {
  const dia = (d: string, spend: number, revenue: number) => ({
    dateIso: d,
    spend,
    revenue,
    margin: revenue * 0.6 - spend,
  });

  /** Seletor de 7 dias, já ALINHADO: 01/09..07/09, hoje = 07/09. */
  const seletor7d = [
    dia("2026-09-01", 757.71, 1684.0),
    dia("2026-09-02", 812.21, 694.0),
    dia("2026-09-03", 630.26, 297.0),
    dia("2026-09-04", 510.81, 740.1),
    dia("2026-09-05", 523.28, 609.64),
    dia("2026-09-06", 687.93, 1988.0),
    dia("2026-09-07", 411.04, 347.0), // parcial, fora da âncora
  ];

  it("a janela de 7 dias se declara PARCIAL — só 6 dias fechados", () => {
    const t = calcularTendencia(seletor7d, [1, 3, 7], "2026-09-06")!;
    const j7 = t.janelas.find((x) => x.dias === 7)!;
    expect(j7.parcial).toBe(true);
    expect(j7.diasCobertos).toBe(6);
    expect(t.ancora).toBe("2026-09-06");
    expect(t.diasFechados).toBe(6);
  });

  /**
   * ⚠️ O teste que trava o defeito.
   *
   * Com o dia órfão (31/08: venda sem investimento, porque a janela do spend
   * não o alcançava), a janela de 7 dias soma receita a mais e o ROAS infla.
   */
  it("o dia órfão — receita sem custo — infla o ROAS, e por isso saiu da série", () => {
    const comOrfao = [dia("2026-08-31", 0, 297.0), ...seletor7d]; // spend 0: o bug
    const alinhado = [dia("2026-08-31", 724.59, 297.0), ...seletor7d]; // como deveria

    const roasOrfao = calcularTendencia(comOrfao, [7], "2026-09-06")!.janelas[0]!.roas!;
    const roasAlinhado = calcularTendencia(alinhado, [7], "2026-09-06")!.janelas[0]!.roas!;

    // O mesmo numerador, denominadores diferentes: o órfão infla.
    expect(roasOrfao).toBeGreaterThan(roasAlinhado);
    // E a inflação é material — o chamado media 1.61x contra 1.36x, +19%.
    expect(roasOrfao / roasAlinhado).toBeGreaterThan(1.15);
  });

  it("janela de 1 e 3 dias continuam fechando — elas cabem nos 6 dias", () => {
    const t = calcularTendencia(seletor7d, [1, 3, 7], "2026-09-06")!;
    expect(t.janelas.find((x) => x.dias === 1)!.parcial).toBe(false);
    expect(t.janelas.find((x) => x.dias === 3)!.parcial).toBe(false);
  });
});

/**
 * Story 44.27 AC6a — a Tendência 7D vista nos seletores de 30d/90d NÃO muda.
 *
 * Este é o teste que faltava, e o gate (QA-4427-01) mostrou por quê: o AC6
 * original dizia que "30d e 90d continuam com os mesmos números", o que é falso
 * para os CARDS — eles somavam faturamento de N+1 dias contra investimento de
 * N, e alinhar derruba o faturamento. No `pps1` o ROAS de 30 dias sai de 1.067x
 * para 0.912x, cruzando o ponto de equilíbrio.
 *
 * O que de fato não muda é a TENDÊNCIA de 7 dias vista desses seletores: eles
 * já cobriam 31/08 dos DOIS lados, então ela já emitia 1.36x e continua.
 *
 * A diferença entre os dois casos é a razão de o AC ter sido separado em
 * AC6a/AC6b — e é ela que este teste trava.
 */
describe("Story 44.27 AC6a — a Tendência 7D nos seletores longos não muda", () => {
  const dia = (d: string, spend: number, revenue: number) => ({
    dateIso: d,
    spend,
    revenue,
    margin: revenue * 0.6 - spend,
  });

  /**
   * Fixture do §2.2 do briefing, com o dia 31/08 presente e COMPLETO — que é o
   * que um seletor de 30d/90d entrega: 7 dias fechados de 31/08 a 06/09.
   */
  const seletorLongo = [
    dia("2026-08-29", 643.38, 500.0), // fora da janela de 7d, só para dar corpo
    dia("2026-08-30", 866.83, 700.0),
    dia("2026-08-31", 724.59, 297.0), // ← o dia que o seletor de 7d não alcança
    dia("2026-09-01", 757.71, 1684.0),
    dia("2026-09-02", 812.21, 694.0),
    dia("2026-09-03", 630.26, 297.0),
    dia("2026-09-04", 510.81, 740.1),
    dia("2026-09-05", 523.28, 609.64),
    dia("2026-09-06", 687.93, 1988.0),
    dia("2026-09-07", 411.04, 347.0), // parcial
  ];

  it("com 31/08 nos dois lados, a janela de 7 dias FECHA", () => {
    const t = calcularTendencia(seletorLongo, [1, 3, 7], "2026-09-06")!;
    const j7 = t.janelas.find((x) => x.dias === 7)!;
    expect(j7.parcial).toBe(false);
    expect(j7.diasCobertos).toBe(7);
  });

  it("e o ROAS bate com a soma de 31/08..06/09 — o 1.36x do briefing", () => {
    const t = calcularTendencia(seletorLongo, [7], "2026-09-06")!;
    const j7 = t.janelas[0]!;
    const dias7 = seletorLongo.filter((d) => d.dateIso >= "2026-08-31" && d.dateIso <= "2026-09-06");
    const spend = dias7.reduce((a, d) => a + d.spend, 0);
    const revenue = dias7.reduce((a, d) => a + d.revenue, 0);
    expect(j7.spend).toBeCloseTo(spend, 6);
    expect(j7.roas).toBeCloseTo(revenue / spend, 6);
    // ⚠️ Razão de somas — a janela inclui os 7 dias, 31/08 entre eles.
    expect(j7.spend).toBeCloseTo(4646.79, 1);
  });

  /**
   * ⚠️ O contraste que dá sentido ao AC6a.
   *
   * Sem o dia 31/08 (o que o seletor de 7 dias vê após a AC1), a mesma janela
   * se declara parcial. O número não é "o mesmo" nos dois seletores — o que é
   * o mesmo é o comportamento: cada um usa os dias que tem, e diz quantos são.
   */
  it("o mesmo cálculo, sem 31/08, se declara parcial — os seletores diferem e AMBOS estão certos", () => {
    const semODia = seletorLongo.filter((d) => d.dateIso >= "2026-09-01");
    const t = calcularTendencia(semODia, [7], "2026-09-06")!;
    expect(t.janelas[0]!.parcial).toBe(true);
    expect(t.janelas[0]!.diasCobertos).toBe(6);
  });
});
