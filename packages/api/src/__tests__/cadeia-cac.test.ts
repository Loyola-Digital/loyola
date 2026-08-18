import { describe, it, expect } from "vitest";
import {
  dePercentual,
  paraPercentual,
  classificarFamilia,
  agregar,
  calcularMetricas,
  cacReal,
  cplReal,
  custoDaCadeia,
  cliquesPorConversao,
  janelasDe7Dias,
  baseDaMetrica,
  selo,
  coberturaAtipica,
  mediana,
  quedaReal,
  ranquear,
  compostoNoTeto,
  decomporCPC,
  type DiaBruto,
  type Metricas,
  type ItemRanking,
} from "@loyola-x/shared";

/**
 * Story 44.6 — testes dourados da spec `epic-44-aba-inacio.md` §8.
 *
 * Estes valores são teste de REGRESSÃO. Se a implementação não devolver isto,
 * ajuste a implementação — nunca o teste. Revisar a spec é outra coisa, e
 * exige nova versão com álgebra ou medição anexada.
 */

/** Cenário da consultoria, escalado para dar inteiros (spec §8). */
const CENARIO: DiaBruto[] = [
  {
    date: "2026-05-12",
    spend: 200_000,
    impressions: 10_000_000,
    linkClicks: 200_000,
    landingPageViews: 160_000,
    checkouts: 3_840,
  },
];
const VENDAS_REAIS = 576;

const atual = () => calcularMetricas(agregar(CENARIO), "paga");

/** Teto do cenário: CPC 0,50 · Connect 0,90 · Conv. LP 0,053125. */
const TETO: Metricas = { cpm: 15, cpc: 0.5, ctr: 0.03, connectRate: 0.9, convLP: 0.053125 };

const perto = (v: number | null, esperado: number, casas = 2) => {
  expect(v).not.toBeNull();
  expect(Number(v!.toFixed(casas))).toBe(Number(esperado.toFixed(casas)));
};

describe("§8 — o cenário derivado bate com a spec", () => {
  it("os brutos produzem exatamente as métricas do cenário", () => {
    const m = atual();
    perto(m.cpm, 20);
    perto(m.cpc, 1.0);
    perto(m.ctr, 0.02, 4);
    perto(m.connectRate, 0.8, 4);
    perto(m.convLP, 0.024, 4);
  });
});

describe("§8 — testes dourados", () => {
  it("CAC real = spend ÷ vendas = R$ 347,22", () => {
    perto(cacReal(200_000, VENDAS_REAIS), 347.22);
  });

  it("custo por checkout atual = R$ 52,08", () => {
    perto(custoDaCadeia(atual()), 52.08);
  });

  it("custo por checkout no teto = R$ 10,46", () => {
    perto(custoDaCadeia(TETO), 10.46);
  });

  it("queda composta = −79,92%", () => {
    perto(compostoNoTeto(atual(), TETO)! * 100, 79.92);
  });

  it("queda por Conv. LP = −54,82%", () => {
    perto(quedaReal("convLP", 0.024, 0.053125)! * 100, 54.82);
  });

  it("queda por CPC = −50,00%", () => {
    perto(quedaReal("cpc", 1.0, 0.5)! * 100, 50.0);
  });

  it("queda por Connect Rate = −11,11%", () => {
    perto(quedaReal("connectRate", 0.8, 0.9)! * 100, 11.11);
  });

  it("ordem do ranking: Conv. LP › CPC › Connect", () => {
    const itens: ItemRanking[] = [
      { metrica: "connectRate", atual: 0.8, teto: 0.9, queda: quedaReal("connectRate", 0.8, 0.9)!, posicao: 2 },
      { metrica: "cpc", atual: 1.0, teto: 0.5, queda: quedaReal("cpc", 1.0, 0.5)!, posicao: 1 },
      { metrica: "convLP", atual: 0.024, teto: 0.053125, queda: quedaReal("convLP", 0.024, 0.053125)!, posicao: 3 },
    ];
    expect(ranquear(itens).map((i) => i.metrica)).toEqual(["convLP", "cpc", "connectRate"]);
  });

  /** A identidade que motivou tirar a Conv. Checkout da cadeia (spec §2.2). */
  it("telescopagem: CPC ÷ (Connect × Conv.LP) == spend ÷ checkouts", () => {
    const a = agregar(CENARIO);
    perto(custoDaCadeia(atual()), a.spend / a.checkouts);
    perto(custoDaCadeia(atual()), 52.08);
  });

  it("decomposição do CPC: só CTR, só CPM, os dois", () => {
    const d = decomporCPC(20, 15, 0.02, 0.03)!;
    perto(d.soCtr! * 100, 33.33);
    perto(d.soCpm! * 100, 25.0);
    perto(d.ambos! * 100, 50.0);
  });

  it("plausibilidade: 52 cliques por checkout", () => {
    perto(cliquesPorConversao(atual()), 52.08);
  });
});

