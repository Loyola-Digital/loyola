import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import {
  aggregateKiwifyDashboard,
  distinctRecurringProducts,
  encryptKiwifySecret,
  decryptKiwifySecret,
  monthsAgo,
  daysAgo,
  toYmd,
  fromYmd,
  windowDateRange,
  bucketForStatus,
  sumRevenueByCurrency,
  getKiwifyToken,
  clearKiwifyTokenCache,
  fetchSalesCount,
  listKiwifyProducts,
  type KiwifyProduct,
  type KiwifySale,
  type AggregateKiwifyInput,
} from "../services/kiwify";

const TEST_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

// Helper: monta input default da agregação (sem rede).
function aggInput(partial: Partial<AggregateKiwifyInput> = {}): AggregateKiwifyInput {
  return {
    sales: partial.sales ?? [],
    mrrSales: partial.mrrSales ?? [],
    stats: partial.stats ?? {},
  };
}

describe("Kiwify helpers de cripto", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });
  afterAll(() => {
    if (originalKey) process.env.ENCRYPTION_KEY = originalKey;
    else delete process.env.ENCRYPTION_KEY;
  });

  it("round-trip do client_secret via AES-256-GCM", () => {
    const { encrypted, iv } = encryptKiwifySecret("super-secret-kiwify-secret");
    expect(decryptKiwifySecret(encrypted, iv)).toBe("super-secret-kiwify-secret");
  });
});

describe("Helpers de data (YYYY-MM-DD, NÃO epoch ms)", () => {
  it("toYmd formata em UTC", () => {
    expect(toYmd(new Date(Date.UTC(2026, 5, 11, 23, 0, 0)))).toBe("2026-06-11");
    expect(toYmd(new Date(Date.UTC(2026, 0, 5, 0, 0, 0)))).toBe("2026-01-05");
  });

  it("fromYmd faz parse para epoch ms UTC (meia-noite)", () => {
    const ms = fromYmd("2026-06-11");
    const d = new Date(ms);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(11);
    expect(d.getUTCHours()).toBe(0);
  });

  it("monthsAgo subtrai meses em UTC", () => {
    const ref = new Date(Date.UTC(2026, 5, 11, 12, 0, 0)); // 2026-06-11
    expect(monthsAgo(12, ref)).toBe("2025-06-11");
    expect(monthsAgo(3, ref)).toBe("2026-03-11");
  });

  it("daysAgo subtrai dias em UTC (vira o mês)", () => {
    const ref = new Date(Date.UTC(2026, 5, 11, 0, 0, 0)); // 2026-06-11
    expect(daysAgo(30, ref)).toBe("2026-05-12");
  });
});

describe("windowDateRange — fatiar em janelas de 90 dias", () => {
  it("12 meses (~365 dias) -> 5 janelas, sem sobreposição, cobrindo tudo", () => {
    const from = "2025-06-12";
    const to = "2026-06-12";
    const windows = windowDateRange(from, to);
    expect(windows.length).toBe(5);

    // Primeira janela começa no from; última termina no to.
    expect(windows[0].from).toBe(from);
    expect(windows[windows.length - 1].to).toBe(to);

    // Nenhuma janela excede 90 dias-calendário e não há sobreposição/gap.
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 0; i < windows.length; i++) {
      const span = (fromYmd(windows[i].to) - fromYmd(windows[i].from)) / dayMs + 1;
      expect(span).toBeLessThanOrEqual(90);
      if (i > 0) {
        // próxima janela começa exatamente 1 dia após o fim da anterior.
        expect(fromYmd(windows[i].from) - fromYmd(windows[i - 1].to)).toBe(dayMs);
      }
    }
  });

  it("intervalo curto (<90d) -> 1 janela", () => {
    const windows = windowDateRange("2026-01-01", "2026-02-01");
    expect(windows.length).toBe(1);
    expect(windows[0]).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });

  it("exatamente 90 dias -> 1 janela", () => {
    const from = "2026-01-01";
    const to = toYmd(new Date(fromYmd(from) + 89 * 24 * 60 * 60 * 1000)); // 90 dias inclusivos
    const windows = windowDateRange(from, to);
    expect(windows.length).toBe(1);
  });

  it("to anterior a from -> array vazio", () => {
    expect(windowDateRange("2026-06-01", "2026-05-01")).toEqual([]);
  });
});

