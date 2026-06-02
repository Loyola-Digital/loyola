/**
 * Story 18.28: Testes para compilação de criativos
 * AC1: Detectar "Todos" em filtros
 * AC2: Compilar métricas corretamente
 */

import { describe, it, expect } from "vitest";
import {
  compileCreativeMetricsByName,
  isAllFiltersSelected,
  type CompiledCreativeMetric,
} from "../compileCreativeMetrics";
import type { CreativeMetrics } from "../creative-metrics-calculator";

// Mock de dados
const mockMetrics: CreativeMetrics[] = [
  {
    adId: "ad_1_hot",
    adName: "Criativo A",
    spend: 100,
    spendPercent: 50,
    impressions: 1000,
    clicks: 50,
    ctr: 0.05,
    cpc: 2,
    cpm: 100,
    leads: 5,
    cpl: 20,
    revenue: 200,
    roas: 2,
    roi: 100,
    cvr: 0.005,
    utmTerm: "test_1",
    temperature: "hot" as const,
    totalSpend: 200,
  },
  {
    adId: "ad_1_cold",
    adName: "Criativo A",
    spend: 100,
    spendPercent: 50,
    impressions: 1000,
    clicks: 30,
    ctr: 0.03,
    cpc: 3.33,
    cpm: 100,
    leads: 3,
    cpl: 33.33,
    revenue: 150,
    roas: 1.5,
    roi: 50,
    cvr: 0.003,
    utmTerm: "test_1",
    temperature: "cold" as const,
    totalSpend: 200,
  },
  {
    adId: "ad_2_hot",
    adName: "Criativo B",
    spend: 150,
    spendPercent: 75,
    impressions: 2000,
    clicks: 100,
    ctr: 0.05,
    cpc: 1.5,
    cpm: 75,
    leads: 10,
    cpl: 15,
    revenue: 300,
    roas: 2,
    roi: 100,
    cvr: 0.005,
    utmTerm: "test_2",
    temperature: "hot" as const,
    totalSpend: 200,
  },
];

describe("compileCreativeMetrics", () => {
  describe("AC1: Detectar seleção 'Todos' em filtros", () => {
    it("deve retornar false quando temperatureFilter = 'hot'", () => {
      expect(isAllFiltersSelected("hot")).toBe(false);
    });

    it("deve retornar false quando temperatureFilter = 'cold'", () => {
      expect(isAllFiltersSelected("cold")).toBe(false);
    });

    it("deve retornar true quando temperatureFilter = 'all'", () => {
      expect(isAllFiltersSelected("all")).toBe(true);
    });
  });

  describe("AC2: Compilar valores por ad_name", () => {
    let compiled: CompiledCreativeMetric[];

    beforeEach(() => {
      compiled = compileCreativeMetricsByName(mockMetrics);
    });

    it("deve agrupar por ad_name corretamente", () => {
      expect(compiled).toHaveLength(2);
      expect(compiled.map((c) => c.adName)).toEqual(["Criativo A", "Criativo B"]);
    });

    it("deve somar spend corretamente", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      expect(creativoA?.spend).toBe(200); // 100 + 100
    });

    it("deve somar impressions corretamente", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      expect(creativoA?.impressions).toBe(2000); // 1000 + 1000
    });

    it("deve calcular CTR como média ponderada (cliques / impressões)", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      // (50 + 30) / (1000 + 1000) = 80 / 2000 = 0.04
      expect(creativoA?.ctr).toBeCloseTo(0.04, 5);
    });

    it("deve calcular CPC como média aritmética (spend / cliques)", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      // 200 / (50 + 30) = 200 / 80 = 2.5
      expect(creativoA?.cpc).toBeCloseTo(2.5, 5);
    });

    it("deve calcular ROAS como soma(revenue) / soma(spend)", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      // (200 + 150) / 200 = 350 / 200 = 1.75
      expect(creativoA?.roas).toBeCloseTo(1.75, 5);
    });

    it("deve registrar originalCount corretamente", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      expect(creativoA?.originalCount).toBe(2); // 2 variantes (hot + cold)

      const creativoB = compiled.find((c) => c.adName === "Criativo B");
      expect(creativoB?.originalCount).toBe(1); // 1 variante (hot)
    });

    it("deve marcar como compiled = true", () => {
      expect(compiled.every((c) => c.compiled === true)).toBe(true);
    });

    it("deve somar leads corretamente", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      expect(creativoA?.leads).toBe(8); // 5 + 3
    });

    it("deve somar revenue corretamente", () => {
      const creativoA = compiled.find((c) => c.adName === "Criativo A");
      expect(creativoA?.revenue).toBe(350); // 200 + 150
    });
  });

  describe("AC2 (edge cases)", () => {
    it("deve lidar com array vazio", () => {
      const result = compileCreativeMetricsByName([]);
      expect(result).toEqual([]);
    });

    it("deve calcular corretamente quando só há um criativo", () => {
      const single = [mockMetrics[0]];
      const result = compileCreativeMetricsByName(single);

      expect(result).toHaveLength(1);
      expect(result[0].spend).toBe(100);
      expect(result[0].originalCount).toBe(1);
    });

    it("deve evitar divisão por zero em CTR (impressions = 0)", () => {
      const noImp: CreativeMetrics = {
        ...mockMetrics[0],
        impressions: 0,
        clicks: 0,
        ctr: 0,
      };
      const result = compileCreativeMetricsByName([noImp]);

      expect(result[0].ctr).toBe(0);
      expect(Number.isFinite(result[0].ctr)).toBe(true);
    });

    it("deve evitar divisão por zero em CPC (clicks = 0)", () => {
      const noClicks: CreativeMetrics = {
        ...mockMetrics[0],
        clicks: 0,
        cpc: 0,
      };
      const result = compileCreativeMetricsByName([noClicks]);

      expect(result[0].cpc).toBe(0);
      expect(Number.isFinite(result[0].cpc)).toBe(true);
    });
  });
});
