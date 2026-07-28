/**
 * Story 41.7 — gate do relatório perpétuo, resolução de taxas e fuso horário.
 *
 * O teste de fuso (AC5) é o mais importante: ele roda a mesma asserção com
 * `TZ=UTC` e `TZ=America/Sao_Paulo` porque o bug original era exatamente a
 * dependência do fuso do processo — um teste que só roda no fuso do dev não
 * teria pego nada.
 */

import { describe, it, expect } from "vitest";
import {
  assertPerpetualScope,
  resolvePerpetualRates,
  findUnlinkedCampaigns,
  ReportScopeError,
  PLATFORM_RATE_BREAKDOWN,
  type PerpetualReportConfig,
} from "../services/perpetual-report-config.js";
import {
  saleDayKey,
  toBusinessDayKey,
  shiftDayKey,
  daysBetween,
  businessYesterday,
} from "../utils/sale-date.js";

function makeConfig(over: Partial<PerpetualReportConfig> = {}): PerpetualReportConfig {
  return {
    funnelId: "f-1",
    funnelName: "BBE-A1",
    projectId: "p-1",
    projectName: "Netão",
    metaAccountId: "act_1",
    campanhas: [],
    prefixoCampanha: null,
    produto: null,
    produtosOrderBump: [],
    temSplitFormato: false,
    origensPagas: ["meta"],
    inicioTrafego: null,
    validado: false,
    validadoEm: null,
    validadoPor: null,
    impostoPct: 0.1215,
    impostoOrigem: "default",
    taxaPlataformaPct: null,
    taxaImpostoPct: null,
    taxaOutrosPct: null,
    ...over,
  };
}

describe("gate do relatório perpétuo (§C.8)", () => {
  it("bloqueia funil não validado", () => {
    expect(() => assertPerpetualScope(makeConfig({ validado: false }))).toThrow(
      ReportScopeError,
    );
  });

  it("libera funil validado", () => {
    expect(() => assertPerpetualScope(makeConfig({ validado: true }))).not.toThrow();
  });

  it("NÃO tem bypass de combinação — diferente da 41.1", () => {
    // Na 41.1, pago/vendas-captacao passa sem `validado`. Aqui nenhuma
    // combinação é pré-aprovada: perpétuo nunca foi conferido casa a casa.
    const cfg = makeConfig({ validado: false, temSplitFormato: true, produto: "Curso" });
    expect(() => assertPerpetualScope(cfg)).toThrow(ReportScopeError);
  });

  it("erro carrega o corpo 422 do §C.8", () => {
    try {
      assertPerpetualScope(makeConfig({ validado: false }));
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      const body = (err as ReportScopeError).toResponse();
      expect(body.erro).toBe("COMBINACAO_NAO_VALIDADA");
      expect(body.detalhe).toContain("BBE-A1");
      expect(body.acao).toBeTruthy();
    }
  });
});