describe("bucketForStatus — mapeamento do enum oficial (11 status)", () => {
  it("mapeia cada status ao bucket correto", () => {
    expect(bucketForStatus("paid")).toBe("paid");
    expect(bucketForStatus("approved")).toBe("paid");
    expect(bucketForStatus("refunded")).toBe("refunded");
    expect(bucketForStatus("refund_requested")).toBe("refunded");
    expect(bucketForStatus("pending_refund")).toBe("refunded");
    expect(bucketForStatus("chargedback")).toBe("chargeback");
    expect(bucketForStatus("waiting_payment")).toBe("pending");
    expect(bucketForStatus("pending")).toBe("pending");
    expect(bucketForStatus("processing")).toBe("pending");
    expect(bucketForStatus("authorized")).toBe("pending");
    expect(bucketForStatus("refused")).toBe("refused");
  });

  it("status desconhecido/undefined -> undefined", () => {
    expect(bucketForStatus("banana")).toBeUndefined();
    expect(bucketForStatus(undefined)).toBeUndefined();
  });
});

describe("distinctRecurringProducts", () => {
  it("filtra payment_type=recurring, distinct, ordenado por name", () => {
    const items: KiwifyProduct[] = [
      { id: "2", name: "Plano Beta", payment_type: "recurring" },
      { id: "1", name: "Plano Alpha", payment_type: "recurring" },
      { id: "2", name: "Plano Beta", payment_type: "recurring" }, // duplicata
      { id: "9", name: "Curso Avulso", payment_type: "one_time" }, // ignorado (não recurring)
      { id: "3", name: "Plano Gamma", payment_type: "recurring" },
    ];
    expect(distinctRecurringProducts(items)).toEqual([
      { id: "1", name: "Plano Alpha" },
      { id: "2", name: "Plano Beta" },
      { id: "3", name: "Plano Gamma" },
    ]);
  });

  it("ignora itens sem id e sem payment_type recurring", () => {
    const items: KiwifyProduct[] = [
      { name: "Sem id", payment_type: "recurring" },
      { id: "", name: "Id vazio", payment_type: "recurring" },
      { id: "5", name: "X", payment_type: "one_time" },
      { id: "7", name: "Válido", payment_type: "recurring" },
    ];
    expect(distinctRecurringProducts(items)).toEqual([{ id: "7", name: "Válido" }]);
  });

  it("fallback de name = id quando name ausente", () => {
    const items: KiwifyProduct[] = [{ id: "42", payment_type: "recurring" }];
    expect(distinctRecurringProducts(items)).toEqual([{ id: "42", name: "42" }]);
  });
});

describe("sumRevenueByCurrency", () => {
  it("soma net_amount (centavos) por moeda, BRL primeiro", () => {
    const sales: KiwifySale[] = [
      { net_amount: 10000, currency: "BRL" },
      { net_amount: 5000, currency: "USD" },
      { net_amount: 2500, currency: "BRL" },
    ];
    expect(sumRevenueByCurrency(sales)).toEqual([
      { currency: "BRL", value: 12500 },
      { currency: "USD", value: 5000 },
    ]);
  });

  it("ignora vendas sem net_amount numérico", () => {
    const sales: KiwifySale[] = [{ currency: "BRL" }, { net_amount: 100, currency: "BRL" }];
    expect(sumRevenueByCurrency(sales)).toEqual([{ currency: "BRL", value: 100 }]);
  });
});

describe("aggregateKiwifyDashboard — receita recorrente (paid/approved, centavos)", () => {
  it("soma net_amount de paid + approved por moeda", () => {
    const sales: KiwifySale[] = [
      { status: "paid", net_amount: 10000, currency: "BRL" },
      { status: "approved", net_amount: 5000, currency: "BRL" },
      { status: "paid", net_amount: 3000, currency: "USD" },
      { status: "refunded", net_amount: 9999, currency: "BRL" }, // não conta na receita
      { status: "refused", net_amount: 9999, currency: "BRL" }, // não conta
    ];
    const r = aggregateKiwifyDashboard(aggInput({ sales }));
    expect(r.recurringRevenue).toEqual([
      { currency: "BRL", value: 15000 },
      { currency: "USD", value: 3000 },
    ]);
    expect(r.charges.paid.count).toBe(3);
    expect(r.charges.paid.value).toEqual(r.recurringRevenue);
  });

  it("não soma moedas diferentes num só número", () => {
    const sales: KiwifySale[] = [
      { status: "paid", net_amount: 100, currency: "BRL" },
      { status: "paid", net_amount: 100, currency: "USD" },
    ];
    const r = aggregateKiwifyDashboard(aggInput({ sales }));
    expect(r.recurringRevenue.length).toBe(2);
    expect(r.recurringRevenue.find((m) => m.currency === "BRL")?.value).toBe(100);
    expect(r.recurringRevenue.find((m) => m.currency === "USD")?.value).toBe(100);
  });
});

