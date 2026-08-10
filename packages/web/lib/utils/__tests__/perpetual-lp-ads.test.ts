// Story 29.47 — AC4 (guarda da colisão) e AC5 (receita no grão de ad_id).
import { describe, it, expect } from "vitest";
import { buildLpAdInputs, chunkAdIds, LP_LINK_URL_BATCH } from "@/lib/utils/perpetual-lp-ads";
import { buildLpRows, UNRESOLVED_LP_KEY } from "@/lib/utils/perpetual-lp-rows";

const semImposto = (v: number) => v;
const row = (entityId: string, dateStart: string, spend: number) => ({
  entityId, dateStart, spend, impressions: 1000, clicks: 10, linkClicks: 8,
});

describe("buildLpAdInputs", () => {
  it("agrega a serie diaria por ad_id", () => {
    const out = buildLpAdInputs(
      [row("ad_1", "2026-08-01", 100), row("ad_1", "2026-08-02", 50), row("ad_2", "2026-08-01", 30)],
      new Map(),
      semImposto,
    );
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.campaignId === "ad_1")!.spend).toBe(150);
    expect(out.find((a) => a.campaignId === "ad_2")!.spend).toBe(30);
  });

  // O erro que este teste impede: somar a receita dentro do laço diário faria
  // um anuncio com 30 dias de veiculacao aparecer com 30x o faturamento.
  it("nao multiplica a receita pelo numero de dias", () => {
    const out = buildLpAdInputs(
      [row("ad_1", "2026-08-01", 10), row("ad_1", "2026-08-02", 10), row("ad_1", "2026-08-03", 10)],
      new Map([["ad_1", { vendas: 2, bruto: 500 }]]),
      semImposto,
    );
    expect(out[0].revenue).toBe(500);
    expect(out[0].sales).toBe(2);
  });

  // A aliquota e date-aware: somar primeiro e tributar depois erraria numa
  // janela que cruze a virada do ano.
  it("aplica o imposto por dia, nao sobre o total", () => {
    const taxPorDia = (v: number, d: string) => (d >= "2026-01-01" ? v * 2 : v);
    const out = buildLpAdInputs(
      [row("ad_1", "2025-12-31", 100), row("ad_1", "2026-01-01", 100)],
      new Map(),
      taxPorDia,
    );
    expect(out[0].spend).toBe(300); // 100 + 200, nao 400
  });

  it("anuncio sem venda fica com receita zero, nao undefined", () => {
    const out = buildLpAdInputs([row("ad_9", "2026-08-01", 10)], new Map(), semImposto);
    expect(out[0].revenue).toBe(0);
    expect(out[0].sales).toBe(0);
  });
});

// ---- AC4: o teste que falha na implementacao anterior ----
describe("AC4 — mesmo Ad Name em LPs diferentes", () => {
  it("dois ad_ids do mesmo criativo em LPs distintas geram DUAS linhas", () => {
    // Antes da 29.47 a populacao vinha agregada por Ad Name: os dois anuncios
    // abaixo chegariam como UMA entrada de R$ 200 com a URL do primeiro id.
    const ads = buildLpAdInputs(
      [row("ad_a", "2026-08-01", 100), row("ad_b", "2026-08-01", 100)],
      new Map(),
      semImposto,
    );
    const rows = buildLpRows(
      ads,
      { ad_a: "https://lp.exemplo.com/pagina-a", ad_b: "https://lp.exemplo.com/pagina-b" },
      [],
      0,
      [],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key).sort()).toEqual([
      "lp.exemplo.com/pagina-a",
      "lp.exemplo.com/pagina-b",
    ]);
    expect(rows.every((r) => r.spend === 100)).toBe(true);
    expect(rows.some((r) => r.spend === 200)).toBe(false);
  });

  it("a receita segue cada ad_id para a sua LP", () => {
    const ads = buildLpAdInputs(
      [row("ad_a", "2026-08-01", 100), row("ad_b", "2026-08-01", 100)],
      new Map([
        ["ad_a", { vendas: 3, bruto: 900 }],
        ["ad_b", { vendas: 1, bruto: 200 }],
      ]),
      semImposto,
    );
    const rows = buildLpRows(
      ads,
      { ad_a: "https://lp.exemplo.com/pagina-a", ad_b: "https://lp.exemplo.com/pagina-b" },
      [],
      0,
      [],
    );
    const a = rows.find((r) => r.key === "lp.exemplo.com/pagina-a")!;
    const b = rows.find((r) => r.key === "lp.exemplo.com/pagina-b")!;
    expect([a.revenue, a.sales]).toEqual([900, 3]);
    expect([b.revenue, b.sales]).toEqual([200, 1]);
  });

  // AC3: a invariante da 29.40 sobrevive ao grao mais fino.
  it("a soma das linhas (incluindo a nao resolvida) fecha com a dos anuncios", () => {
    const ads = buildLpAdInputs(
      [row("ad_a", "2026-08-01", 100), row("ad_b", "2026-08-01", 55), row("ad_c", "2026-08-01", 45)],
      new Map(),
      semImposto,
    );
    const rows = buildLpRows(
      ads,
      { ad_a: "https://lp.exemplo.com/x", ad_b: "https://lp.exemplo.com/y" }, // ad_c sem URL
      ["ad_c"],
      0,
      [],
    );
    const total = rows.reduce((s, r) => s + r.spend, 0);
    expect(total).toBe(200);
    expect(rows.find((r) => r.key === UNRESOLVED_LP_KEY)!.spend).toBe(45);
  });
});

// ---- AC6: lotes ----
describe("chunkAdIds", () => {
  it("divide em lotes do tamanho configurado", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `ad_${i}`);
    const lotes = chunkAdIds(ids, 100);
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50]);
    expect(lotes.flat()).toEqual(ids);
  });

  it("lista vazia nao gera lote", () => {
    expect(chunkAdIds([])).toEqual([]);
  });

  it("os 184 ids medidos em producao cabem em 2 lotes", () => {
    const ids = Array.from({ length: 184 }, (_, i) => `ad_${i}`);
    expect(chunkAdIds(ids, LP_LINK_URL_BATCH)).toHaveLength(2);
  });
});
