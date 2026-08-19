import { describe, it, expect } from "vitest";
import {
  benchmarkConvLP,
  benchmarkDaMetrica,
  montarLinha,
  montarTabela,
  ORDEM_DA_TABELA,
  BENCHMARK_CTR,
  BENCHMARK_CONNECT_RATE,
  type PayloadDaAba,
} from "@/lib/utils/cadeia-cac-view";

/**
 * Story 44.9 AC8 — a lógica que a aba deriva do payload.
 *
 * O que estes testes travam é a fronteira: o que é constante da spec (fica
 * aqui), o que é mediana (vem do endpoint) e o que NÃO tem alvo — com o motivo,
 * porque cada motivo pede uma ação diferente do usuário.
 *
 * ⚠️ Verificados por REVERSÃO.
 */

const base: PayloadDaAba = {
  familia: "paga",
  atuais: { cpm: 20, cpc: 1, ctr: 0.02, connectRate: 0.8, convLP: 0.024 },
  tetos: {
    cpm: { valor: 15 },
    cpc: { valor: 0.5 },
    ctr: { valor: 0.03 },
    connectRate: { valor: 0.9 },
    convLP: { valor: 0.053125 },
  },
  benchmarks: {
    medianas: { cpm: 18, cpc: 0.9, ctr: null, connectRate: null, convLP: null },
    campanhasElegiveis: { cpm: 7, cpc: 7 },
  },
  lpTemVsl: true,
  ticketMedioManual: 200,
};

describe("benchmarkConvLP — a spec §5 só vale com VSL", () => {
  it("ticket ACIMA de R$147 com VSL usa 4%", () => {
    expect(benchmarkConvLP(true, 200)).toEqual({ valor: 0.04, motivo: null });
  });

  it("ticket ABAIXO de R$147 com VSL usa 7,5%", () => {
    expect(benchmarkConvLP(true, 97)).toEqual({ valor: 0.075, motivo: null });
  });

  it("exatamente R$147 cai no lado de baixo — o corte é ESTRITO", () => {
    // A spec escreve "4% se ticket > R$147". 147 não é > 147.
    expect(benchmarkConvLP(true, 147).valor).toBe(0.075);
    expect(benchmarkConvLP(true, 147.01).valor).toBe(0.04);
  });

  it("SEM VSL não tem benchmark, e o motivo diz que é resposta final", () => {
    expect(benchmarkConvLP(false, 200)).toEqual({ valor: null, motivo: "semVsl" });
  });

  it("VSL NÃO RESPONDIDO é motivo diferente de 'não tem VSL'", () => {
    // Os dois levam a "sem benchmark", mas um pede que alguém responda e o
    // outro é definitivo. Colapsar os dois some com a ação.
    expect(benchmarkConvLP(null, 200)).toEqual({ valor: null, motivo: "vslNaoRespondido" });
    expect(benchmarkConvLP(undefined, 200).motivo).toBe("vslNaoRespondido");
    expect(benchmarkConvLP(false, 200).motivo).toBe("semVsl");
  });

  it("com VSL mas SEM ticket não dá para escolher entre 4% e 7,5%", () => {
    expect(benchmarkConvLP(true, null)).toEqual({ valor: null, motivo: "semTicket" });
  });
});

describe("benchmarkDaMetrica — o que é constante e o que é mediana", () => {
  it("CTR e Connect Rate são CONSTANTES da spec, não medianas", () => {
    const ctr = benchmarkDaMetrica("ctr", base);
    expect(ctr).toEqual({
      valor: BENCHMARK_CTR,
      origem: "constante",
      campanhas: null,
      motivo: null,
    });
    expect(benchmarkDaMetrica("connectRate", base).valor).toBe(BENCHMARK_CONNECT_RATE);
  });

  it("CPM e CPC vêm da mediana do payload, com a contagem de campanhas", () => {
    const cpc = benchmarkDaMetrica("cpc", base);
    expect(cpc.valor).toBe(0.9);
    expect(cpc.origem).toBe("mediana-historica");
    // Sem a contagem, uma mediana de 2 campanhas parece tão sólida quanto uma de 40.
    expect(cpc.campanhas).toBe(7);
  });

  it("mediana ausente vira motivo, não zero", () => {
    const semMediana = { ...base, benchmarks: { medianas: { cpc: null } } };
    const r = benchmarkDaMetrica("cpc", semMediana);
    expect(r.valor).toBeNull();
    expect(r.motivo).toBe("semBenchmark");
  });

  it("família GRATUITA usa mediana para Conv. LP, não os 4%/7,5%", () => {
    // Lá o elo é Conv. LP→lead; dar a ela um alvo de checkout seria outro número.
    const gratuita: PayloadDaAba = {
      ...base,
      familia: "gratuita",
      benchmarks: { medianas: { convLP: 0.31 }, campanhasElegiveis: { convLP: 4 } },
    };
    const r = benchmarkDaMetrica("convLP", gratuita);
    expect(r.valor).toBe(0.31);
    expect(r.origem).toBe("mediana-historica");
  });
});