describe("aggregateKiwifyDashboard — buckets de status", () => {
  it("mapeia os 5 buckets corretamente (count + valor; refused só count)", () => {
    const sales: KiwifySale[] = [
      { status: "paid", net_amount: 1000, currency: "BRL" },
      { status: "approved", net_amount: 2000, currency: "BRL" },
      { status: "refunded", net_amount: 500, currency: "BRL" },
      { status: "refund_requested", net_amount: 300, currency: "BRL" },
      { status: "pending_refund", net_amount: 200, currency: "BRL" },
      { status: "chargedback", net_amount: 400, currency: "BRL" },
      { status: "waiting_payment", net_amount: 700, currency: "BRL" },
      { status: "pending", net_amount: 100, currency: "BRL" },
      { status: "processing", net_amount: 50, currency: "BRL" },
      { status: "authorized", net_amount: 80, currency: "BRL" },
      { status: "refused", net_amount: 9999, currency: "BRL" },
      { status: "refused", net_amount: 9999, currency: "BRL" },
    ];
    const r = aggregateKiwifyDashboard(aggInput({ sales }));

    expect(r.charges.paid.count).toBe(2);
    expect(r.charges.paid.value).toEqual([{ currency: "BRL", value: 3000 }]);

    expect(r.charges.refunded.count).toBe(3);
    expect(r.charges.refunded.value).toEqual([{ currency: "BRL", value: 1000 }]);

    expect(r.charges.chargeback.count).toBe(1);
    expect(r.charges.chargeback.value).toEqual([{ currency: "BRL", value: 400 }]);

    expect(r.charges.pending.count).toBe(4); // waiting_payment + pending + processing + authorized
    expect(r.charges.pending.value).toEqual([{ currency: "BRL", value: 930 }]);

    expect(r.charges.refused).toEqual({ count: 2 });
  });

  it("statusDistribution lista cada status cru com sua contagem (ordenado)", () => {
    const sales: KiwifySale[] = [
      { status: "paid" },
      { status: "paid" },
      { status: "refunded" },
    ];
    const r = aggregateKiwifyDashboard(aggInput({ sales }));
    expect(r.statusDistribution).toEqual([
      { status: "paid", count: 2 },
      { status: "refunded", count: 1 },
    ]);
  });
});

describe("aggregateKiwifyDashboard — novos vs renovação (parent_order_id)", () => {
  it("parent_order_id vazio = novo; preenchido = renovação (só paid/approved)", () => {
    const sales: KiwifySale[] = [
      { status: "paid", parent_order_id: null, net_amount: 1000, currency: "BRL" }, // novo
      { status: "paid", parent_order_id: "", net_amount: 1000, currency: "BRL" }, // novo
      { status: "approved", parent_order_id: "ORDER-1", net_amount: 1000, currency: "BRL" }, // renovação
      { status: "paid", parent_order_id: "ORDER-2", net_amount: 1000, currency: "BRL" }, // renovação
      { status: "refunded", parent_order_id: "ORDER-3", net_amount: 1000, currency: "BRL" }, // não conta (não paid)
    ];
    const r = aggregateKiwifyDashboard(aggInput({ sales }));
    expect(r.newVsRenewal).toEqual({ new: 2, renewal: 2 });
  });
});

describe("aggregateKiwifyDashboard — MRR aproximado (30d)", () => {
  it("mrrApprox = soma paid/approved das vendas dos últimos 30 dias, por moeda", () => {
    const mrrSales: KiwifySale[] = [
      { status: "paid", net_amount: 5000, currency: "BRL" },
      { status: "approved", net_amount: 2500, currency: "BRL" },
      { status: "pending", net_amount: 9999, currency: "BRL" }, // ignorado (não paid)
      { status: "paid", net_amount: 1000, currency: "USD" },
    ];
    const r = aggregateKiwifyDashboard(aggInput({ mrrSales }));
    expect(r.mrrApprox).toEqual([
      { currency: "BRL", value: 7500 },
      { currency: "USD", value: 1000 },
    ]);
  });
});

