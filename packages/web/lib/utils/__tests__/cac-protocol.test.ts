import { describe, it, expect } from "vitest";
import {
  targetCacDeck,
  killContinueThreshold,
  compareToTarget,
  assertRate,
  assertCostRate,
  roundMoney,
  ProtocolViolation,
  SCOPE_WARNING_D7,
  type TargetCacInputs,
} from "../cac-protocol";

/**
 * Story 29.35 (AC8) — paridade com `cac_engine.py`.
 *
 * Os valores esperados aqui não são invenção deste teste: foram produzidos
 * executando a suíte de referência do protocolo (`python3 cac_engine.py`,
 * 100% de aderência, exit 0) em 2026-08-04. Se um destes números mudar, ou o
 * port divergiu do engine, ou o protocolo foi revisado — nos dois casos a
 * mudança precisa ser deliberada, não silenciosa.
 */

/** Cenário canônico do protocolo: ticket R$450. */
const PROTOCOL_INPUTS: TargetCacInputs = {
  ticket: 450,
  ticketBasis: "GROSS",
  margemDesejada: 0.15,
  imposto: 0.1,
  gatewayPct: 0.0699,
  // Story 29.39 — o gateway de pagamento passou de R$/transação a fração do
  // faturamento. 1/450 é EXATAMENTE o R$1,00 do cenário do protocolo sobre o
  // ticket de 450, o que mantém este fixture ancorado no caso de referência
  // original: mesmo CAC alvo (R$204,55), semântica nova.
  gatewayPctVar: 1 / 450,
  cmv: 60,
  reembolso: 0.08,
  chargeback: 0.01,
};

describe("targetCacDeck — paridade com cac_engine.py (AC8)", () => {
  it("reproduz o CAC alvo de referência: R$ 204,55", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    expect(r.value).toBe(204.55);
    expect(r.status).toBe("DERIVED");
    expect(r.missing).toHaveLength(0);
  });

  it("arredonda SÓ no fim (ROUND-01) — o gateway exato é 32,455, não 32,46", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    // Story 29.39: duas linhas de gateway, somadas aqui só para a asserção. Na
    // tela elas permanecem separadas — é o que mantém rastreável qual mudou.
    const plataforma = r.lines.find((l) => l.label === "− Gateway plataforma")!.value;
    const pagamento = r.lines.find((l) => l.label === "− Gateway pagamento")!.value;
    // 450 × 0,0699 + 450 × (1/450) = 31,455 + 1 = 32,455. A fonte reporta
    // R$204,54 porque arredonda ISTO para 32,46 antes de subtrair; nós não.
    expect(plataforma + pagamento).toBeCloseTo(-32.455, 3);
    // Prova de que a diferença de R$0,01 vem daí:
    expect(roundMoney(450 - 67.5 - 45 - 32.46 - 60 - 36 - 4.5)).toBe(204.54);
  });

  it("expõe o memorial linha a linha, não só o resultado", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    expect(r.lines.map((l) => l.label)).toEqual([
      "Ticket médio",
      "− Margem desejada",
      "− Imposto",
      "− Gateway plataforma",
      "− Gateway pagamento",
      "− CMV",
      "− Reembolso",
      "− Chargeback",
    ]);
    expect(r.expression).toContain("= 204.55");
  });

  it("carrega o aviso de escopo D7 — o CAC alvo não cobre equipe/ferramentas/comissão", () => {
    expect(targetCacDeck(PROTOCOL_INPUTS).caveats).toContain(SCOPE_WARNING_D7);
  });

  it("limiar de kill/continue: 1,3 × alvo = R$ 265,91", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    // Do valor EXATO (204,545), nunca do exibido: 204,545 × 1,3 = 265,9085.
    expect(killContinueThreshold(r.valueExact)).toBe(265.91);
    // Prova de que derivar do arredondado divergiria — é o erro que ROUND-01
    // existe para impedir, e que este teste pegou no primeiro port.
    expect(killContinueThreshold(204.55)).toBe(265.92);
  });
});