describe("resolvePerpetualRates (§C.3.4)", () => {
  it("kiwify COM coluna de status = 83,01% — o número da spec", () => {
    const r = resolvePerpetualRates(makeConfig(), "kiwify", true);
    expect(r.receitaLiquidaPct).toBe(0.8301);
    expect(r.reembolso).toBe(0);
    expect(r.plataforma).toBe(0.0499);
    expect(r.imposto).toBe(0.11);
    expect(r.outros).toBe(0.01);
  });

  it("kiwify SEM coluna de status = 79,01% — o reembolso estimado entra", () => {
    const r = resolvePerpetualRates(makeConfig(), "kiwify", false);
    expect(r.receitaLiquidaPct).toBe(0.7901);
    expect(r.reembolso).toBe(0.04);
  });

  it("soma bate com PLATFORM_FEE_RATES da 29.7 (kiwify 20,99% / hotmart 26%)", () => {
    for (const [platform, esperado] of [
      ["kiwify", 0.2099],
      ["hotmart", 0.26],
    ] as const) {
      const b = PLATFORM_RATE_BREAKDOWN[platform];
      const soma = b.plataforma + b.imposto + b.outros + b.reembolso;
      expect(Math.round(soma * 10_000) / 10_000).toBe(esperado);
    }
  });

  it("hotmart não usa 4,99% — fixar a constante da spec quebraria este caso", () => {
    const r = resolvePerpetualRates(makeConfig(), "hotmart", true);
    expect(r.plataforma).toBe(0.1);
    expect(r.receitaLiquidaPct).toBe(0.78);
  });

  it("plataforma desconhecida não inventa taxa", () => {
    const r = resolvePerpetualRates(makeConfig(), null, true);
    expect(r.receitaLiquidaPct).toBe(1);
  });

  it("override da config vence o default e é reportado como tal", () => {
    const r = resolvePerpetualRates(
      makeConfig({ taxaPlataformaPct: 0.08, taxaImpostoPct: null }),
      "kiwify",
      true,
    );
    expect(r.plataforma).toBe(0.08);
    expect(r.fonte.plataforma).toBe("config");
    expect(r.imposto).toBe(0.11);
    expect(r.fonte.imposto).toBe("default");
  });

  it("sem config resolve nos defaults da plataforma", () => {
    const r = resolvePerpetualRates(null, "kiwify", true);
    expect(r.receitaLiquidaPct).toBe(0.8301);
    expect(r.fonte.plataforma).toBe("default");
  });
});

describe("conferência da margem contra a §C.10", () => {
  it("BBE-A1: 14.495,61 bruto − 4.209,17 investimento = 7.823,63 de margem", () => {
    const faturamento = 14_495.61;
    const investimentoComImposto = 4_209.17;
    const r = resolvePerpetualRates(makeConfig(), "kiwify", true);
    const margem = faturamento * r.receitaLiquidaPct - investimentoComImposto;
    // A spec anota 7.823,63; o cálculo exato dá 7.823,64 (arredondamento dela).
    expect(margem).toBeCloseTo(7_823.63, 1);
  });

  it("FZ-A1: margem negativa — o funil não se paga", () => {
    const r = resolvePerpetualRates(makeConfig(), "kiwify", true);
    const margem = 12_331.0 * r.receitaLiquidaPct - 12_191.97;
    expect(margem).toBeCloseTo(-1_956.01, 0);
    expect(margem).toBeLessThan(0);
  });

  it("FZ-A1: CAC de equilíbrio R$ 48,98 com ticket de R$ 59,00 (§C.3.5)", () => {
    const r = resolvePerpetualRates(makeConfig(), "kiwify", true);
    const ticket = 59.0;
    const cacBreakeven = ticket * (1 - r.plataforma - r.imposto - r.outros);
    expect(cacBreakeven).toBeCloseTo(48.98, 2);
  });
});

