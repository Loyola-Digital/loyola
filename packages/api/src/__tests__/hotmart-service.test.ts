import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import {
  aggregateDashboard,
  distinctProducts,
  encryptHotmartSecret,
  decryptHotmartSecret,
  monthsAgoMs,
  nextMonthWindow,
  getHotmartToken,
  clearHotmartTokenCache,
  fetchSubscriptionsSummary,
  type HotmartSummaryItem,
  type HotmartActiveSub,
  type AggregateInput,
} from "../services/hotmart";

const TEST_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

// Helper: monta counts default (sem mexer no que o teste não foca).
function counts(partial: Partial<AggregateInput["counts"]> = {}): AggregateInput["counts"] {
  return {
    total: partial.total ?? 0,
    active: partial.active ?? 0,
    delayed: partial.delayed ?? 0,
    cancelled: partial.cancelled ?? 0,
    overdue: partial.overdue ?? 0,
    byStatus: partial.byStatus ?? [],
  };
}

describe("Hotmart helpers de cripto", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });
  afterAll(() => {
    if (originalKey) process.env.ENCRYPTION_KEY = originalKey;
    else delete process.env.ENCRYPTION_KEY;
  });

  it("round-trip do client_secret via AES-256-GCM", () => {
    const { encrypted, iv } = encryptHotmartSecret("super-secret-client-secret");
    expect(decryptHotmartSecret(encrypted, iv)).toBe("super-secret-client-secret");
  });
});

describe("Helpers de data (epoch ms UTC)", () => {
  it("monthsAgoMs subtrai meses em UTC", () => {
    const ref = Date.UTC(2026, 5, 11, 12, 0, 0, 0); // 2026-06-11
    const result = monthsAgoMs(12, ref);
    const d = new Date(result);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(5); // junho
    expect(d.getUTCDate()).toBe(11);
  });

  it("nextMonthWindow cobre mês de 28 dias (fev não-bissexto)", () => {
    const ref = Date.UTC(2026, 0, 15, 0, 0, 0, 0); // 2026-01-15 -> próximo = fev/2026 (28 dias)
    const { startMs, endMs } = nextMonthWindow(ref);
    const start = new Date(startMs);
    const end = new Date(endMs);
    expect(start.getUTCMonth()).toBe(1); // fevereiro
    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCHours()).toBe(0);
    expect(end.getUTCMonth()).toBe(1);
    expect(end.getUTCDate()).toBe(28); // último dia de fev 2026
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });

  it("nextMonthWindow cobre mês de 31 dias", () => {
    const ref = Date.UTC(2026, 6, 5, 0, 0, 0, 0); // 2026-07-05 -> próximo = ago/2026 (31 dias)
    const { endMs } = nextMonthWindow(ref);
    const end = new Date(endMs);
    expect(end.getUTCMonth()).toBe(7); // agosto
    expect(end.getUTCDate()).toBe(31);
  });

  it("nextMonthWindow vira o ano (dezembro -> janeiro do ano seguinte)", () => {
    const ref = Date.UTC(2026, 11, 20, 0, 0, 0, 0); // 2026-12-20 -> próximo = jan/2027
    const { startMs, endMs } = nextMonthWindow(ref);
    const start = new Date(startMs);
    const end = new Date(endMs);
    expect(start.getUTCFullYear()).toBe(2027);
    expect(start.getUTCMonth()).toBe(0); // janeiro
    expect(start.getUTCDate()).toBe(1);
    expect(end.getUTCFullYear()).toBe(2027);
    expect(end.getUTCMonth()).toBe(0);
    expect(end.getUTCDate()).toBe(31);
  });
});

describe("distinctProducts", () => {
  it("deriva produtos distintos ordenados por name, sem duplicatas", () => {
    const items: HotmartSummaryItem[] = [
      { product: { id: 2, name: "Plano Beta" } },
      { product: { id: 1, name: "Plano Alpha" } },
      { product: { id: 2, name: "Plano Beta" } },
      { product: { id: "3", name: "Plano Gamma" } },
    ];
    const result = distinctProducts(items);
    expect(result).toEqual([
      { id: "1", name: "Plano Alpha" },
      { id: "2", name: "Plano Beta" },
      { id: "3", name: "Plano Gamma" },
    ]);
  });

  it("ignora itens sem product.id", () => {
    const items: HotmartSummaryItem[] = [{ product: {} }, {}, { product: { id: 5, name: "X" } }];
    expect(distinctProducts(items)).toEqual([{ id: "5", name: "X" }]);
  });
});

