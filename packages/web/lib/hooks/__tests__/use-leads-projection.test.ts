import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLeadsProjection } from "../use-leads-projection";
import type { DailyRow } from "@/lib/utils/funnel-metrics";

describe("useLeadsProjection", () => {
  const mockRows: DailyRow[] = [
    {
      date: "2026-05-20",
      leadsPagos: 10,
      leadsOrg: 5,
      gasto: 500,
      leadsSemTrack: 0,
    },
    {
      date: "2026-05-21",
      leadsPagos: 12,
      leadsOrg: 6,
      gasto: 600,
      leadsSemTrack: 0,
    },
    {
      date: "2026-05-22",
      leadsPagos: 15,
      leadsOrg: 7,
      gasto: 750,
      leadsSemTrack: 0,
    },
    {
      date: "2026-05-23",
      leadsPagos: 18,
      leadsOrg: 8,
      gasto: 900,
      leadsSemTrack: 0,
    },
    {
      date: "2026-05-24",
      leadsPagos: 20,
      leadsOrg: 9,
      gasto: 1000,
      leadsSemTrack: 0,
    },
  ];

  it("should initialize with default values", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    expect(result.current.dataFinal).toBe("2026-06-10");
    expect(result.current.metaTotal).toBe(500);
    expect(result.current.chartData.length).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should separate real data from projections", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    const realData = result.current.chartData.filter((d) => !d.isProjection);
    const projectedData = result.current.chartData.filter((d) => d.isProjection);

    expect(realData.length).toBeGreaterThan(0);
    expect(projectedData.length).toBeGreaterThan(0);

    // Real data should have daily real values
    realData.forEach((d) => {
      expect(d.cumulativeReal).not.toBeNull();
      expect(d.cumulativeProjected).toBeNull();
    });

    // Projected data should have cumulative projected
    projectedData.forEach((d) => {
      expect(d.cumulativeProjected).not.toBeNull();
      expect(d.cumulativeReal).toBeNull();
    });
  });

  it("should calculate CPL projection", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    const projectedData = result.current.chartData.filter((d) => d.isProjection);

    projectedData.forEach((d) => {
      if (d.cplProjected !== null) {
        expect(d.cplProjected).toBeGreaterThan(0);
        expect(d.cplProjectedLower).toBeLessThanOrEqual(d.cplProjected);
        expect(d.cplProjectedUpper).toBeGreaterThanOrEqual(d.cplProjected);
      }
    });
  });

  it("should suggest total projected spend", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    expect(result.current.gastoTotalSuggestion).toBeGreaterThan(0);
    expect(Number.isFinite(result.current.gastoTotalSuggestion)).toBe(true);
  });

  it("should calculate projection percentage", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    expect(result.current.projectionPercentage).toBeGreaterThanOrEqual(0);
  });

  it("should update inputs correctly", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    act(() => {
      result.current.setDataFinal("2026-06-30");
    });

    expect(result.current.dataFinal).toBe("2026-06-30");

    act(() => {
      result.current.setMetaTotal(1000);
    });

    expect(result.current.metaTotal).toBe(1000);

    act(() => {
      result.current.setGastoTotalProjetado(5000);
    });

    expect(result.current.gastoTotalProjetado).toBe(5000);
  });

  it("should handle empty rows gracefully", () => {
    const { result } = renderHook(() =>
      useLeadsProjection([], "2026-06-10", 500),
    );

    expect(result.current.chartData.length).toBe(0);
    expect(result.current.gastoTotalSuggestion).toBe(0);
  });

  it("should maintain cumulative consistency", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    // Check that cumulative is always increasing
    for (let i = 1; i < result.current.chartData.length; i++) {
      expect(result.current.chartData[i].cumulative).toBeGreaterThanOrEqual(
        result.current.chartData[i - 1].cumulative,
      );
    }
  });

  it("should not have negative daily projected values", () => {
    const { result } = renderHook(() =>
      useLeadsProjection(mockRows, "2026-06-10", 500),
    );

    result.current.chartData.forEach((d) => {
      if (d.dailyProjectedPaid !== null) {
        expect(d.dailyProjectedPaid).toBeGreaterThanOrEqual(0);
      }
      if (d.dailyProjectedOrg !== null) {
        expect(d.dailyProjectedOrg).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