describe("findUnlinkedCampaigns — detector de coleta incompleta (§C.3.1)", () => {
  const daConta = [
    { id: "1", name: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos" },
    { id: "2", name: "bbe-a1-jul-26--venda--perpetuo--cold_cbo" },
    { id: "3", name: "outro-funil-jul-26" },
  ];

  it("aponta campanha que casa com o prefixo e não está vinculada", () => {
    const cfg = makeConfig({
      prefixoCampanha: "bbe-a1-jul-26",
      campanhas: [{ id: "1", name: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos" }],
    });
    const orfas = findUnlinkedCampaigns(cfg, daConta);
    expect(orfas.map((c) => c.id)).toEqual(["2"]);
  });

  it("sem prefixo configurado não acusa nada", () => {
    const cfg = makeConfig({ prefixoCampanha: null, campanhas: [] });
    expect(findUnlinkedCampaigns(cfg, daConta)).toEqual([]);
  });

  it("ignora campanha de outro funil", () => {
    const cfg = makeConfig({ prefixoCampanha: "bbe-a1-jul-26", campanhas: [] });
    const orfas = findUnlinkedCampaigns(cfg, daConta);
    expect(orfas.map((c) => c.id)).not.toContain("3");
  });
});

// ------------------------------------------------------------------
// AC5 — fuso horário (§C.7)
// ------------------------------------------------------------------

describe("saleDayKey — fuso horário (§C.7)", () => {
  const originalTZ = process.env.TZ;

  /**
   * Roda a asserção nos dois fusos. O bug original era depender do fuso do
   * processo, então testar em um só não prova nada.
   *
   * Nota: `Intl` já resolve o timezone explicitamente, então o resultado não
   * muda; o loop existe para travar uma regressão futura que volte a usar
   * `getFullYear()` e companhia.
   */
  function inBothTimezones(assertion: () => void) {
    for (const tz of ["UTC", "America/Sao_Paulo"]) {
      process.env.TZ = tz;
      try {
        assertion();
      } finally {
        process.env.TZ = originalTZ;
      }
    }
  }

  it("o caso da spec: 2026-07-21T01:18:00Z é venda do dia 20/07 no Brasil", () => {
    inBothTimezones(() => {
      expect(saleDayKey("2026-07-21T01:18:00Z")).toBe("2026-07-20");
    });
  });

  it("venda no meio do dia não muda de data", () => {
    inBothTimezones(() => {
      expect(saleDayKey("2026-07-21T15:00:00Z")).toBe("2026-07-21");
    });
  });

  it("fronteira exata: 03:00Z é o primeiro instante do dia em São Paulo", () => {
    inBothTimezones(() => {
      expect(saleDayKey("2026-07-21T02:59:59Z")).toBe("2026-07-20");
      expect(saleDayKey("2026-07-21T03:00:00Z")).toBe("2026-07-21");
    });
  });

  it("data BR sem hora é dia literal — NÃO converte (senão cairia no dia anterior)", () => {
    inBothTimezones(() => {
      expect(saleDayKey("21/07/2026")).toBe("2026-07-21");
      expect(saleDayKey("1/7/2026")).toBe("2026-07-01");
    });
  });

  it("data BR com hora também é dia literal", () => {
    inBothTimezones(() => {
      expect(saleDayKey("21/07/2026 01:18")).toBe("2026-07-21");
    });
  });

  it("ISO date puro é dia literal", () => {
    inBothTimezones(() => {
      expect(saleDayKey("2026-07-21")).toBe("2026-07-21");
    });
  });

  it("lixo devolve null em vez de inventar dia", () => {
    expect(saleDayKey("")).toBeNull();
    expect(saleDayKey(null)).toBeNull();
    expect(saleDayKey("não é data")).toBeNull();
    expect(saleDayKey("35/13/2026")).toBeNull();
  });

  it("toBusinessDayKey independe do TZ do processo", () => {
    const instant = new Date("2026-07-21T01:18:00Z");
    inBothTimezones(() => {
      expect(toBusinessDayKey(instant)).toBe("2026-07-20");
    });
  });
});

describe("aritmética de dias (§C.7 — dias completos)", () => {
  it("shiftDayKey atravessa virada de mês", () => {
    expect(shiftDayKey("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDayKey("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("shiftDayKey atravessa virada de ano", () => {
    expect(shiftDayKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("daysBetween é intervalo fechado — os períodos da §C.10 batem", () => {
    expect(daysBetween("2026-07-17", "2026-07-27")).toBe(11); // BBE-A1
    expect(daysBetween("2026-07-09", "2026-07-27")).toBe(19); // PPS-A1
    expect(daysBetween("2026-06-01", "2026-07-27")).toBe(57); // FZ-A1
  });

  it("businessYesterday fecha o período em ontem", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    expect(businessYesterday(now)).toBe("2026-07-27");
  });

  it("businessYesterday usa o dia de São Paulo, não o do processo", () => {
    // 01:18Z de 28/07 ainda é dia 27 no Brasil → ontem = 26.
    const now = new Date("2026-07-28T01:18:00Z");
    expect(businessYesterday(now)).toBe("2026-07-26");
  });
});
