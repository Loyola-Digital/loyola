/**
 * Story 29.54 — verificação por reversão.
 *
 * A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
 * Cada teste tem que FALHAR com o defeito de volta; um teste que sobrevive à
 * reversão é decorativo.
 */
import { describe, it, expect } from "vitest";
import {
  calcularTendencia,
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
