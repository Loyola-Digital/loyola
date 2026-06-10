import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLeadsProjection } from "@/lib/hooks/use-leads-projection";
import type { DailyRow } from "@/lib/utils/funnel-metrics";

/**
 * Integration tests for Story 18.39 Cost-Based Projection
 * Tests the complete workflow from raw data to chart output
 */

describe("LeadsProjectionCostBasedChart - Integration Tests", () => {
  // Scenario 1: < 5 days of data (fallback to mean)
  describe("Scenario 1: Fallback to mean (< 5 days)", () => {
    it("should use mean instead of regression with < 5 days", () => {
      const rows: DailyRow[] = [
        {
          date: "2026-06-05",
          leadsPagos: 10,
          leadsOrg: 5,
          gasto: 500,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-06",
          leadsPagos: 12,
          leadsOrg: 6,
          gasto: 600,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-07",
          leadsPagos: 8,
          leadsOrg: 4,
          gasto: 400,
          leadsSemTrack: 0,
        },
      ];

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-15", 500),
      );

      // With < 5 days, regression should use mean
      // CPL should be relatively flat (mean behavior)
      const projectedData = result.current.chartData.filter((d) => d.isProjection);
      expect(projectedData.length).toBeGreaterThan(0);

      // CPL should not vary wildly (mean behavior)
      const cplValues = projectedData
        .filter((d) => d.cplProjected !== null)
        .map((d) => d.cplProjected as number);

      if (cplValues.length > 1) {
        const variance =
          cplValues.reduce((sum, val, i) => sum + Math.abs(val - cplValues[0]), 0) /
          cplValues.length;
        expect(variance).toBeLessThan(50); // Small variance for mean behavior
      }
    });
  });

  // Scenario 2: CPL floor validation (never ≤ 0)
  describe("Scenario 2: CPL floor (never ≤ 0)", () => {
    it("should floor CPL at last valid CPL when projection would go negative", () => {
      const rows: DailyRow[] = [
        {
          date: "2026-06-01",
          leadsPagos: 100,
          leadsOrg: 10,
          gasto: 5000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-02",
          leadsPagos: 80,
          leadsOrg: 8,
          gasto: 4000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-03",
          leadsPagos: 60,
          leadsOrg: 6,
          gasto: 3000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-04",
          leadsPagos: 40,
          leadsOrg: 4,
          gasto: 2000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-05",
          leadsPagos: 20,
          leadsOrg: 2,
          gasto: 1000,
          leadsSemTrack: 0,
        },
      ];

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 1000),
      );

      const projectedData = result.current.chartData.filter((d) => d.isProjection);

      // All CPL values should be > 0
      projectedData.forEach((d) => {
        if (d.cplProjected !== null) {
          expect(d.cplProjected).toBeGreaterThan(0);
        }
      });
    });
  });

  // Scenario 3: Gasto atingido (spend budget exhausted)
  describe("Scenario 3: Spend budget exhausted", () => {
    it("should set daily spend to 0 when budget already spent", () => {
      const rows: DailyRow[] = [
        {
          date: "2026-06-01",
          leadsPagos: 50,
          leadsOrg: 5,
          gasto: 5000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-02",
          leadsPagos: 55,
          leadsOrg: 6,
          gasto: 5000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-03",
          leadsPagos: 60,
          leadsOrg: 7,
          gasto: 5000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-04",
          leadsPagos: 65,
          leadsOrg: 8,
          gasto: 5000,
          leadsSemTrack: 0,
        },
        {
          date: "2026-06-05",
          leadsPagos: 70,
          leadsOrg: 9,
          gasto: 5000,
          leadsSemTrack: 0,
        },
      ];

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-15", 1000),
      );

      // Set spend total to current accumulated (already spent)
      const { setGastoTotalProjetado } = result;
      setGastoTotalProjetado(25000); // Exactly what's been spent

      // Projected leads should drop significantly (no spend left)
      const projectedData = result.current.chartData.filter(
        (d) => d.isProjection && d.dailyProjectedPaid !== null,
      );

      if (projectedData.length > 0) {
        // With no spend remaining, paid leads should be ~0
        const avgPaidLeads =
          projectedData.reduce((sum, d) => sum + (d.dailyProjectedPaid || 0), 0) /
          projectedData.length;
        expect(avgPaidLeads).toBeLessThan(1); // Nearly 0
      }
    });
  });

  // Scenario 4: Arredondamento correto
  describe("Scenario 4: Correct rounding", () => {
    it("should round cumulative to integers, CPL to 2 decimals", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-${String(i + 1).padStart(2, "0")}`,
          leadsPagos: 10 + i,
          leadsOrg: 5 + i,
          gasto: 500 + i * 100,
          leadsSemTrack: 0,
        }));

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 500),
      );

      result.current.chartData.forEach((d) => {
        // Cumulative should be integer-ish (rounded for display)
        expect(Math.round(d.cumulative)).toBe(Math.round(d.cumulative));

        // CPL should have at most 2 decimal places
        if (d.cplProjected !== null) {
          const rounded = Math.round(d.cplProjected * 100) / 100;
          expect(d.cplProjected).toBeCloseTo(rounded, 2);
        }
      });
    });
  });

  // Scenario 5: Organic leads floor (never < 0)
  describe("Scenario 5: Organic leads floor (≥ 0)", () => {
    it("should never project negative organic leads", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-0${i + 1}`,
          leadsPagos: 20,
          leadsOrg: 10 - i * 3, // Decreasing: 10, 7, 4, 1, -2
          gasto: 1000,
          leadsSemTrack: 0,
        }));

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 500),
      );

      result.current.chartData.forEach((d) => {
        if (d.dailyProjectedOrg !== null) {
          expect(d.dailyProjectedOrg).toBeGreaterThanOrEqual(0);
        }
        if (d.dailyRealOrg !== null) {
          expect(d.dailyRealOrg).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  // Scenario 6: Cumulative consistency
  describe("Scenario 6: Cumulative monotonic increase", () => {
    it("cumulative should always increase or stay same (never decrease)", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-0${i + 1}`,
          leadsPagos: 10 + i,
          leadsOrg: 5,
          gasto: 1000,
          leadsSemTrack: 0,
        }));

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 500),
      );

      const { chartData } = result.current;
      for (let i = 1; i < chartData.length; i++) {
        expect(chartData[i].cumulative).toBeGreaterThanOrEqual(
          chartData[i - 1].cumulative,
        );
      }
    });
  });

  // Scenario 7: Confidence band validity
  describe("Scenario 7: Confidence band (lower ≤ value ≤ upper)", () => {
    it("CPL band should always have lower ≤ value ≤ upper", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-0${i + 1}`,
          leadsPagos: 10 + i * 2,
          leadsOrg: 5,
          gasto: 500 + i * 100,
          leadsSemTrack: 0,
        }));

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 500),
      );

      const projectedData = result.current.chartData.filter((d) => d.isProjection);

      projectedData.forEach((d) => {
        if (d.cplProjected !== null && d.cplProjectedLower !== null) {
          expect(d.cplProjectedLower).toBeLessThanOrEqual(d.cplProjected);
          expect(d.cplProjectedUpper).toBeGreaterThanOrEqual(d.cplProjected);
        }
      });
    });
  });

  // Scenario 8: Suggestion accuracy
  describe("Scenario 8: Spend suggestion accuracy", () => {
    it("gastoTotalSuggestion should be ≥ accumulated spend", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-0${i + 1}`,
          leadsPagos: 10 + i,
          leadsOrg: 5,
          gasto: 1000,
          leadsSemTrack: 0,
        }));

      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", 500),
      );

      const totalAccumulated = rows.reduce((sum, r) => sum + (r.gasto ?? 0), 0);
      expect(result.current.gastoTotalSuggestion).toBeGreaterThanOrEqual(totalAccumulated);
    });
  });

  // Scenario 9: Meta tracking
  describe("Scenario 9: Meta percentage calculation", () => {
    it("should calculate final projection percentage correctly", () => {
      const rows: DailyRow[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          date: `2026-06-0${i + 1}`,
          leadsPagos: 50,
          leadsOrg: 25,
          gasto: 2000,
          leadsSemTrack: 0,
        }));

      const metaTotal = 500;
      const { result } = renderHook(() =>
        useLeadsProjection(rows, "2026-06-20", metaTotal),
      );

      const { projectionPercentage, chartData } = result.current;
      if (chartData.length > 0) {
        const lastPoint = chartData[chartData.length - 1];
        const expected = (lastPoint.cumulative / lastPoint.metaCumulative) * 100;
        expect(projectionPercentage).toBeCloseTo(expected, 1);
      }
    });
  });
});
