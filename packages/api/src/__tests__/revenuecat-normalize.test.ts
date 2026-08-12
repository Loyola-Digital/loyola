import { describe, it, expect } from "vitest";
import { normalizeRevenuecatEvent } from "../services/revenuecat";

/** Envelope como o RevenueCat entrega: { event: {...}, api_version }. */
function corpo(evento: Record<string, unknown>) {
  const payload = { event: evento, api_version: "1.0" };
  return { payload, raw: JSON.stringify(payload) };
}

describe("normalizeRevenuecatEvent", () => {
  describe("data do evento", () => {
    it("compra preenche purchasedAt e eventAt", () => {
      const { payload, raw } = corpo({
        id: "evt_1",
        type: "INITIAL_PURCHASE",
        purchased_at_ms: 1786493449224,
        event_timestamp_ms: 1786493450000,
        price: 9.9,
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.purchasedAt?.toISOString()).toBe(new Date(1786493449224).toISOString());
      expect(n.eventAt?.toISOString()).toBe(new Date(1786493450000).toISOString());
    });

    /**
     * O caso que motivou o campo: 96% do volume recebido é paywall, e esses
     * eventos não têm `purchased_at_ms` — entravam sem data nenhuma.
     */
    it("paywall não tem purchasedAt, mas tem eventAt", () => {
      const { payload, raw } = corpo({
        id: "evt_2",
        type: "PAYWALL_IMPRESSION",
        event_timestamp_ms: 1786493450000,
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.purchasedAt).toBeNull();
      expect(n.eventAt?.toISOString()).toBe(new Date(1786493450000).toISOString());
    });

    it("sem event_timestamp_ms cai no purchased_at_ms", () => {
      const { payload, raw } = corpo({
        id: "evt_3",
        type: "RENEWAL",
        purchased_at_ms: 1786493449224,
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.eventAt?.toISOString()).toBe(new Date(1786493449224).toISOString());
    });

    it("evento sem carimbo algum não inventa data", () => {
      const { payload, raw } = corpo({ id: "evt_4", type: "TEST" });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.purchasedAt).toBeNull();
      expect(n.eventAt).toBeNull();
    });

    it("carimbo inválido (0, string, negativo) não vira data", () => {
      for (const ms of [0, -1, "abc", null]) {
        const { payload, raw } = corpo({ id: "x", type: "PAYWALL_CLOSE", event_timestamp_ms: ms });
        expect(normalizeRevenuecatEvent(payload, raw)!.eventAt).toBeNull();
      }
    });
  });

  describe("campos do evento", () => {
    it("extrai loja, produto, moeda e receita", () => {
      const { payload, raw } = corpo({
        id: "evt_5",
        type: "INITIAL_PURCHASE",
        store: "PLAY_STORE",
        environment: "PRODUCTION",
        app_user_id: "user_1",
        product_id: "lyrio_pro_mensal",
        country_code: "BR",
        currency: "BRL",
        price_in_purchased_currency: 29.9,
        price: 5.4,
        purchased_at_ms: 1786493449224,
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.store).toBe("PLAY_STORE");
      expect(n.productId).toBe("lyrio_pro_mensal");
      expect(n.currency).toBe("BRL");
      // Valores monetários viajam como STRING de propósito: a coluna é `numeric`
      // e converter pra float perderia precisão.
      expect(n.priceInPurchasedCurrency).toBe("29.9");
      expect(n.revenueUsd).toBe("5.4");
    });

    it("payload sem envelope (evento na raiz) também é aceito", () => {
      const evento = { id: "evt_6", type: "CANCELLATION", event_timestamp_ms: 1786493450000 };
      const n = normalizeRevenuecatEvent(evento, JSON.stringify(evento))!;
      expect(n.eventType).toBe("CANCELLATION");
      expect(n.eventAt).not.toBeNull();
    });

    it("sem event.id o dedup cai no hash do corpo", () => {
      const { payload, raw } = corpo({ type: "PAYWALL_CLOSE", event_timestamp_ms: 1 });
      const a = normalizeRevenuecatEvent(payload, raw)!;
      const b = normalizeRevenuecatEvent(payload, raw)!;
      expect(a.eventId).toBe(b.eventId);
      expect(a.eventId.length).toBeGreaterThan(10);
    });

    it("corpo sem evento (ping de conexão) devolve null em vez de linha vazia", () => {
      expect(normalizeRevenuecatEvent({}, "{}")).toBeNull();
      expect(normalizeRevenuecatEvent({ event: {} }, '{"event":{}}')).toBeNull();
    });
  });
});
