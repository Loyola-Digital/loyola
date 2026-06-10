import { describe, it, expect } from "vitest";
import {
  linearRegression,
  linearRegressionWithStandardError,
  projectValues,
  projectValuesWithBand,
  isValidRegression,
} from "../regression";

describe("linearRegression", () => {
  it("should perform OLS regression with valid data", () => {
    // Data: y = 2 + 3x (perfect linear relationship)
    const data = [5, 8, 11, 14, 17]; // x=1,2,3,4,5
    const result = linearRegression(data);

    expect(result.valid).toBe(true);
    expect(result.a).toBeCloseTo(2, 5);
    expect(result.b).toBeCloseTo(3, 5);
  });

  it("should fall back to mean for data with < 5 points", () => {
    const data = [10, 20, 30]; // n=3
    const result = linearRegression(data);

    expect(result.valid).toBe(false);
    expect(result.a).toBe(20); // mean
    expect(result.b).toBe(0);
    expect(result.mean).toBe(20);
  });

  it("should handle constant data", () => {
    const data = [5, 5, 5, 5, 5];
    const result = linearRegression(data);

    expect(result.valid).toBe(true);
    expect(result.a).toBeCloseTo(5, 5);
    expect(result.b).toBeCloseTo(0, 10); // Should be ~0
  });

  it("should handle empty data", () => {
    const result = linearRegression([]);
    expect(result.valid).toBe(false);
    expect(result.a).toBe(0);
    expect(result.b).toBe(0);
  });

  it("should handle increasing trend", () => {
    // Data: y = 1 + 2x
    const data = [3, 5, 7, 9, 11]; // x=1,2,3,4,5
    const result = linearRegression(data);

    expect(result.valid).toBe(true);
    expect(result.a).toBeCloseTo(1, 5);
    expect(result.b).toBeCloseTo(2, 5);
  });

  it("should handle decreasing trend", () => {
    // Data: y = 30 - 2x
    const data = [28, 26, 24, 22, 20]; // x=1,2,3,4,5
    const result = linearRegression(data);

    expect(result.valid).toBe(true);
    expect(result.a).toBeCloseTo(30, 5);
    expect(result.b).toBeCloseTo(-2, 5);
  });
});

describe("linearRegressionWithStandardError", () => {
  it("should calculate standard error correctly", () => {
    // Data: y = 2 + 3x (with some noise)
    const data = [5, 8, 11, 14, 17];
    const result = linearRegressionWithStandardError(data);

    expect(result.valid).toBe(true);
    expect(result.standardError).toBeGreaterThanOrEqual(0);
    expect(isFinite(result.standardError)).toBe(true);
  });

  it("should return SE=0 for perfect fit", () => {
    // Perfect linear data
    const data = [5, 8, 11, 14, 17]; // y = 2 + 3x
    const result = linearRegressionWithStandardError(data);

    expect(result.standardError).toBeCloseTo(0, 5);
  });

  it("should fall back with < 5 points", () => {
    const data = [10, 20, 30];
    const result = linearRegressionWithStandardError(data);

    expect(result.valid).toBe(false);
    expect(result.standardError).toBe(0);
  });
});

describe("projectValues", () => {
  it("should project future values correctly", () => {
    const data = [5, 8, 11, 14, 17]; // y = 2 + 3x
    const result = linearRegression(data);
    const projections = projectValues(result, [6, 7, 8]);

    expect(projections[0]).toBeCloseTo(20, 5); // 2 + 3*6
    expect(projections[1]).toBeCloseTo(23, 5); // 2 + 3*7
    expect(projections[2]).toBeCloseTo(26, 5); // 2 + 3*8
  });
});

describe("projectValuesWithBand", () => {
  it("should include confidence band", () => {
    const data = [5, 8, 11, 14, 17];
    const result = linearRegressionWithStandardError(data);
    const projections = projectValuesWithBand(result, [6, 7]);

    expect(projections[0].value).toBeCloseTo(20, 5);
    expect(projections[0].lower).toBeLessThanOrEqual(projections[0].value);
    expect(projections[0].upper).toBeGreaterThanOrEqual(projections[0].value);
  });

  it("should not allow lower band below 0", () => {
    // Data that might project negative without floor
    const data = [1, 1, 1, 1, -10]; // Decreasing trend
    const result = linearRegressionWithStandardError(data);
    const projections = projectValuesWithBand(result, [1, 2, 3]);

    projections.forEach((p) => {
      expect(p.lower).toBeGreaterThanOrEqual(0); // Floored at 0
    });
  });
});

describe("isValidRegression", () => {
  it("should return true for valid regression", () => {
    const result = { a: 5, b: 2, valid: true };
    expect(isValidRegression(result)).toBe(true);
  });

  it("should return false for NaN/Infinity", () => {
    expect(isValidRegression({ a: NaN, b: 2, valid: true })).toBe(false);
    expect(isValidRegression({ a: 5, b: Infinity, valid: true })).toBe(false);
  });
});
