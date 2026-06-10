import { describe, it, expect } from "vitest";
import {
  calculateDailyGastoPacing,
  calculateAccumulatedCPL,
  projectCPL,
  calculateLeadsPaidProjected,
  projectOrganicLeads,
  calculateAccumulatedProjection,
  suggestTotalProjectedSpend,
  validateProjectionInput,
} from "../leads-projection-math";

describe("calculateDailyGastoPacing", () => {
  it("should calculate daily pacing correctly", () => {
    // Total: R$ 10.000, accumulated: R$ 5.000, 10 days remaining
    // Expected: (10.000 - 5.000) / 10 = R$ 500/day
    const result = calculateDailyGastoPacing(10000, 5000, 10);
    expect(result).toBeCloseTo(500);
  });

  it("should return 0 when budget already spent", () => {
    const result = calculateDailyGastoPacing(10000, 12000, 10);
    expect(result).toBe(0);
  });

  it("should return 0 when days remaining = 0", () => {
    const result = calculateDailyGastoPacing(10000, 5000, 0);
    expect(result).toBe(0);
  });

  it("should not return negative values", () => {
    const result = calculateDailyGastoPacing(5000, 10000, 10);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateAccumulatedCPL", () => {
  it("should calculate accumulated CPL correctly", () => {
    const data = [
      { gasto: 100, leadsPagos: 10 }, // CPLacum = 100/10 = 10
      { gasto: 100, leadsPagos: 10 }, // CPLacum = 200/20 = 10
      { gasto: 200, leadsPagos: 10 }, // CPLacum = 400/30 = 13.33
    ];
    const result = calculateAccumulatedCPL(data);

    expect(result[0]).toBeCloseTo(10);
    expect(result[1]).toBeCloseTo(10);
    expect(result[2]).toBeCloseTo(13.33, 1);
  });

  it("should return null when no paid leads yet", () => {
    const data = [
      { gasto: 100, leadsPagos: 0 }, // No leads = null
      { gasto: 100, leadsPagos: 10 },
    ];
    const result = calculateAccumulatedCPL(data);

    expect(result[0]).toBeNull();
    expect(result[1]).toBeCloseTo(10);
  });
});

describe("projectCPL", () => {
  it("should project CPL for future days", () => {
    const historicalCPL = [10, 10, 10, 10, 12]; // Slight uptrend
    const result = projectCPL(historicalCPL, 12, 5); // Project 5 days

    expect(result.length).toBe(5);
    result.forEach((proj) => {
      expect(proj.value).toBeGreaterThan(0);
      expect(proj.lower).toBeLessThanOrEqual(proj.value);
      expect(proj.upper).toBeGreaterThanOrEqual(proj.value);
    });
  });

  it("should use lastCPLToday when projected CPL <= 0", () => {
    const historicalCPL = [100, 50, 25, 12, 6]; // Steep downtrend
    const lastCPL = 10;
    const result = projectCPL(historicalCPL, lastCPL, 3);

    // With steep downtrend, some values might project negative
    // Should be floored at lastCPL
    result.forEach((proj) => {
      expect(proj.value).toBeGreaterThanOrEqual(lastCPL);
    });
  });

  it("should handle empty historical CPL", () => {
    const result = projectCPL([], 10, 3);

    expect(result.length).toBe(3);
    result.forEach((proj) => {
      expect(proj.value).toBe(10); // Flat at lastCPLToday
    });
  });
});

describe("calculateLeadsPaidProjected", () => {
  it("should calculate projected paid leads correctly", () => {
    // R$ 1.000 daily spend / CPL R$ 50 = 20 leads
    const result = calculateLeadsPaidProjected(1000, 50);
    expect(result).toBeCloseTo(20);
  });

  it("should return 0 when CPL <= 0", () => {
    const result = calculateLeadsPaidProjected(1000, 0);
    expect(result).toBe(0);
  });

  it("should handle fractional leads", () => {
    // R$ 500 / CPL R$ 30 = 16.67 leads
    const result = calculateLeadsPaidProjected(500, 30);
    expect(result).toBeCloseTo(16.67, 1);
  });
});

describe("projectOrganicLeads", () => {
  it("should project organic leads with regression", () => {
    const historical = [10, 15, 20, 25, 30]; // Linear increase
    const result = projectOrganicLeads(historical, 3);

    expect(result.length).toBe(3);
    result.forEach((leads) => {
      expect(leads).toBeGreaterThanOrEqual(0);
    });
  });

  it("should floor negative projections at 0", () => {
    const historical = [30, 25, 20, 15, 10]; // Linear decrease
    const result = projectOrganicLeads(historical, 5);

    result.forEach((leads) => {
      expect(leads).toBeGreaterThanOrEqual(0); // No negatives
    });
  });

  it("should handle empty historical data", () => {
    const result = projectOrganicLeads([], 3);

    expect(result.length).toBe(3);
    expect(result.every((val) => val === 0)).toBe(true);
  });
});

describe("calculateAccumulatedProjection", () => {
  it("should calculate cumulative projection correctly", () => {
    const cumulativeToday = 1000;
    const dailyProjections = [
      { paidLeads: 50, organicLeads: 10 }, // 1000 + 60 = 1060
      { paidLeads: 55, organicLeads: 12 }, // 1060 + 67 = 1127
      { paidLeads: 60, organicLeads: 14 }, // 1127 + 74 = 1201
    ];

    const result = calculateAccumulatedProjection(cumulativeToday, dailyProjections);

    expect(result[0]).toBeCloseTo(1060);
    expect(result[1]).toBeCloseTo(1127);
    expect(result[2]).toBeCloseTo(1201);
  });

  it("should handle empty daily projections", () => {
    const result = calculateAccumulatedProjection(1000, []);
    expect(result.length).toBe(0);
  });
});

describe("suggestTotalProjectedSpend", () => {
  it("should suggest total projected spend based on trend", () => {
    const historicalDaily = [100, 100, 100, 100, 100]; // Constant
    const accumulated = 500;
    const daysToProject = 5;

    // Expected: 500 + (100 * 5) = 1000
    const result = suggestTotalProjectedSpend(historicalDaily, accumulated, daysToProject);
    expect(result).toBeCloseTo(1000, 0);
  });

  it("should not suggest negative spend", () => {
    const historicalDaily = [100, 100, 100, 100, 100];
    const result = suggestTotalProjectedSpend(historicalDaily, 500, 5);

    expect(result).toBeGreaterThanOrEqual(500); // At least accumulated
  });

  it("should return accumulated when no days to project", () => {
    const result = suggestTotalProjectedSpend([100, 100, 100, 100, 100], 500, 0);
    expect(result).toBeCloseTo(500);
  });
});

describe("validateProjectionInput", () => {
  it("should validate correct input", () => {
    const data = [
      { date: "2026-06-01", gasto: 100, leadsPagos: 10, leadsOrg: 5 },
      { date: "2026-06-02", gasto: 150, leadsPagos: 15, leadsOrg: 7 },
    ];
    const result = validateProjectionInput(data);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should reject negative values", () => {
    const data = [
      { date: "2026-06-01", gasto: -100, leadsPagos: 10, leadsOrg: 5 },
    ];
    const result = validateProjectionInput(data);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should reject empty data", () => {
    const result = validateProjectionInput([]);

    expect(result.valid).toBe(false);
  });

  it("should reject missing fields", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = [{ date: "2026-06-01", gasto: 100 }] as any;
    const result = validateProjectionInput(data);

    expect(result.valid).toBe(false);
  });
});