describe("montarLinha — alvo vigente e selo", () => {
  it("com teto, o alvo é o TETO e o benchmark fica só como referência", () => {
    const l = montarLinha("cpc", base);
    expect(l.teto).toBe(0.5);
    expect(l.benchmark).toBe(0.9);
    expect(l.alvo).toBe(0.5); // o teto vence
  });

  it("sem teto, o alvo passa a ser o benchmark (spec §6)", () => {
    const semTeto: PayloadDaAba = {
      ...base,
      tetos: { cpc: { valor: null, motivo: "baseInsuficiente" } },
    };
    const l = montarLinha("cpc", semTeto);
    expect(l.alvo).toBe(0.9);
    expect(l.motivoDoTeto).toBe("baseInsuficiente");
  });

  it("⚠️ o selo do CPC respeita a direção — estar ACIMA do alvo é ruim", () => {
    // CPC atual 1,00 contra teto 0,50: 100% acima. Vermelho.
    expect(montarLinha("cpc", base).selo).toBe("vermelho");
    // E um CPC abaixo do alvo é verde.
    const bom = { ...base, atuais: { ...base.atuais, cpc: 0.4 } };
    expect(montarLinha("cpc", bom).selo).toBe("verde");
  });

  it("o selo do Connect Rate respeita a direção oposta", () => {
    // 0,80 contra alvo 0,90 = 11% abaixo → dentro dos 15% → amarelo.
    expect(montarLinha("connectRate", base).selo).toBe("amarelo");
  });

  it("sem teto E sem benchmark não há alvo nem selo — com motivo", () => {
    const nada: PayloadDaAba = {
      familia: "paga",
      atuais: { cpc: 1 },
      tetos: { cpc: { valor: null, motivo: "semDados" } },
      benchmarks: { medianas: { cpc: null } },
    };
    const l = montarLinha("cpc", nada);
    expect(l.alvo).toBeNull();
    expect(l.selo).toBeNull();
    expect(l.motivoSemAlvo).toBe("semBenchmark");
  });

  it("Conv. LP sem VSL fica sem alvo mesmo COM teto? Não — o teto vence", () => {
    // O benchmark é que depende do VSL. Havendo teto, ele é o alvo de qualquer jeito.
    const semVsl: PayloadDaAba = { ...base, lpTemVsl: false };
    const l = montarLinha("convLP", semVsl);
    expect(l.benchmark).toBeNull();
    expect(l.alvo).toBe(0.053125);
    expect(l.selo).not.toBeNull();
  });

  it("as taxas ficam em DECIMAL — nada aqui multiplica por 100", () => {
    const l = montarLinha("ctr", base);
    expect(l.atual).toBe(0.02);
    expect(l.benchmark).toBe(0.02);
    expect(l.atual).toBeLessThan(1);
  });
});

describe("montarTabela — a cadeia na ordem do funil", () => {
  it("devolve as 5 métricas na ordem da cadeia", () => {
    const t = montarTabela(base);
    expect(t.map((l) => l.metrica)).toEqual(["cpm", "ctr", "cpc", "connectRate", "convLP"]);
    expect(ORDEM_DA_TABELA).toHaveLength(5);
  });

  it("payload vazio não quebra — devolve 5 linhas sem alvo", () => {
    const t = montarTabela({ familia: "paga" });
    expect(t).toHaveLength(5);
    expect(t.every((l) => l.atual === null)).toBe(true);
    expect(t.every((l) => l.selo === null)).toBe(true);
  });
});