describe("Story 29.39 — gateway como fração do faturamento", () => {
  it("gateway de 2,5% dá CAC alvo de R$ 194,30 (conferido no cac_engine.py)", () => {
    // Valor gerado rodando o engine de referência com gateway_fixed = 450×0,025,
    // não derivado à mão. Exato: 194,295.
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: 0.025 });
    expect(r.value).toBe(194.3);
    expect(r.valueExact).toBeCloseTo(194.295, 3);
    expect(killContinueThreshold(r.valueExact)).toBe(252.58);
  });

  it("escala com o ticket — que é a razão de a mudança existir", () => {
    // Uma parcela FIXA não muda quando o ticket dobra; uma percentual sim. Se
    // este teste falhar, o campo voltou a ser tratado como valor absoluto.
    const base = targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: 0.025 });
    const dobro = targetCacDeck({ ...PROTOCOL_INPUTS, ticket: 900, gatewayPctVar: 0.025 });
    const gwBase = base.lines.find((l) => l.label === "− Gateway pagamento")!.value;
    const gwDobro = dobro.lines.find((l) => l.label === "− Gateway pagamento")!.value;
    expect(gwDobro).toBeCloseTo(gwBase * 2, 6);
  });

  it("as duas deduções de gateway ficam separadas no memorial", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: 0.025 });
    const labels = r.lines.map((l) => l.label);
    expect(labels).toContain("− Gateway plataforma");
    expect(labels).toContain("− Gateway pagamento");
    // Colapsá-las numa linha só daria o mesmo total e esconderia a origem.
    expect(labels.filter((l) => l.includes("Gateway"))).toHaveLength(2);
  });

  it("ausente é MISSING nomeado, nunca zero (GR-01)", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: null });
    expect(r.value).toBeNull();
    expect(r.status).toBe("MISSING");
    expect(r.missing).toContain("gateway de pagamento %");
  });

  it("em pontos percentuais aborta, como as demais frações (U-01)", () => {
    expect(() => targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: 2.5 })).toThrow(
      ProtocolViolation,
    );
  });
});

describe("QA-05/QA-06 — zero é configuração real em CUSTO, não erro", () => {
  it("CMV zero é o caso REAL desta operação, não uma borda", () => {
    // Confirmado pelo dono do produto em 2026-08-05: "CMV zero em todos os
    // nossos casos". Produto digital não tem custo unitário. Se este teste
    // falhar, o cenário PADRÃO do projeto parou de calcular.
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, cmv: 0 });
    expect(r.status).toBe("DERIVED");
    expect(r.value).not.toBeNull();
    expect(r.missing).toHaveLength(0);
  });

  it("gateway de pagamento 0% é aceito — não se paga taxa que não existe", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, gatewayPctVar: 0 });
    expect(r.status).toBe("DERIVED");
    // A linha continua no memorial, valendo zero: some-la esconderia que a
    // dedução foi considerada e deu zero.
    const linha = r.lines.find((l) => l.label === "− Gateway pagamento")!;
    expect(linha.value).toBe(0);
    // QA-07: zero POSITIVO. `toBe` usa Object.is, então isto reprova `-0`, que
    // é o que o formatador BRL transformava em "-R$ 0,00".
    expect(Object.is(linha.value, -0)).toBe(false);
  });

  it("imposto zero (isenção) é aceito", () => {
    expect(targetCacDeck({ ...PROTOCOL_INPUTS, imposto: 0 }).status).toBe("DERIVED");
  });

  it("MARGEM zero continua abortando — ali zero é erro de preenchimento", () => {
    expect(() => targetCacDeck({ ...PROTOCOL_INPUTS, margemDesejada: 0 })).toThrow(
      ProtocolViolation,
    );
  });

  it("a cadeia de CONVERSÃO segue estrita: zero lá é etapa não medida", () => {
    // É a razão original de U-01 e não muda. Se este teste falhar, alguém
    // estendeu `assertCostRate` para além de custo.
    expect(() => assertRate(0, "play rate")).toThrow(ProtocolViolation);
  });

  it("assertCostRate ainda rejeita negativo e ponto percentual", () => {
    expect(() => assertCostRate(-0.01, "gateway")).toThrow(/fora de \[0, 1\]/);
    expect(() => assertCostRate(2.5, "gateway")).toThrow(/pontos percentuais/);
    expect(assertCostRate(0, "gateway")).toBe(0);
    expect(assertCostRate(1, "gateway")).toBe(1);
  });
});

