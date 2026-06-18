import { describe, it, expect } from "vitest";
import {
  normalizeKiwifySubscriptionEvent,
  mapKiwifyStatus,
  computeDedupKey,
  parseKiwifyDate,
  extractEventType,
  extractOrderId,
} from "../services/kiwify-subscriptions";

describe("computeDedupKey", () => {
  it("é estável e sensível ao conteúdo (sha256)", () => {
    const a = computeDedupKey('{"order_id":"1"}');
    const b = computeDedupKey('{"order_id":"1"}');
    const c = computeDedupKey('{"order_id":"2"}');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("mapKiwifyStatus", () => {
  it("normaliza sinônimos para o conjunto canônico", () => {
    expect(mapKiwifyStatus("paid")).toBe("active");
    expect(mapKiwifyStatus("approved")).toBe("active");
    expect(mapKiwifyStatus("active")).toBe("active");
    expect(mapKiwifyStatus("waiting_payment")).toBe("waiting_payment");
    expect(mapKiwifyStatus("cancelled")).toBe("canceled");
    expect(mapKiwifyStatus("canceled")).toBe("canceled");
    expect(mapKiwifyStatus("overdue")).toBe("late");
    expect(mapKiwifyStatus("refunded")).toBe("refunded");
    expect(mapKiwifyStatus("chargeback")).toBe("chargedback");
    expect(mapKiwifyStatus("TRIAL")).toBe("trialing");
  });

  it("retorna 'unknown' para vazio/desconhecido", () => {
    expect(mapKiwifyStatus(undefined)).toBe("unknown");
    expect(mapKiwifyStatus("")).toBe("unknown");
    expect(mapKiwifyStatus("banana")).toBe("unknown");
  });
});

describe("parseKiwifyDate", () => {
  it("parseia ISO e 'YYYY-MM-DD HH:mm:ss' (como UTC)", () => {
    expect(parseKiwifyDate("2026-06-16T13:00:00Z")?.toISOString()).toBe("2026-06-16T13:00:00.000Z");
    expect(parseKiwifyDate("2026-06-16 13:00:00")?.toISOString()).toBe("2026-06-16T13:00:00.000Z");
    expect(parseKiwifyDate("2026-06-16")?.toISOString()).toBe("2026-06-16T00:00:00.000Z");
  });

  it("retorna null para inválido/ausente", () => {
    expect(parseKiwifyDate(null)).toBeNull();
    expect(parseKiwifyDate("")).toBeNull();
    expect(parseKiwifyDate("not-a-date")).toBeNull();
    expect(parseKiwifyDate(123 as unknown)).toBeNull();
  });
});

describe("extractEventType / extractOrderId", () => {
  it("lê dos vários caminhos candidatos", () => {
    expect(extractEventType({ webhook_event_type: "subscription_canceled" })).toBe(
      "subscription_canceled",
    );
    expect(extractEventType({ order_status: "paid" })).toBe("paid");
    expect(extractOrderId({ order_id: "ord_123" })).toBe("ord_123");
    expect(extractOrderId({ reference: "ref_9" })).toBe("ref_9");
  });
});

describe("normalizeKiwifySubscriptionEvent", () => {
  it("retorna null quando não há assinatura identificável", () => {
    expect(normalizeKiwifySubscriptionEvent({ order_id: "1", order_status: "paid" })).toBeNull();
  });

  it("extrai assinatura de payload com chaves capitalizadas (formato Kiwify)", () => {
    const payload = {
      order_id: "ord_1",
      webhook_event_type: "order_approved",
      Subscription: {
        id: "sub_42",
        status: "active",
        start_date: "2026-01-10 09:00:00",
        next_payment: "2026-02-10 09:00:00",
        plan: { name: "Mensal Premium" },
      },
      Product: { product_id: "prod_7", product_name: "Comunidade X" },
      Customer: { full_name: "Maria Silva", email: "maria@example.com" },
      Commissions: { charge_amount: 9700, currency: "BRL" },
    };
    const n = normalizeKiwifySubscriptionEvent(payload);
    expect(n).not.toBeNull();
    expect(n!.subscriptionId).toBe("sub_42");
    expect(n!.status).toBe("active");
    expect(n!.productId).toBe("prod_7");
    expect(n!.productName).toBe("Comunidade X");
    expect(n!.planName).toBe("Mensal Premium");
    expect(n!.customerName).toBe("Maria Silva");
    expect(n!.customerEmail).toBe("maria@example.com");
    expect(n!.amount).toBe(9700);
    expect(n!.currency).toBe("BRL");
    expect(n!.orderId).toBe("ord_1");
    expect(n!.startedAt?.toISOString()).toBe("2026-01-10T09:00:00.000Z");
    expect(n!.nextChargeAt?.toISOString()).toBe("2026-02-10T09:00:00.000Z");
    expect(n!.canceledAt).toBeNull();
  });

  it("deriva status 'canceled' do evento quando o objeto não traz status, e seta canceledAt", () => {
    const payload = {
      webhook_event_type: "subscription_canceled",
      subscription: { subscription_id: "sub_99", updated_at: "2026-06-16 10:00:00" },
    };
    const n = normalizeKiwifySubscriptionEvent(payload);
    expect(n!.subscriptionId).toBe("sub_99");
    expect(n!.status).toBe("canceled");
    expect(n!.canceledAt?.toISOString()).toBe("2026-06-16T10:00:00.000Z");
  });

  it("usa BRL como moeda default quando ausente", () => {
    const n = normalizeKiwifySubscriptionEvent({ Subscription: { id: "s1", status: "active" } });
    expect(n!.currency).toBe("BRL");
    expect(n!.amount).toBeNull();
  });
});