describe("unidades — a fronteira (§2.5)", () => {
  it("dePercentual converte, paraPercentual desconverte", () => {
    expect(dePercentual(2)).toBe(0.02);
    expect(paraPercentual(0.02)).toBe(2);
    expect(dePercentual(null)).toBeNull();
    expect(dePercentual(undefined)).toBeNull();
  });

  /**
   * A fonte nº 1 de erro da spec: taxa em ponto percentual dentro da conta.
   * O teste de plausibilidade é o que denuncia — o número fica absurdo.
   */
  it("taxa em ponto percentual dentro da conta destrói o resultado por 10.000×", () => {
    const certo = custoDaCadeia({ cpm: 20, cpc: 1, ctr: 0.02, connectRate: 0.8, convLP: 0.024 })!;
    const errado = custoDaCadeia({ cpm: 20, cpc: 1, ctr: 2, connectRate: 80, convLP: 2.4 })!;
    perto(certo, 52.08);
    expect(errado).toBeLessThan(0.01);
    // e a plausibilidade denuncia: cliques por conversão vira fração
    expect(cliquesPorConversao({ cpm: 20, cpc: 1, ctr: 2, connectRate: 80, convLP: 2.4 })!).toBeLessThan(1);
  });
});

describe("família — classificação própria (§1)", () => {
  it("paga cobre os quatro tipos, inclusive sales e event", () => {
    for (const t of ["paid", "sales", "event_capture", "event"]) {
      expect(classificarFamilia(t)).toBe("paga");
    }
  });

  it("gratuita cobre free e cpl", () => {
    expect(classificarFamilia("free")).toBe("gratuita");
    expect(classificarFamilia("cpl")).toBe("gratuita");
  });

  /** Fora da aba é resultado, não erro — a spec manda reportar, não inventar. */
  it("lyrio, comercial e debriefing ficam fora, e tipo desconhecido também", () => {
    for (const t of ["lyrio", "comercial", "debriefing", "tipo_novo", "", null, undefined]) {
      expect(classificarFamilia(t)).toBeNull();
    }
  });
});

describe("razão de somas, nunca média de médias (§2.6)", () => {
  /** Os dois métodos dão números DIFERENTES — é por isso que a regra existe. */
  it("razão de somas ≠ média das taxas diárias", () => {
    const dias: DiaBruto[] = [
      { date: "2026-05-01", spend: 100, impressions: 10_000, linkClicks: 100, landingPageViews: 90, checkouts: 9 },
      { date: "2026-05-02", spend: 100, impressions: 1_000, linkClicks: 10, landingPageViews: 1, checkouts: 0 },
    ];
    const razaoDeSomas = calcularMetricas(agregar(dias), "paga").connectRate!;
    const mediaDeMedias = (90 / 100 + 1 / 10) / 2;
    perto(razaoDeSomas, 91 / 110, 6);
    expect(Number(razaoDeSomas.toFixed(4))).not.toBe(Number(mediaDeMedias.toFixed(4)));
  });

  it("connectRate divide por linkClicks — cliques totais não entram no tipo", () => {
    const m = calcularMetricas(
      agregar([{ date: "2026-05-01", spend: 10, impressions: 1000, linkClicks: 100, landingPageViews: 80, checkouts: 5 }]),
      "paga",
    );
    perto(m.connectRate, 0.8, 4);
  });

  it("família gratuita usa leads atribuídos no numerador da Conv. LP", () => {
    const dia: DiaBruto = {
      date: "2026-05-01", spend: 100, impressions: 1000, linkClicks: 100,
      landingPageViews: 80, checkouts: 5, leadsAtribuidos: 20,
    };
    perto(calcularMetricas(agregar([dia]), "gratuita").convLP, 0.25, 4);
    perto(calcularMetricas(agregar([dia]), "paga").convLP, 0.0625, 4);
  });
});

/**
 * QA-446-01 — o gate pegou `leadsAtribuidos` ausente virando `0`. O estrago não
 * era no custo (saía `null` de qualquer jeito): era no RANKING, onde uma etapa
 * sem planilha de leads ligada liderava a lista prometendo −100% de custo.
 */