describe("QA-07 — nenhuma linha do memorial carrega zero negativo", () => {
  it("todas as deduções zeradas saem como zero POSITIVO", () => {
    const r = targetCacDeck({
      ...PROTOCOL_INPUTS,
      imposto: 0,
      gatewayPct: 0,
      gatewayPctVar: 0,
      cmv: 0,
    });
    const negativos = r.lines.filter((l) => Object.is(l.value, -0)).map((l) => l.label);
    expect(negativos).toEqual([]);
  });

  it("normalizar o zero NÃO altera o CAC alvo", () => {
    // A soma das linhas é como o valor é calculado. Se `-0` virasse `0` e o
    // total mudasse, a correção teria efeito colateral aritmético — não tem,
    // e este teste é o que garante isso.
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, cmv: 0, gatewayPctVar: 0 });
    const soma = r.lines.reduce((a, l) => a + l.value, 0);
    expect(roundMoney(soma)).toBe(r.value);
  });

  it("deduções não-zeradas seguem negativas", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    expect(r.lines.find((l) => l.label === "− Margem desejada")!.value).toBeLessThan(0);
    expect(r.lines.find((l) => l.label === "− CMV")!.value).toBeLessThan(0);
  });
});

describe("GR-01 — proibição de inferência", () => {
  it("input ausente devolve null e NOMEIA o que falta, nunca um valor plausível", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, cmv: null, margemDesejada: null });
    expect(r.value).toBeNull();
    expect(r.status).toBe("MISSING");
    expect(r.missing).toEqual(["margem desejada", "CMV"]);
  });

  it("ticket ausente não vira zero nem média", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, ticket: null });
    expect(r.value).toBeNull();
    expect(r.missing).toContain("ticket médio");
  });
});

describe("RC-01 — guarda de dupla dedução", () => {
  it("aborta com ticket NET_OF_REFUNDS e provisão de reembolso > 0", () => {
    expect(() =>
      targetCacDeck({ ...PROTOCOL_INPUTS, ticketBasis: "NET_OF_REFUNDS" }),
    ).toThrow(ProtocolViolation);
  });

  it("aceita NET_OF_REFUNDS quando as provisões estão zeradas — que é o caso do Loyola X", () => {
    const r = targetCacDeck({
      ...PROTOCOL_INPUTS,
      ticketBasis: "NET_OF_REFUNDS",
      reembolso: 0,
      chargeback: 0,
    });
    // Sem as duas linhas de provisão: 450 − 67,5 − 45 − 32,455 − 60
    expect(r.value).toBe(245.05);
  });
});

describe("U-01 — guarda de unidade", () => {
  it("rejeita taxa em pontos percentuais (o erro clássico: 2 em vez de 0,02)", () => {
    expect(() => assertRate(2, "CTR")).toThrow(ProtocolViolation);
    expect(() => assertRate(15, "margem")).toThrow(/pontos percentuais/);
  });

  it("rejeita taxa ZERO — quase sempre significa etapa não medida, não conversão nula", () => {
    expect(() => assertRate(0, "play rate")).toThrow(ProtocolViolation);
  });

  it("aceita o intervalo válido, inclusive o extremo 1", () => {
    expect(assertRate(0.02, "CTR")).toBe(0.02);
    expect(assertRate(1, "connect rate")).toBe(1);
  });

  it("margem em pontos percentuais aborta o CAC alvo inteiro", () => {
    expect(() => targetCacDeck({ ...PROTOCOL_INPUTS, margemDesejada: 15 })).toThrow(
      ProtocolViolation,
    );
  });
});