describe("aggregateKiwifyDashboard — stats e gaps honestos", () => {
  it("refundRate/chargebackRate vêm de /stats; gaps são null", () => {
    const r = aggregateKiwifyDashboard(aggInput({ stats: { refund_rate: 3.5, chargeback_rate: 0.8 } }));
    expect(r.refundRate).toBe(3.5);
    expect(r.chargebackRate).toBe(0.8);
    expect(r.activeSubscriptions).toBeNull();
    expect(r.churnRate).toBeNull();
    expect(r.currencyPrimary).toBe("BRL");
  });

  it("dataset vazio: sem divisão por zero, tudo zerado/vazio", () => {
    const r = aggregateKiwifyDashboard(aggInput());
    expect(r.recurringRevenue).toEqual([]);
    expect(r.mrrApprox).toEqual([]);
    expect(r.charges.paid).toEqual({ count: 0, value: [] });
    expect(r.charges.refused).toEqual({ count: 0 });
    expect(r.refundRate).toBe(0);
    expect(r.chargebackRate).toBe(0);
    expect(r.newVsRenewal).toEqual({ new: 0, renewal: 0 });
    expect(r.statusDistribution).toEqual([]);
    expect(r.activeSubscriptions).toBeNull();
    expect(r.churnRate).toBeNull();
  });
});

describe("getKiwifyToken — OAuth, cache, refresh e segurança", () => {
  beforeEach(() => {
    clearKiwifyTokenCache();
    vi.restoreAllMocks();
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("POST form-urlencoded com client_id/client_secret e retorna access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "tok-123", token_type: "Bearer", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await getKiwifyToken("my-client-id", "my-client-secret");
    expect(token).toBe("tok-123");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toContain("client_id=my-client-id");
    expect(init.body).toContain("client_secret=my-client-secret");
  });

  it("reutiliza o token do cache (1 fetch para 2 chamadas)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "tok-cache", expires_in: 86400 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getKiwifyToken("cid", "csecret");
    await getKiwifyToken("cid", "csecret");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renova o token quando o cache expira (refresh skew de 5min)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-1", expires_in: 360 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok-2", expires_in: 360 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const t1 = await getKiwifyToken("cid", "csecret");
    expect(t1).toBe("tok-1");
    // expires_in=360s, skew=300s -> expira em ~60s. Avança 61s.
    vi.advanceTimersByTime(61 * 1000);
    const t2 = await getKiwifyToken("cid", "csecret");
    expect(t2).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("em falha de auth lança Error sem vazar o clientSecret nem o token", async () => {
    const secret = "TOP-SECRET-DO-NOT-LEAK";
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    let caught: Error | null = null;
    try {
      await getKiwifyToken("cid", secret);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).not.toContain(secret);
  });
});

describe("fetchSalesCount — soma pagination.count por janela (page_size=1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("faz 1 chamada por janela de 90d e soma os counts", async () => {
    // 12 meses -> 5 janelas -> 5 chamadas, cada uma retornando count=10 -> 50.
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ pagination: { count: 10, page_number: 1, page_size: 1 }, data: [] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const count = await fetchSalesCount("tok", "acc-1", {
      from: "2025-06-12",
      to: "2026-06-12",
      status: "paid",
    });
    expect(count).toBe(50);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Header x-kiwify-account-id sempre presente; nunca loga o token no header de forma indevida.
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["x-kiwify-account-id"]).toBe("acc-1");
    expect(init.headers.Authorization).toBe("Bearer tok");
    // page_size=1 na querystring (conta sem baixar tudo).
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("page_size=1");
    expect(url).toContain("status=paid");
  });
});

describe("listKiwifyProducts — paginação por offset + filtro recurring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pagina por page_number até esgotar pagination.count e filtra recurring", async () => {
    const page1 = {
      pagination: { count: 3, page_number: 1, page_size: 100 },
      data: [
        { id: "1", name: "Beta", payment_type: "recurring" },
        { id: "2", name: "Avulso", payment_type: "one_time" },
      ],
    };
    // count=3 mas page1 só trouxe 2 -> busca page2.
    const page2 = {
      pagination: { count: 3, page_number: 2, page_size: 100 },
      data: [{ id: "3", name: "Alpha", payment_type: "recurring" }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const products = await listKiwifyProducts("tok", "acc-1");
    // Só recurring, ordenado por name (Alpha, Beta).
    expect(products).toEqual([
      { id: "3", name: "Alpha" },
      { id: "1", name: "Beta" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