describe("QA-446-01 — lead ausente ≠ zero lead", () => {
  const semLead: DiaBruto = {
    date: "2026-05-01", spend: 100, impressions: 1000, linkClicks: 100,
    landingPageViews: 80, checkouts: 5,
  };
  const zeroLead: DiaBruto = { ...semLead, leadsAtribuidos: 0 };

  it("campo ausente devolve convLP null, campo presente com 0 devolve 0", () => {
    expect(calcularMetricas(agregar([semLead]), "gratuita").convLP).toBeNull();
    expect(calcularMetricas(agregar([zeroLead]), "gratuita").convLP).toBe(0);
  });

  it("os dois casos são distinguíveis — é a distinção que não se recupera", () => {
    const ausente = calcularMetricas(agregar([semLead]), "gratuita").convLP;
    const zero = calcularMetricas(agregar([zeroLead]), "gratuita").convLP;
    expect(ausente).not.toBe(zero);
  });

  it("agregar só soma os dias que trouxeram o campo", () => {
    const misto = agregar([semLead, { ...semLead, leadsAtribuidos: 7 }, semLead]);
    expect(misto.leadsAtribuidos).toBe(7);
    expect(agregar([semLead, semLead]).leadsAtribuidos).toBeNull();
  });

  /** A consequência que o gate mediu: sem o fix, esta etapa lidera o ranking. */
  it("etapa sem dado de lead NÃO produz queda de 100% — não há o que ranquear", () => {
    const m = calcularMetricas(agregar([semLead]), "gratuita");
    expect(m.convLP).toBeNull();
    // Sem número não há item de ranking. Com o defeito, `convLP` era 0 e
    // `quedaReal("convLP", 0, 0.05)` dava 1,0 — 100% de queda prometida.
    expect(quedaReal("convLP", 0, 0.05)).toBe(1);
    expect(m.convLP).not.toBe(0);
  });

  it("família paga não é afetada — checkouts é obrigatório, zero é zero legítimo", () => {
    const semCheckout: DiaBruto = { ...semLead, checkouts: 0 };
    expect(calcularMetricas(agregar([semCheckout]), "paga").convLP).toBe(0);
  });

  it("agregadoVazio começa com leadsAtribuidos null, não 0", () => {
    expect(agregar([]).leadsAtribuidos).toBeNull();
  });
});

describe("ausência é declarada, nunca zero (§7.4)", () => {
  it("denominador zero devolve null em toda métrica", () => {
    const m = calcularMetricas(agregar([]), "paga");
    expect(m.cpm).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.ctr).toBeNull();
    expect(m.connectRate).toBeNull();
    expect(m.convLP).toBeNull();
  });

  it("cacReal e cplReal devolvem null sem vendas/leads, não zero", () => {
    expect(cacReal(1000, 0)).toBeNull();
    expect(cplReal(1000, 0)).toBeNull();
  });

  it("custoDaCadeia devolve null se algum elo faltar", () => {
    expect(custoDaCadeia({ cpm: 20, cpc: null, ctr: 0.02, connectRate: 0.8, convLP: 0.024 })).toBeNull();
    expect(custoDaCadeia({ cpm: 20, cpc: 1, ctr: 0.02, connectRate: 0, convLP: 0.024 })).toBeNull();
  });

  /** O caso que a medição encontrou: 3 das 10 etapas pagas têm cobertura 0%. */
  it("cacReal sai mesmo quando a atribuição por campanha é zero", () => {
    perto(cacReal(200_000, 576), 347.22);
  });
});

describe("janela de 7 dias — por DATA, nunca por linha (§4)", () => {
  /**
   * O caso que `ROWS` erraria. Série com gap de 10 dias: contando 7 LINHAS,
   * a janela cobriria 16 dias de calendário e a base sairia inflada.
   */
  it("série com gap: a janela não passa de 7 dias de calendário", () => {
    const dias: DiaBruto[] = [
      { date: "2026-05-01", spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1 },
      { date: "2026-05-02", spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1 },
      { date: "2026-05-03", spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1 },
      // gap de 10 dias
      { date: "2026-05-14", spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1 },
      { date: "2026-05-15", spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1 },
    ];
    const js = janelasDe7Dias(dias);
    const ultima = js[js.length - 1]!;
    expect(ultima.ate).toBe("2026-05-15");
    expect(ultima.de).toBe("2026-05-09");
    // Só 14 e 15 caem na janela — 2 dias, não 5.
    expect(ultima.agregado.dias).toBe(2);
    expect(ultima.agregado.impressions).toBe(2000);
  });

  it("série contínua: a janela cheia soma exatamente 7 dias", () => {
    const dias: DiaBruto[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      spend: 10, impressions: 1000, linkClicks: 10, landingPageViews: 8, checkouts: 1,
    }));
    const ultima = janelasDe7Dias(dias).at(-1)!;
    expect(ultima.agregado.dias).toBe(7);
    expect(ultima.de).toBe("2026-05-04");
    expect(ultima.ate).toBe("2026-05-10");
  });

  it("série vazia devolve lista vazia, não janela zerada", () => {
    expect(janelasDe7Dias([])).toEqual([]);
  });
});