describe("aggregateDashboard — MRR mensalizado (de activeSubs)", () => {
  it("plano mensal (30 dias) -> MRR = price.value", () => {
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 100, currency_code: "BRL" }, plan: { recurrency_period: 30 } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [] });
    expect(r.mrr).toEqual([{ currency: "BRL", value: 100 }]);
  });

  it("plano anual (360 dias) -> MRR = value * 30 / 360", () => {
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 1200, currency_code: "BRL" }, plan: { recurrency_period: 360 } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [] });
    // 1200 * 30 / 360 = 100
    expect(r.mrr).toEqual([{ currency: "BRL", value: 100 }]);
  });

  it("multi-moeda no MRR: agrupa por currency_code, BRL primeiro", () => {
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 50, currency_code: "USD" }, plan: { recurrency_period: 30 } },
      { status: "ACTIVE", price: { value: 100, currency_code: "BRL" }, plan: { recurrency_period: 30 } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [] });
    expect(r.mrr).toEqual([
      { currency: "BRL", value: 100 },
      { currency: "USD", value: 50 },
    ]);
  });

  it("não somar moedas diferentes num só número", () => {
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 100, currency_code: "BRL" }, plan: { recurrency_period: 30 } },
      { status: "ACTIVE", price: { value: 100, currency_code: "USD" }, plan: { recurrency_period: 30 } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [] });
    expect(r.mrr.length).toBe(2);
    expect(r.mrr.find((m) => m.currency === "BRL")?.value).toBe(100);
    expect(r.mrr.find((m) => m.currency === "USD")?.value).toBe(100);
  });

  it("divisão por zero protegida (recurrency_period 0 é ignorado)", () => {
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 100, currency_code: "BRL" }, plan: { recurrency_period: 0 } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [] });
    expect(r.mrr).toEqual([]);
  });
});

describe("aggregateDashboard — LT e LTV", () => {
  it("LT (meses) = média de lifetime/30 só das ACTIVE (lifetime em DIAS); ignora não-ACTIVE", () => {
    const summaryItems: HotmartSummaryItem[] = [
      { status: "ACTIVE", lifetime: 30 }, // 1 mês
      { status: "ACTIVE", lifetime: 300 }, // 10 meses
      { status: "INACTIVE", lifetime: 0 }, // ignorado (puxaria a média pra baixo)
      { status: "CANCELLED_BY_CUSTOMER", lifetime: 600 }, // ignorado
    ];
    const r = aggregateDashboard({ activeSubs: [], summaryItems, counts: counts(), refundedSales: [] });
    // (1 + 10) / 2 = 5.5
    expect(r.ltMonths).toBeCloseTo(5.5);
  });

  it("LTV por moeda = (MRR_moeda / nº_ativos_moeda) * LT", () => {
    // 2 ativos BRL: 100/mês e 200/mês -> MRR 300, média mensal 150.
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", price: { value: 100, currency_code: "BRL" }, plan: { recurrency_period: 30 } },
      { status: "ACTIVE", price: { value: 200, currency_code: "BRL" }, plan: { recurrency_period: 30 } },
    ];
    // LT = 10 meses (lifetime ACTIVE 300/30).
    const summaryItems: HotmartSummaryItem[] = [{ status: "ACTIVE", lifetime: 300 }];
    const r = aggregateDashboard({ activeSubs, summaryItems, counts: counts(), refundedSales: [] });
    // LTV = 150 * 10 = 1500.
    expect(r.ltv).toEqual([{ currency: "BRL", value: 1500 }]);
  });
});

describe("aggregateDashboard — contagens, retenção, churn", () => {
  it("retenção = (active+delayed)/total ; churn = (cancelled+overdue)/total", () => {
    // Espelha a Hotmart: total 1150, vigentes 633 (569+64), churn 517 (496+21).
    const r = aggregateDashboard({
      activeSubs: [],
      summaryItems: [],
      counts: counts({ total: 1150, active: 569, delayed: 64, cancelled: 496, overdue: 21 }),
      refundedSales: [],
    });
    expect(r.totalSubscriptions).toBe(1150);
    expect(r.activeSubscriptions).toBe(569);
    expect(r.cancelledSubscriptions).toBe(496);
    expect(r.overdueSubscriptions).toBe(21);
    expect(r.retentionRate).toBeCloseTo(0.5504, 3);
    expect(r.churnRate).toBeCloseTo(0.4496, 3);
    // retenção + churn = 1.
    expect(r.retentionRate + r.churnRate).toBeCloseTo(1);
  });

  it("dataset vazio: sem divisão por zero (retenção/churn = 0)", () => {
    const r = aggregateDashboard({ activeSubs: [], summaryItems: [], counts: counts(), refundedSales: [] });
    expect(r.totalSubscriptions).toBe(0);
    expect(r.retentionRate).toBe(0);
    expect(r.churnRate).toBe(0);
    expect(r.ltMonths).toBe(0);
    expect(r.mrr).toEqual([]);
    expect(r.ltv).toEqual([]);
    expect(r.nextMonthRenewals.count).toBe(0);
  });
});

