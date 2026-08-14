import { describe, it, expect } from "vitest";
import { normalizeRevenuecatEvent, readSubscriberAttribute } from "../services/revenuecat";

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

  // ============================================================
  // Story 42.6 — atribuição
  // ============================================================
  describe("atribuição (subscriber_attributes)", () => {
    /**
     * Os dois formatos chegam em produção HOJE, no mesmo campo: objeto em 34
     * eventos de `utm_campaign` e string plana em 3.226. Ler só um perde 99%
     * ou 1% do dado.
     */
    it("lê o formato objeto {value, updated_at_ms}", () => {
      const { payload, raw } = corpo({
        id: "evt_a",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: {
          utm_campaign: { value: "120245795896940452", updated_at_ms: 1786671817959 },
          utm_content: { value: "120245850540320452", updated_at_ms: 1786671817959 },
        },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmCampaign).toBe("120245795896940452");
      expect(n.utmContent).toBe("120245850540320452");
    });

    it("lê o formato string plana", () => {
      const { payload, raw } = corpo({
        id: "evt_b",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: { utm_campaign: "ig4a", utm_source: "apps.instagram.com" },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmCampaign).toBe("ig4a");
      expect(n.utmSource).toBe("apps.instagram.com");
    });

    it("os cinco UTMs, os click ids e o acquisition_source são extraídos", () => {
      const { payload, raw } = corpo({
        id: "evt_c",
        type: "RENEWAL",
        subscriber_attributes: {
          utm_source: "meta-ads",
          utm_medium: "120245795896950452",
          utm_campaign: "120245795896940452",
          utm_term: "bio",
          utm_content: "120245850540320452",
          gclid: "Cj0KCQ",
          fbclid: "IwAR1",
          acquisition_source: "paid_ads",
        },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmSource).toBe("meta-ads");
      expect(n.utmMedium).toBe("120245795896950452");
      expect(n.utmCampaign).toBe("120245795896940452");
      expect(n.utmTerm).toBe("bio");
      expect(n.utmContent).toBe("120245850540320452");
      expect(n.gclid).toBe("Cj0KCQ");
      expect(n.fbclid).toBe("IwAR1");
      expect(n.acquisitionSource).toBe("paid_ads");
    });

    it("sem subscriber_attributes tudo fica null, sem lançar", () => {
      const { payload, raw } = corpo({ id: "evt_d", type: "PAYWALL_IMPRESSION" });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmSource).toBeNull();
      expect(n.utmCampaign).toBeNull();
      expect(n.gclid).toBeNull();
      expect(n.acquisitionSource).toBeNull();
    });

    /**
     * 8 eventos em produção trazem `{{ad.id}}` literal — macro da Meta que não
     * interpolou. Persistir isso cria um "anúncio" chamado `{{ad.id}}` na
     * tabela de Detalhamento, com vendas > 0 e investimento zero.
     */
    it("macro não interpolado e (not set) viram null", () => {
      const { payload, raw } = corpo({
        id: "evt_e",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: {
          utm_campaign: "{{campaign.id}}",
          utm_medium: "{{adset.id}}",
          utm_content: "{{ad.id}}",
          utm_source: "(not set)",
          utm_term: "   ",
        },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmCampaign).toBeNull();
      expect(n.utmMedium).toBeNull();
      expect(n.utmContent).toBeNull();
      expect(n.utmSource).toBeNull();
      expect(n.utmTerm).toBeNull();
    });

    it("usa o atributo reservado ($) quando o utm_* falta", () => {
      const { payload, raw } = corpo({
        id: "evt_f",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: {
          $campaign: "campanha_do_rc",
          $mediaSource: "fonte_do_rc",
          $keyword: "palavra",
          $creative: "criativo",
        },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      expect(n.utmCampaign).toBe("campanha_do_rc");
      expect(n.utmSource).toBe("fonte_do_rc");
      expect(n.utmTerm).toBe("palavra");
      expect(n.utmContent).toBe("criativo");
    });

    it("com os dois presentes, utm_* vence o reservado", () => {
      const { payload, raw } = corpo({
        id: "evt_g",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: { utm_campaign: "do_utm", $campaign: "do_rc" },
      });
      expect(normalizeRevenuecatEvent(payload, raw)!.utmCampaign).toBe("do_utm");
    });

    it("utm_* descartado como lixo cai no reservado", () => {
      const { payload, raw } = corpo({
        id: "evt_h",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: { utm_campaign: "{{campaign.id}}", $campaign: "campanha_real" },
      });
      expect(normalizeRevenuecatEvent(payload, raw)!.utmCampaign).toBe("campanha_real");
    });

    /** PII fica no payload e nunca vira coluna — mesma regra da Secret Key. */
    it("nenhum atributo de PII entra no objeto normalizado", () => {
      const { payload, raw } = corpo({
        id: "evt_i",
        type: "INITIAL_PURCHASE",
        subscriber_attributes: {
          $email: "pessoa@exemplo.com",
          $phoneNumber: "+5511999999999",
          $displayName: "Fulano",
          $ip: "203.0.113.10",
          $idfa: "AAAA-BBBB",
          $gpsAdId: "CCCC-DDDD",
          $fbAnonId: "EEEE",
          utm_campaign: "ig4a",
        },
      });
      const n = normalizeRevenuecatEvent(payload, raw)!;
      const serializado = JSON.stringify(n);
      for (const pii of ["pessoa@exemplo.com", "+5511999999999", "Fulano", "203.0.113.10", "AAAA-BBBB", "CCCC-DDDD", "EEEE"]) {
        expect(serializado).not.toContain(pii);
      }
      expect(n.utmCampaign).toBe("ig4a");
    });
  });

  describe("readSubscriberAttribute", () => {
    it("objeto, string, número e booleano", () => {
      expect(readSubscriberAttribute({ k: { value: "x" } }, "k")).toBe("x");
      expect(readSubscriberAttribute({ k: "x" }, "k")).toBe("x");
      expect(readSubscriberAttribute({ k: 42 }, "k")).toBe("42");
      expect(readSubscriberAttribute({ k: { value: 42 } }, "k")).toBe("42");
      expect(readSubscriberAttribute({ k: true }, "k")).toBe("true");
    });

    it("ausente, vazio, nulo e formato inesperado devolvem null", () => {
      expect(readSubscriberAttribute({}, "k")).toBeNull();
      expect(readSubscriberAttribute(null, "k")).toBeNull();
      expect(readSubscriberAttribute(undefined, "k")).toBeNull();
      expect(readSubscriberAttribute("nem é objeto", "k")).toBeNull();
      expect(readSubscriberAttribute([1, 2], "k")).toBeNull();
      expect(readSubscriberAttribute({ k: "" }, "k")).toBeNull();
      expect(readSubscriberAttribute({ k: { value: null } }, "k")).toBeNull();
      expect(readSubscriberAttribute({ k: { semValue: "x" } }, "k")).toBeNull();
    });

    it("apara espaços em volta do valor", () => {
      expect(readSubscriberAttribute({ k: "  ig4a  " }, "k")).toBe("ig4a");
    });
  });
});
