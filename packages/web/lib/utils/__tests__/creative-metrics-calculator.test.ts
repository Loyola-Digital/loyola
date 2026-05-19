import { describe, it, expect } from "vitest";
import {
  calculateTemperature,
  calculateCtr,
  calculateCpc,
  calculateCpm,
  calculateCpl,
  calculateRoas,
  calculateSpendPercent,
  calculateCreativeMetrics,
  formatMetricValue,
  type CreativeMetrics,
} from "../creative-metrics-calculator";

describe("creative-metrics-calculator", () => {
  describe("calculateTemperature", () => {
    it("identifica público hot", () => {
      expect(calculateTemperature("hot-audience-jan")).toBe("hot");
      expect(calculateTemperature("HOT_SEGMENT")).toBe("hot");
      expect(calculateTemperature("my-hot-list")).toBe("hot");
    });

    it("identifica público cold", () => {
      expect(calculateTemperature("cold-audience-feb")).toBe("cold");
      expect(calculateTemperature("COLD_RETARGETING")).toBe("cold");
    });

    it("retorna unknown para valores inválidos", () => {
      expect(calculateTemperature("warm-audience")).toBe("unknown");
      expect(calculateTemperature("")).toBe("unknown");
      expect(calculateTemperature(null)).toBe("unknown");
      expect(calculateTemperature(undefined)).toBe("unknown");
    });
  });

  describe("calculateCtr", () => {
    it("calcula CTR corretamente", () => {
      expect(calculateCtr(150, 5000)).toBe(3); // 150/5000 * 100
      expect(calculateCtr(1500, 50000)).toBe(3);
    });

    it("retorna 0 quando impressões = 0", () => {
      expect(calculateCtr(100, 0)).toBe(0);
    });

    it("calcula CTR com valores pequenos", () => {
      expect(calculateCtr(1, 1000)).toBeCloseTo(0.1);
    });
  });

  describe("calculateCpc", () => {
    it("calcula CPC corretamente", () => {
      expect(calculateCpc(1500, 150)).toBe(10); // 1500/150
    });

    it("retorna null quando cliques = 0", () => {
      expect(calculateCpc(5000, 0)).toBeNull();
    });

    it("calcula CPC com valores decimais", () => {
      expect(calculateCpc(100, 33)).toBeCloseTo(3.03, 1);
    });
  });

  describe("calculateCpm", () => {
    it("calcula CPM corretamente", () => {
      expect(calculateCpm(5000, 50000)).toBe(100); // (5000/50000)*1000
    });

    it("retorna null quando impressões = 0", () => {
      expect(calculateCpm(5000, 0)).toBeNull();
    });

    it("calcula CPM com valores diferentes", () => {
      expect(calculateCpm(1000, 100000)).toBe(10); // (1000/100000)*1000
    });
  });

  describe("calculateCpl", () => {
    it("calcula CPL corretamente", () => {
      expect(calculateCpl(5000, 300)).toBeCloseTo(16.67, 1); // 5000/300
    });

    it("retorna null quando leads = 0", () => {
      expect(calculateCpl(5000, 0)).toBeNull();
    });
  });

  describe("calculateRoas", () => {
    it("calcula ROAS corretamente", () => {
      expect(calculateRoas(15000, 5000)).toBe(3); // 15000/5000
    });

    it("retorna null quando spend = 0", () => {
      expect(calculateRoas(15000, 0)).toBeNull();
    });

    it("calcula ROAS < 1 (prejuízo)", () => {
      expect(calculateRoas(2000, 5000)).toBe(0.4);
    });
  });

  describe("calculateSpendPercent", () => {
    it("calcula percentual corretamente", () => {
      expect(calculateSpendPercent(5000, 50000)).toBe(10); // 5000/50000 * 100
      expect(calculateSpendPercent(10000, 50000)).toBe(20);
    });

    it("soma 100% quando todos os criativos", () => {
      const total = 50000;
      const percentuals = [
        calculateSpendPercent(5000, total),
        calculateSpendPercent(10000, total),
        calculateSpendPercent(15000, total),
        calculateSpendPercent(20000, total),
      ];
      expect(percentuals.reduce((a, b) => a + b)).toBe(100);
    });

    it("retorna 0 quando total = 0", () => {
      expect(calculateSpendPercent(5000, 0)).toBe(0);
    });
  });

  describe("calculateCreativeMetrics", () => {
    const mockCreative: CreativeMetrics = {
      adId: "123456",
      adName: "Ad Test",
      spend: 5000,
      impressions: 50000,
      clicks: 1500,
      leads: 300,
      revenue: 15000,
      utmTerm: "hot-audience-jan",
      totalSpend: 50000,
    };

    it("calcula todas as métricas", () => {
      const result = calculateCreativeMetrics(mockCreative);

      expect(result.adId).toBe("123456");
      expect(result.adName).toBe("Ad Test");
      expect(result.spend).toBe(5000);
      expect(result.spendPercent).toBe(10);
      expect(result.ctr).toBe(3);
      expect(result.cpc).toBeCloseTo(3.33, 1);
      expect(result.cpm).toBe(100);
      expect(result.cpl).toBeCloseTo(16.67, 1);
      expect(result.roas).toBe(3);
      expect(result.temperature).toBe("hot");
    });

    it("usa spend como totalSpend quando não fornecido", () => {
      const creative: CreativeMetrics = {
        ...mockCreative,
        totalSpend: undefined,
      };
      const result = calculateCreativeMetrics(creative);
      expect(result.spendPercent).toBe(100);
    });

    it("trata edge cases (divisões por zero)", () => {
      const creative: CreativeMetrics = {
        adId: "000",
        adName: "Zero Ad",
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
        revenue: 0,
        utmTerm: null,
      };
      const result = calculateCreativeMetrics(creative);

      expect(result.ctr).toBe(0);
      expect(result.cpc).toBeNull();
      expect(result.cpm).toBeNull();
      expect(result.cpl).toBeNull();
      expect(result.roas).toBeNull();
      expect(result.temperature).toBe("unknown");
    });
  });

  describe("formatMetricValue", () => {
    it("formata valores em moeda", () => {
      expect(formatMetricValue(5000, "currency")).toBe("R$ 5000.00");
      expect(formatMetricValue(1500.5, "currency")).toBe("R$ 1500.50");
    });

    it("formata valores em percentual", () => {
      expect(formatMetricValue(15.5, "percentage")).toBe("15.50%");
      expect(formatMetricValue(3.333, "percentage")).toBe("3.33%");
    });

    it("formata números com abreviaturas", () => {
      expect(formatMetricValue(1500000, "number")).toBe("1.5M");
      expect(formatMetricValue(1500, "number")).toBe("1.5K");
      expect(formatMetricValue(150, "number")).toBe("150");
    });

    it("retorna '—' para valores inválidos", () => {
      expect(formatMetricValue(null)).toBe("—");
      expect(formatMetricValue(undefined)).toBe("—");
      expect(formatMetricValue(NaN)).toBe("—");
    });
  });
});
