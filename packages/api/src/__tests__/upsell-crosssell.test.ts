import { describe, it, expect } from "vitest";
import { computeUpsellCrossSell, type HtPurchase } from "../services/upsell-crosssell.js";

const d = (s: string) => new Date(s + "T12:00:00");

describe("computeUpsellCrossSell", () => {
  it("conta HT só quando é DEPOIS da 1ª compra perpétua (nunca antes)", () => {
    const perpEmails = new Set(["a@x.com", "b@x.com"]);
    const earliest = new Map([
      ["a@x.com", d("2026-01-10")],
      ["b@x.com", d("2026-03-01")],
    ]);
    const ht: HtPurchase[] = [
      { email: "a@x.com", date: d("2026-02-01"), value: 5000, name: "A" }, // depois → conta
      { email: "b@x.com", date: d("2026-02-01"), value: 5000, name: "B" }, // ANTES → não conta
    ];
    const r = computeUpsellCrossSell(perpEmails, earliest, ht);
    expect(r.upsells).toBe(1);
    expect(r.upsellTransacoes).toBe(1);
    expect(r.faturamentoHighTicket).toBe(5000);
    expect(r.compradores[0].email).toBe("a@x.com");
  });

  it("HT no MESMO instante da compra perpétua não conta (estritamente depois)", () => {
    const perpEmails = new Set(["a@x.com"]);
    const earliest = new Map([["a@x.com", d("2026-01-10")]]);
    const ht: HtPurchase[] = [{ email: "a@x.com", date: d("2026-01-10"), value: 3000, name: null }];
    expect(computeUpsellCrossSell(perpEmails, earliest, ht).upsells).toBe(0);
  });

  it("HT de quem NÃO comprou o perpétuo não conta", () => {
    const perpEmails = new Set(["a@x.com"]);
    const earliest = new Map([["a@x.com", d("2026-01-10")]]);
    const ht: HtPurchase[] = [{ email: "estranho@x.com", date: d("2026-05-01"), value: 9000, name: null }];
    expect(computeUpsellCrossSell(perpEmails, earliest, ht).upsells).toBe(0);
  });

  it("sem data confiável no HT não conta (garante o nunca antes)", () => {
    const perpEmails = new Set(["a@x.com"]);
    const earliest = new Map([["a@x.com", d("2026-01-10")]]);
    const ht: HtPurchase[] = [{ email: "a@x.com", date: null, value: 3000, name: null }];
    expect(computeUpsellCrossSell(perpEmails, earliest, ht).upsells).toBe(0);
  });

  it("comprador perpétuo sem data não pode ser pareado (sem referência p/ 'depois')", () => {
    const perpEmails = new Set(["a@x.com"]);
    const earliest = new Map<string, Date>(); // email na base, mas sem data
    const ht: HtPurchase[] = [{ email: "a@x.com", date: d("2026-05-01"), value: 3000, name: null }];
    expect(computeUpsellCrossSell(perpEmails, earliest, ht).upsells).toBe(0);
  });

  it("múltiplas compras HF do mesmo comprador somam valor e contam transações", () => {
    const perpEmails = new Set(["a@x.com"]);
    const earliest = new Map([["a@x.com", d("2026-01-01")]]);
    const ht: HtPurchase[] = [
      { email: "a@x.com", date: d("2026-02-01"), value: 5000, name: "A" },
      { email: "a@x.com", date: d("2026-03-01"), value: 3000, name: "A" },
    ];
    const r = computeUpsellCrossSell(perpEmails, earliest, ht);
    expect(r.upsells).toBe(1);
    expect(r.upsellTransacoes).toBe(2);
    expect(r.faturamentoHighTicket).toBe(8000);
    expect(r.ticketMedioHighTicket).toBe(4000);
    expect(r.compradores[0].valorHighTicket).toBe(8000);
    expect(r.compradores[0].comprasHighTicket).toBe(2);
    // 1ª compra HT = a mais antiga
    expect(r.compradores[0].dataHighTicket).toBe(d("2026-02-01").toISOString());
  });

  it("taxa de upsell = upsells / base do perpétuo", () => {
    const perpEmails = new Set(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    const earliest = new Map([
      ["a@x.com", d("2026-01-01")],
      ["b@x.com", d("2026-01-01")],
      ["c@x.com", d("2026-01-01")],
      ["d@x.com", d("2026-01-01")],
    ]);
    const ht: HtPurchase[] = [{ email: "a@x.com", date: d("2026-02-01"), value: 5000, name: null }];
    const r = computeUpsellCrossSell(perpEmails, earliest, ht);
    expect(r.basePerpetuo).toBe(4);
    expect(r.upsells).toBe(1);
    expect(r.taxaUpsell).toBe(25);
  });
});