describe("compareToTarget — gap e kill/continue (MTAX-04)", () => {
  it("realizado abaixo do alvo → ESCALAR", () => {
    expect(compareToTarget(180, 204.55).verdict).toBe("ESCALAR");
  });

  it("acima do alvo mas dentro dos 30% → ZONA_DE_TOLERANCIA", () => {
    const exact = targetCacDeck(PROTOCOL_INPUTS).valueExact;
    const r = compareToTarget(250, exact);
    expect(r.verdict).toBe("ZONA_DE_TOLERANCIA");
    expect(r.threshold).toBe(265.91);
  });

  it("o CAC de R$347,22 do protocolo contra alvo de R$204,55 → PAUSAR", () => {
    const r = compareToTarget(347.22, 204.55);
    expect(r.verdict).toBe("PAUSAR");
    expect(r.deltaPct).toBeCloseTo(69.7, 1);
  });

  it("sem realizado ou sem alvo → UNKNOWN, nunca um veredito chutado", () => {
    expect(compareToTarget(null, 204.55).verdict).toBe("UNKNOWN");
    expect(compareToTarget(347.22, null).verdict).toBe("UNKNOWN");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 29.36 — cadeia de conversão
// ═══════════════════════════════════════════════════════════════════════════

import {
  decomposeCac,
  assertChainIntegrity,
  assertHomogeneousWindow,
  assertSingleNumerator,
  entryCostPerUnit,
  runSanityTests,
  type ChainRate,
} from "../cac-protocol";

/** Cadeia canônica do protocolo — a que produz CAC de R$ 347,22. */
function chain(over: Partial<Record<string, number | null>> = {}): ChainRate[] {
  const mk = (
    key: string,
    label: string,
    numerator: string,
    denominator: string,
    value: number | null,
  ): ChainRate => ({
    key, label, numerator, denominator,
    value: key in over ? (over[key] as number | null) : value,
    status: "MEASURED",
    source: "teste",
    windowStart: "2026-01-01",
    windowEnd: "2026-01-31",
    measuredAt: "2026-02-01",
  });
  return [
    mk("CTR", "CTR", "cliques no link", "impressões", 0.02),
    mk("connect_rate", "Connect Rate", "pageviews", "cliques no link", 0.8),
    mk("play_rate", "Play Rate", "plays únicos", "pageviews", 0.6),
    mk("pitch_rate", "Retenção ao Pitch", "únicos no pitch", "plays únicos", 0.2),
    mk("conv_post_pitch", "Conv. Pós-Pitch", "checkouts iniciados", "únicos no pitch", 0.2),
    mk("conv_checkout", "Conv. Checkout", "compras aprovadas", "checkouts iniciados", 0.15),
  ];
}

describe("decomposeCac — paridade com cac_engine.py (AC10)", () => {
  it("reproduz o cenário canônico: CAC R$ 347,22", () => {
    const r = decomposeCac({ kind: "CPM", value: 20 }, chain());
    expect(r.cac).toBeCloseTo(347.22, 2);
    expect(r.chainProduct).toBeCloseTo(0.0000576, 10);
    expect(Math.round(r.entriesPerSale!)).toBe(17361);
    expect(r.status).toBe("DERIVED");
  });

  it("via CPC sem CTR na cadeia dá o MESMO CAC — ST-04 fecha", () => {
    const semCtr = chain().filter((r) => r.key !== "CTR");
    const r = decomposeCac({ kind: "CPC", value: 1 }, semCtr);
    expect(r.cac).toBeCloseTo(347.22, 2);
    expect(r.chainProduct).toBeCloseTo(0.00288, 8);
  });

  it("CPM entra dividido por 1000 — única exceção de escala (U-04)", () => {
    expect(entryCostPerUnit("CPM", 20)).toBe(0.02);
    expect(entryCostPerUnit("CPC", 1)).toBe(1);
  });

  it("é DIVISÃO, não multiplicação — multiplicar daria CAC menor que um clique", () => {
    const r = decomposeCac({ kind: "CPC", value: 2 }, [
      {
        key: "conv", label: "Conv", numerator: "vendas", denominator: "cliques",
        value: 0.02, status: "MEASURED", source: "t", windowStart: null, windowEnd: null, measuredAt: null,
      },
    ]);
    expect(r.cac).toBe(100); // 2 ÷ 0,02 — não 0,04
  });
});

describe("GR-01.d — etapa não medida (AC6)", () => {
  it("devolve UNKNOWN e nomeia a etapa, nunca assume 100%", () => {
    const r = decomposeCac({ kind: "CPM", value: 20 }, chain({ pitch_rate: null }));
    expect(r.cac).toBeNull();
    expect(r.status).toBe("UNKNOWN");
    expect(r.unmeasured).toEqual(["Retenção ao Pitch"]);
  });

  it("assumir 100% produziria CAC otimista — é o que a guarda impede", () => {
    const comum = decomposeCac({ kind: "CPM", value: 20 }, chain()).cac!;
    const otimista = decomposeCac({ kind: "CPM", value: 20 }, chain({ pitch_rate: 1 })).cac!;
    expect(otimista).toBeLessThan(comum); // 5× melhor, e mentira
  });
});

describe("CHAIN-01 — bases encadeadas (AC7)", () => {
  it("aceita a cadeia canônica", () => {
    expect(() => assertChainIntegrity(chain())).not.toThrow();
  });

  it("aborta quando uma etapa pula de base", () => {
    const quebrada = chain();
    quebrada[3] = { ...quebrada[3], denominator: "pageviews" }; // deveria ser "plays únicos"
    expect(() => assertChainIntegrity(quebrada)).toThrow(ProtocolViolation);
    expect(() => assertChainIntegrity(quebrada)).toThrow(/não encadeiam/);
  });
});

describe("ST-07 — janela homogênea (AC3)", () => {
  it("aceita cadeia com janela única", () => {
    expect(() => assertHomogeneousWindow(chain())).not.toThrow();
  });

  it("aborta quando um valor manual é de outro período", () => {
    const mista = chain();
    mista[2] = { ...mista[2], windowStart: "2025-11-01", windowEnd: "2025-11-30" };
    expect(() => assertHomogeneousWindow(mista)).toThrow(/INCOMPATIBLE_MEASUREMENT_BASIS/);
  });

  it("etapa sem janela declarada não dispara falso positivo", () => {
    const semJanela = chain().map((r) => ({ ...r, windowStart: null, windowEnd: null }));
    expect(() => assertHomogeneousWindow(semJanela)).not.toThrow();
  });
});

describe("ST-06 — numerador único", () => {
  it("aborta com CPC + CTR na mesma cadeia", () => {
    expect(() => assertSingleNumerator("CPC", chain())).toThrow(/duas vezes/);
  });

  it("aborta com CPM sem CTR", () => {
    expect(() => assertSingleNumerator("CPM", chain().filter((r) => r.key !== "CTR"))).toThrow(
      ProtocolViolation,
    );
  });
});

describe("runSanityTests — os 8 rodam sempre (AC8)", () => {
  it("roda ST-01 a ST-08, sem pular nenhum", () => {
    const d = decomposeCac({ kind: "CPM", value: 20 }, chain());
    const r = runSanityTests("vsl_direct", { kind: "CPM", value: 20 }, chain(), d);
    expect(r.map((x) => x.id)).toEqual([
      "ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08",
    ]);
  });

  it("cenário canônico não produz nenhum FAIL", () => {
    const d = decomposeCac({ kind: "CPM", value: 20 }, chain());
    const r = runSanityTests("vsl_direct", { kind: "CPM", value: 20 }, chain(), d);
    expect(r.filter((x) => x.verdict === "FAIL")).toHaveLength(0);
  });

  it("ST-02 sai INCONCLUSIVE fora de vsl_direct — banda não se aplica, não reprova", () => {
    const d = decomposeCac({ kind: "CPM", value: 20 }, chain());
    const r = runSanityTests("quiz", { kind: "CPM", value: 20 }, chain(), d);
    expect(r.find((x) => x.id === "ST-02")?.verdict).toBe("INCONCLUSIVE");
  });

  it("ST-08 reprova quando há etapa sem medição", () => {
    const rates = chain({ play_rate: null });
    const d = decomposeCac({ kind: "CPM", value: 20 }, rates);
    const r = runSanityTests("vsl_direct", { kind: "CPM", value: 20 }, rates, d);
    expect(r.find((x) => x.id === "ST-08")?.verdict).toBe("FAIL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Story 29.37 — teto, ranking e efeito composto
// ═══════════════════════════════════════════════════════════════════════════

import {
  realDrop, deckLabel, compositeEffect, rank,
  wilsonInterval, realDropInterval, zFor, cacDropInterval,
  type CeilingRow,
} from "../cac-protocol";

/** Baseline e teto do cenário canônico do protocolo. */
function ceilingRows(): CeilingRow[] {
  const mk = (
    key: string, label: string, role: "numerator" | "denominator",
    current: number, ceiling: number, pos: number,
  ): CeilingRow => ({
    key, label, role, current, ceiling,
    ceilingSource: "benchmark_fonte", chainPosition: pos,
    successes: null, trials: null,
  });
  return [
    mk("CPM", "CPM", "numerator", 20, 15, 0),
    mk("CTR", "CTR", "denominator", 0.02, 0.03, 1),
    mk("connect_rate", "Connect Rate", "denominator", 0.8, 0.9, 2),
    mk("play_rate", "Play Rate", "denominator", 0.6, 0.85, 3),
    mk("pitch_rate", "Retenção ao Pitch", "denominator", 0.2, 0.25, 4),
    mk("conv_post_pitch", "Conv. Pós-Pitch", "denominator", 0.2, 0.25, 5),
    mk("conv_checkout", "Conv. Checkout", "denominator", 0.15, 0.25, 6),
  ];
}

describe("método do teto — paridade com cac_engine.py (AC9)", () => {
  it("reproduz as 7 quedas reais do protocolo", () => {
    const esperado: Record<string, number> = {
      CPM: -0.25, CTR: -0.3333, "Connect Rate": -0.1111, "Play Rate": -0.2941,
      "Retenção ao Pitch": -0.2, "Conv. Pós-Pitch": -0.2, "Conv. Checkout": -0.4,
    };
    for (const r of ceilingRows()) {
      expect(realDrop(r)).toBeCloseTo(esperado[r.label], 4);
    }
  });

  it("fator composto 0,12047 — queda de 87,95%", () => {
    const f = compositeEffect(ceilingRows())!;
    expect(f).toBeCloseTo(0.12047, 5);
    expect(1 - f).toBeCloseTo(0.8795, 4);
  });

  it("CAC no teto: R$ 41,83", () => {
    const cacBase = 347.22;
    expect(cacBase * compositeEffect(ceilingRows())!).toBeCloseTo(41.83, 1);
  });

  it("D3 — somar as quedas daria 178,8%, aritmeticamente impossível", () => {
    const soma = ceilingRows().reduce((a, r) => a + Math.abs(realDrop(r)!), 0);
    expect(soma).toBeGreaterThan(1); // >100%: por isso o efeito é multiplicativo
    expect(soma).toBeCloseTo(1.7886, 3);
  });
});

describe("D2 — o método do deck pode INVERTER a ordem (AC3)", () => {
  it("contraexemplo: CPM 20→14 vs pitch 0,20→0,28", () => {
    const rows: CeilingRow[] = [
      { key: "CPM", label: "CPM", role: "numerator", current: 20, ceiling: 14, ceilingSource: "melhor_historico", chainPosition: 0, successes: null, trials: null },
      { key: "pitch", label: "Pitch", role: "denominator", current: 0.2, ceiling: 0.28, ceilingSource: "melhor_historico", chainPosition: 4, successes: null, trials: null },
    ];
    // Correto: CPM −30% vs pitch −28,57% → CPM vence
    const vencedorCorreto = [...rows].sort((a, b) => realDrop(a)! - realDrop(b)!)[0];
    // Deck: CPM −30% vs pitch −40% → pitch venceria
    const vencedorDeck = [...rows].sort((a, b) => deckLabel(a)! - deckLabel(b)!)[0];
    expect(vencedorCorreto.label).toBe("CPM");
    expect(vencedorDeck.label).toBe("Pitch");
    expect(vencedorCorreto.label).not.toBe(vencedorDeck.label); // a ordem inverte
  });

  it("para o NUMERADOR as duas contas coincidem — é daí que nasce a distorção", () => {
    const cpm = ceilingRows().find((r) => r.key === "CPM")!;
    expect(realDrop(cpm)).toBeCloseTo(deckLabel(cpm)!, 6);
  });
});

describe("Wilson e nível de confiança", () => {
  it("intervalo fica dentro de [0,1] mesmo com proporção extrema e n pequeno", () => {
    const [lo, hi] = wilsonInterval(1, 10);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it("mais volume estreita o intervalo", () => {
    const [l1, h1] = wilsonInterval(15, 100);
    const [l2, h2] = wilsonInterval(1500, 10000);
    expect(h2 - l2).toBeLessThan(h1 - l1);
  });

  it("confiança maior alarga o intervalo, sempre", () => {
    const larguras = [0.8, 0.95, 0.99].map((c) => {
      const [lo, hi] = wilsonInterval(150, 1000, zFor(c));
      return hi - lo;
    });
    expect(larguras[0]).toBeLessThan(larguras[1]);
    expect(larguras[1]).toBeLessThan(larguras[2]);
  });

  it("nível não tabelado ABORTA em vez de aproximar o quantil", () => {
    expect(() => zFor(0.93)).toThrow(ProtocolViolation);
  });

  it("custo de entrada não tem IC — não é proporção", () => {
    const cpm = ceilingRows().find((r) => r.key === "CPM")!;
    expect(realDropInterval(cpm)).toBeNull();
  });
});

describe("ranking — a ordem sai dos DADOS (AC3, AC4)", () => {
  /** Mesmas taxas, volume variável — é o volume que muda o agrupamento. */
  function withCounts(mult: number): CeilingRow[] {
    const imp = 100_000 * mult;
    const clicks = Math.round(imp * 0.02);
    const pv = Math.round(clicks * 0.8);
    const plays = Math.round(pv * 0.6);
    const pitch = Math.round(plays * 0.2);
    const checkouts = Math.round(pitch * 0.2);
    const purchases = Math.round(checkouts * 0.15);
    const base = ceilingRows();
    const counts: Record<string, [number, number]> = {
      CTR: [clicks, imp], connect_rate: [pv, clicks], play_rate: [plays, pv],
      pitch_rate: [pitch, plays], conv_post_pitch: [checkouts, pitch],
      conv_checkout: [purchases, checkouts],
    };
    return base.map((r) =>
      counts[r.key] ? { ...r, successes: counts[r.key][0], trials: counts[r.key][1] } : r,
    );
  }

  it("ordena por queda real, não pelo rótulo do deck", () => {
    const r = rank(ceilingRows(), "LEXICOGRAPHIC");
    expect(r.ordered[0].label).toBe("Conv. Checkout"); // −40%, a maior queda
  });

  it("STATISTICAL é o padrão de rank()", () => {
    expect(rank(withCounts(100)).modeUsed).toBe("STATISTICAL");
  });

  it("o agrupamento muda com o VOLUME — a ordem não é fixa (S5-D3)", () => {
    const baixo = rank(withCounts(1));
    const alto = rank(withCounts(100));
    expect(baixo.tieGroups.length).not.toBe(alto.tieGroups.length);
  });

  it("RANK-02 — sem contagens degrada e DECLARA", () => {
    const r = rank(ceilingRows()); // sem successes/trials
    expect(r.degraded).toBe(true);
    expect(r.modeRequested).toBe("STATISTICAL");
    expect(r.modeUsed).toBe("LEXICOGRAPHIC");
    expect(r.notes.join(" ")).toMatch(/NÃO foi avaliado/);
  });

  it("CEIL-01 — variável sem teto com procedência fica FORA do ranking", () => {
    const rows = ceilingRows();
    rows[2] = { ...rows[2], ceiling: null, ceilingSource: null };
    const r = rank(rows, "LEXICOGRAPHIC");
    expect(r.excluded).toContain("Connect Rate");
    expect(r.ordered.find((x) => x.label === "Connect Rate")).toBeUndefined();
  });

  it("funil NÃO VALIDADO suspende C2 e declara", () => {
    const r = rank(withCounts(1), "STATISTICAL", "NOT_VALIDATED");
    expect(r.notes.join(" ")).toMatch(/C2.*suspenso/);
  });
});

describe("GR-01.b — intervalo nunca vira ponto (AC9)", () => {
  it("Cloudflare: connect rate 70–75% → 93–97% dá queda entre 19,35% e 27,84%", () => {
    const [pior, melhor] = cacDropInterval(0.7, 0.75, 0.93, 0.97);
    expect(pior).toBeCloseTo(0.1935, 4);
    expect(melhor).toBeCloseTo(0.2784, 4);
  });

  it("o ponto médio (23,68%) NÃO é o resultado — está fora do que reportamos", () => {
    const [pior, melhor] = cacDropInterval(0.7, 0.75, 0.93, 0.97);
    const pontoMedio = 1 - 0.725 / 0.95;
    expect(pontoMedio).toBeGreaterThan(pior);
    expect(pontoMedio).toBeLessThan(melhor);
    // Reportar 23,68% seria trocar uma faixa medida por um número inventado.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Regressão do blocker achado no gate da 29.36
// ═══════════════════════════════════════════════════════════════════════════

import { FUNNEL_TEMPLATES, type FunnelArchitecture } from "../funnel-templates";

/**
 * O gate reprovou a 29.36 porque `connect_rate` ficava sem valor E sem campo
 * para digitar: o template a marcava como "analytics", o sistema não fornecia
 * o número, e o campo de edição só aparecia para `source === "manual"`. Como
 * `GR-01.d` derruba o cálculo inteiro quando falta uma etapa, o CAC decomposto
 * nunca calculava — em nenhuma das 7 arquiteturas.
 *
 * A correção derivou a editabilidade do que o sistema FORNECE, e não do
 * `source` declarado. Estes testes travam a propriedade que importa: toda
 * etapa precisa ter um caminho para receber valor.
 */
describe("toda etapa tem caminho para receber valor (regressão do gate)", () => {
  /** O que a tela obtém do sistema hoje. Só CTR. */
  const SYSTEM_PROVIDES = new Set(["CTR"]);

  const architectures = Object.keys(FUNNEL_TEMPLATES) as FunnelArchitecture[];

  it.each(architectures)("%s — nenhuma etapa fica sem valor e sem campo", (arch) => {
    const t = FUNNEL_TEMPLATES[arch];
    const orfas = t.stages.filter((s) => {
      const doSistema = SYSTEM_PROVIDES.has(s.key);
      // Regra nova: editável = o sistema não fornece. Com ela, nenhuma etapa
      // fica órfã. Com a regra antiga (`source === "manual"`), toda etapa
      // "analytics" ficava.
      const editavel = !doSistema;
      return !doSistema && !editavel;
    });
    expect(orfas).toHaveLength(0);
  });

  it("a regra ANTIGA deixaria etapas órfãs — é o bug que o gate pegou", () => {
    const SYSTEM_PROVIDES = new Set(["CTR"]);
    const orfasPelaRegraAntiga = architectures.flatMap((arch) =>
      FUNNEL_TEMPLATES[arch].stages
        .filter((s) => !SYSTEM_PROVIDES.has(s.key) && s.source !== "manual")
        .map((s) => `${arch}.${s.key}`),
    );
    // Prova de que o problema não era só connect_rate: 6 etapas distintas,
    // espalhadas por 6 das 7 arquiteturas.
    expect(orfasPelaRegraAntiga.length).toBeGreaterThan(0);
    const chaves = new Set(orfasPelaRegraAntiga.map((x) => x.split(".")[1]));
    expect(chaves).toContain("connect_rate");
    expect(chaves.size).toBeGreaterThan(1);
  });

  it("connect_rate está em TODAS as arquiteturas — por isso derrubava tudo (R2)", () => {
    for (const arch of architectures) {
      const temConnect = FUNNEL_TEMPLATES[arch].stages.some((s) =>
        s.key === "connect_rate" || s.key === "vsl_connect",
      );
      expect(temConnect).toBe(true);
    }
  });
});
