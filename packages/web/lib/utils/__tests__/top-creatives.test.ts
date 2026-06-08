import { describe, it, expect } from "vitest";
import {
  computeRelevanceThreshold,
  applyRelevanceFilter,
  type AggregatedCreative,
} from "../top-creatives";

/**
 * Story 8.9: testes do filtro de relevância estatística.
 *
 * NOTA: packages/web ainda não tem vitest configurado. Estes tests rodam
 * quando o test runner for adicionado ao web. Padrão segue @loyola-x/api.
 */

function mockCreative(
  overrides: Partial<AggregatedCreative> & { name: string; spend: number },
): AggregatedCreative {
  return {
    ids: [overrides.name],
    impressions: 0,
    clicks: 0,
    reach: 0,
    ctr: 0,
    cpc: 0,
    creative: null,
    parentInfo: undefined,
    videoMetrics: null,
    leadsPagos: 0,
    leadsOrg: 0,
    leadsSemTrack: 0,
    cplPago: null,
    cplQualified: null,
    leadsLegacy: 0,
    salesLegacy: 0,
    roasLegacy: null,
    ...overrides,
  };
}

describe("computeRelevanceThreshold", () => {
  it("mode cpa: com vendas, threshold = 1,5 × (sum(spend) / sum(salesLegacy))", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 300, salesLegacy: 3 }),
      mockCreative({ name: "B", spend: 200, salesLegacy: 2 }),
    ];
    const result = computeRelevanceThreshold(creatives);
    expect(result.mode).toBe("cpa");
    expect(result.cpaMedio).toBe(100); // 500 / 5
    expect(result.threshold).toBe(150); // 1,5 × 100
  });

  it("mode spend: sem vendas, threshold = 1,5 × gasto médio dos com spend > 0", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 200, salesLegacy: 0 }),
      mockCreative({ name: "B", spend: 100, salesLegacy: 0 }),
      mockCreative({ name: "C", spend: 0, salesLegacy: 0 }), // ignorado no denominador
    ];
    const result = computeRelevanceThreshold(creatives);
    expect(result.mode).toBe("spend");
    expect(result.cpaMedio).toBeNull();
    expect(result.threshold).toBe(225); // 1,5 × (300 / 2)
  });

  it("mode disabled: lista vazia", () => {
    const result = computeRelevanceThreshold([]);
    expect(result.mode).toBe("disabled");
    expect(result.threshold).toBe(0);
    expect(result.cpaMedio).toBeNull();
  });

  it("mode disabled: spend total = 0", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 0, salesLegacy: 0 }),
      mockCreative({ name: "B", spend: 0, salesLegacy: 0 }),
    ];
    const result = computeRelevanceThreshold(creatives);
    expect(result.mode).toBe("disabled");
    expect(result.threshold).toBe(0);
  });

  it("criativo com vendas e spend zerado não quebra (edge case)", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 100, salesLegacy: 2 }),
      mockCreative({ name: "B", spend: 0, salesLegacy: 0 }),
    ];
    const result = computeRelevanceThreshold(creatives);
    expect(result.mode).toBe("cpa");
    expect(result.threshold).toBe(75); // 1,5 × (100 / 2)
  });
});

describe("applyRelevanceFilter", () => {
  it("filtra criativos com spend < threshold; threshold exato passa (>=)", () => {
    const creatives = [
      mockCreative({ name: "high", spend: 500 }),
      mockCreative({ name: "exact", spend: 200 }), // threshold
      mockCreative({ name: "low", spend: 50 }),
    ];
    const result = applyRelevanceFilter(creatives, {
      threshold: 200,
      mode: "cpa",
      cpaMedio: 100,
    });
    expect(result.visible.map((c) => c.name)).toEqual(["high", "exact"]);
    expect(result.hiddenCount).toBe(1);
  });

  it("mode disabled retorna a lista inteira intacta", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 10 }),
      mockCreative({ name: "B", spend: 5 }),
    ];
    const result = applyRelevanceFilter(creatives, {
      threshold: 0,
      mode: "disabled",
      cpaMedio: null,
    });
    expect(result.visible).toHaveLength(2);
    expect(result.hiddenCount).toBe(0);
  });

  it("lista vazia retorna vazio com 0 ocultos", () => {
    const result = applyRelevanceFilter([], {
      threshold: 100,
      mode: "spend",
      cpaMedio: null,
    });
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });

  it("todos abaixo do threshold → visible vazio + hiddenCount = N", () => {
    const creatives = [
      mockCreative({ name: "A", spend: 50 }),
      mockCreative({ name: "B", spend: 30 }),
    ];
    const result = applyRelevanceFilter(creatives, {
      threshold: 200,
      mode: "cpa",
      cpaMedio: 100,
    });
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(2);
  });
});