describe("selo de confiança (§4.1)", () => {
  it("os pisos de impressões valem para CPM, CPC e CTR", () => {
    for (const m of ["cpm", "cpc", "ctr"] as const) {
      expect(selo(m, 30_000)).toBe("alta");
      expect(selo(m, 10_000)).toBe("baixa");
      expect(selo(m, 9_999)).toBeNull();
    }
  });

  it("Connect Rate conta link clicks; Conv. LP conta LP views", () => {
    expect(selo("connectRate", 300)).toBe("alta");
    expect(selo("connectRate", 100)).toBe("baixa");
    expect(selo("connectRate", 99)).toBeNull();
    expect(selo("convLP", 300)).toBe("alta");
    expect(selo("convLP", 150)).toBe("baixa");
    expect(selo("convLP", 149)).toBeNull();
  });

  it("baseDaMetrica aponta para o denominador certo de cada métrica", () => {
    const a = agregar(CENARIO);
    expect(baseDaMetrica("cpm", a)).toBe(10_000_000);
    expect(baseDaMetrica("connectRate", a)).toBe(200_000);
    expect(baseDaMetrica("convLP", a)).toBe(160_000);
  });

  it("campanha abaixo do piso não concorre ao teto", () => {
    expect(selo("convLP", 100)).toBeNull();
  });
});

describe("guarda de cobertura atípica — família gratuita (@po)", () => {
  /**
   * Sem a guarda, a "melhor janela" pode ser a semana de melhor RASTREIO.
   * Uma campanha que foi de 52% para 95% exibiria salto de 1,8× sem nada
   * mudar na página — e o selo não pega, porque conta LP views.
   */
  it("janela mais de 20 p.p. abaixo da mediana não concorre", () => {
    expect(coberturaAtipica(0.52, 0.9)).toBe(true);
    expect(coberturaAtipica(0.75, 0.9)).toBe(false);
  });

  it("cobertura ACIMA da mediana nunca é atípica — é rastreio melhor", () => {
    expect(coberturaAtipica(0.99, 0.6)).toBe(false);
  });

  it("exatamente 20 p.p. abaixo ainda concorre — o corte é estrito", () => {
    expect(coberturaAtipica(0.7, 0.9)).toBe(false);
  });

  it("mediana com número par e ímpar de janelas", () => {
    expect(mediana([0.5, 0.9])).toBe(0.7);
    expect(mediana([0.5, 0.8, 0.9])).toBe(0.8);
    expect(mediana([])).toBeNull();
  });
});

describe("ranking (§3)", () => {
  it("métrica já no teto fica fora da ordenação", () => {
    const itens: ItemRanking[] = [
      { metrica: "cpc", atual: 1, teto: 1, queda: 0, posicao: 1 },
      { metrica: "convLP", atual: 0.02, teto: 0.04, queda: 0.5, posicao: 3 },
    ];
    expect(ranquear(itens).map((i) => i.metrica)).toEqual(["convLP"]);
  });

  /** Empate desempata pela posição na cadeia, do início do funil para o fim. */
  it("empate técnico desempata pela posição na cadeia", () => {
    const itens: ItemRanking[] = [
      { metrica: "convLP", atual: 0.02, teto: 0.04, queda: 0.5, posicao: 3 },
      { metrica: "cpc", atual: 1, teto: 0.5, queda: 0.5, posicao: 1 },
      { metrica: "connectRate", atual: 0.5, teto: 1, queda: 0.5, posicao: 2 },
    ];
    expect(ranquear(itens).map((i) => i.metrica)).toEqual(["cpc", "connectRate", "convLP"]);
  });

  /**
   * A correção que a spec §3 exige: `teto/atual − 1` é o AUMENTO da métrica,
   * não a queda do custo. O ranking sai igual, as magnitudes saem otimistas.
   */
  it("queda real difere do aumento da métrica que o deck usava", () => {
    const quedaCorreta = quedaReal("convLP", 0.024, 0.053125)!;
    const aumentoDoDeck = 0.053125 / 0.024 - 1;
    perto(quedaCorreta * 100, 54.82);
    perto(aumentoDoDeck * 100, 121.35);
    expect(quedaCorreta).toBeLessThan(aumentoDoDeck);
  });

  it("direção: menor-é-melhor e maior-é-melhor usam fórmulas diferentes", () => {
    perto(quedaReal("cpc", 2, 1)!, 0.5, 4);
    perto(quedaReal("connectRate", 0.5, 1)!, 0.5, 4);
  });

  it("queda com teto ou atual zerado devolve null, não Infinity", () => {
    expect(quedaReal("connectRate", 0.5, 0)).toBeNull();
    expect(quedaReal("cpc", 0, 1)).toBeNull();
  });

  it("CPM e CTR não entram no composto — só CPC, Connect e Conv. LP", () => {
    const semCpmCtr = compostoNoTeto(
      { ...atual(), cpm: 999, ctr: 999 },
      { ...TETO, cpm: 1, ctr: 1 },
    );
    perto(semCpmCtr! * 100, 79.92);
  });
});