describe("aggregateDashboard — renovações do próximo mês (de activeSubs)", () => {
  it("conta ACTIVE com date_next_charge na janela do próximo mês e soma receita", () => {
    const ref = Date.UTC(2026, 5, 11, 0, 0, 0, 0); // 2026-06-11 -> próximo = julho/2026
    const inWindow = Date.UTC(2026, 6, 15, 0, 0, 0, 0); // 2026-07-15
    const beforeWindow = Date.UTC(2026, 5, 30, 0, 0, 0, 0); // junho (fora)
    const afterWindow = Date.UTC(2026, 7, 1, 0, 0, 0, 0); // agosto (fora)
    const activeSubs: HotmartActiveSub[] = [
      { status: "ACTIVE", date_next_charge: inWindow, price: { value: 100, currency_code: "BRL" } },
      { status: "ACTIVE", date_next_charge: inWindow, price: { value: 50, currency_code: "BRL" } },
      { status: "ACTIVE", date_next_charge: beforeWindow, price: { value: 999, currency_code: "BRL" } },
      { status: "ACTIVE", date_next_charge: afterWindow, price: { value: 999, currency_code: "BRL" } },
    ];
    const r = aggregateDashboard({ activeSubs, summaryItems: [], counts: counts(), refundedSales: [], refMs: ref });
    expect(r.nextMonthRenewals.count).toBe(2);
    expect(r.nextMonthRenewals.expectedRevenue).toEqual([{ currency: "BRL", value: 150 }]);
  });
});

describe("aggregateDashboard — reembolsos multi-moeda", () => {
  it("agrega total_items e total_value por moeda", () => {
    const r = aggregateDashboard({
      activeSubs: [],
      summaryItems: [],
      counts: counts(),
      refundedSales: [
        { total_items: 3, total_value: { value: 300, currency_code: "BRL" } },
        { total_items: 1, total_value: { value: 50, currency_code: "USD" } },
      ],
    });
    expect(r.refunded.totalItems).toBe(4);
    expect(r.refunded.totalValue).toEqual([
      { currency: "BRL", value: 300 },
      { currency: "USD", value: 50 },
    ]);
  });
});

describe("getHotmartToken — OAuth, cache, refresh e segurança", () => {
  beforeEach(() => {
    clearHotmartTokenCache();
    vi.restoreAllMocks();
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("monta o Basic header base64(client_id:client_secret) e retorna access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-123", token_type: "bearer", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await getHotmartToken("my-client-id", "my-client-secret");
    expect(token).toBe("tok-123");

    const [, init] = fetchMock.mock.calls[0];
    const expectedBasic = Buffer.from("my-client-id:my-client-secret").toString("base64");
    expect(init.headers.Authorization).toBe(`Basic ${expectedBasic}`);
  });

  it("reutiliza o token do cache (1 fetch para 2 chamadas)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok-cache", expires_in: 3600 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getHotmartToken("cid", "csecret");
    await getHotmartToken("cid", "csecret");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renova o token quando o cache expira (refresh skew)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-1", expires_in: 360 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-2", expires_in: 360 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const t1 = await getHotmartToken("cid", "csecret");
    expect(t1).toBe("tok-1");
    // expires_in=360s, skew=300s -> expira em ~60s. Avança 61s.
    vi.advanceTimersByTime(61 * 1000);
    const t2 = await getHotmartToken("cid", "csecret");
    expect(t2).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("em falha de auth lança Error sem vazar o clientSecret nem o Basic", async () => {
    const secret = "TOP-SECRET-DO-NOT-LEAK";
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    let caught: Error | null = null;
    try {
      await getHotmartToken("cid", secret);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).not.toContain(secret);
    const basic = Buffer.from(`cid:${secret}`).toString("base64");
    expect(caught?.message).not.toContain(basic);
  });
});

describe("fetchSubscriptionsSummary — auto-paginação por cursor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("encadeia next_page_token até esgotar e acumula os items", async () => {
    const page1 = {
      items: [{ subscription_id: 1 }],
      page_info: { next_page_token: "PAGE2" },
    };
    const page2 = {
      items: [{ subscription_id: 2 }],
      page_info: { next_page_token: null },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchSubscriptionsSummary("tok", { accessionFrom: 123 });
    expect(items.map((i) => i.subscription_id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 1ª chamada deve sempre carregar accession_date.
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain("accession_date=123");
    // 2ª chamada deve carregar o page_token do cursor.
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("page_token=PAGE2");
  });

  it("para quando o next_page_token repete (guarda contra loop infinito)", async () => {
    const looping = { items: [{ subscription_id: 9 }], page_info: { next_page_token: "SAME" } };
    // Fresh Response por chamada (o body de um Response só pode ser lido uma vez).
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(looping), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchSubscriptionsSummary("tok", { accessionFrom: 1 });
    // 1ª página retorna SAME; 2ª também retorna SAME (== lastToken) -> break.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items.length).toBe(2);
  });
});
