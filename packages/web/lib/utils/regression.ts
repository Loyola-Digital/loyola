/**
 * Regression utilities for Story 18.39: Cost-Based Lead Projection
 *
 * Implements linear regression using Ordinary Least Squares (OLS)
 * Convention: X = day index (1-indexed), Y = daily metric
 * Equation: Y = a + b·X where b = Sxy/Sxx, a = ȳ − b·x̄
 */

export interface RegressionResult {
  a: number; // intercept
  b: number; // slope
  valid: boolean; // true if regression used, false if fell back to mean
  mean?: number; // mean value (when fallback to simple mean)
}

export interface RegressionWithStandardError extends RegressionResult {
  standardError: number; // SE = sqrt(Σ(yi − ŷi)² / (n − 2))
}

/**
 * Calculate linear regression using OLS (Ordinary Least Squares)
 *
 * @param data - Array of values (one per day)
 * @param minPoints - Minimum points required to perform regression (default: 5)
 * @returns RegressionResult with coefficients or mean fallback
 *
 * If data.length < minPoints, returns simple mean as fallback (horizontal line)
 */
export function linearRegression(data: number[], minPoints: number = 5): RegressionResult {
  if (data.length === 0) {
    return { a: 0, b: 0, valid: false };
  }

  // Fallback: < minPoints → use simple mean
  if (data.length < minPoints) {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    return { a: mean, b: 0, valid: false, mean };
  }

  // OLS: X = 1-indexed day, Y = metric
  const n = data.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1; // 1-indexed
    const y = data[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  // Sxy = Σ(xi - x̄)(yi - ȳ) = Σ(xiyi) - n·x̄·ȳ
  const Sxy = sumXY - n * meanX * meanY;

  // Sxx = Σ(xi - x̄)² = Σ(xi²) - n·x̄²
  const Sxx = sumXX - n * meanX * meanX;

  // Avoid division by zero
  if (Math.abs(Sxx) < 1e-10) {
    const mean = meanY;
    return { a: mean, b: 0, valid: true, mean };
  }

  const b = Sxy / Sxx;
  const a = meanY - b * meanX;

  return { a, b, valid: true };
}

/**
 * Calculate linear regression with standard error
 *
 * @param data - Array of values (one per day)
 * @param minPoints - Minimum points required (default: 5)
 * @returns RegressionWithStandardError including SE = sqrt(Σ(yi − ŷi)² / (n − 2))
 */
export function linearRegressionWithStandardError(
  data: number[],
  minPoints: number = 5,
): RegressionWithStandardError {
  const regression = linearRegression(data, minPoints);

  if (!regression.valid || data.length < 3) {
    // Cannot calculate SE with < 3 points
    return { ...regression, standardError: 0 };
  }

  // Calculate residual sum of squares
  let residualSumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const x = i + 1; // 1-indexed
    const y = data[i];
    const yPredicted = regression.a + regression.b * x;
    const residual = y - yPredicted;
    residualSumSquares += residual * residual;
  }

  // SE = sqrt(RSS / (n - 2))
  const n = data.length;
  const standardError = n > 2 ? Math.sqrt(residualSumSquares / (n - 2)) : 0;

  return { ...regression, standardError };
}

/**
 * Project future values using regression line
 *
 * @param regression - RegressionResult from linearRegression()
 * @param futureIndices - Array of day indices to project (1-indexed)
 * @returns Array of projected values
 */
export function projectValues(regression: RegressionResult, futureIndices: number[]): number[] {
  return futureIndices.map((x) => regression.a + regression.b * x);
}

/**
 * Project future values with confidence band (±SE)
 *
 * @param regression - RegressionWithStandardError result
 * @param futureIndices - Array of day indices to project (1-indexed)
 * @returns Array of {value, lower, upper}
 */
export function projectValuesWithBand(
  regression: RegressionWithStandardError,
  futureIndices: number[],
): Array<{ value: number; lower: number; upper: number }> {
  return futureIndices.map((x) => {
    const value = regression.a + regression.b * x;
    const band = regression.standardError;
    return {
      value,
      lower: Math.max(0, value - band), // Floor at 0
      upper: value + band,
    };
  });
}

/**
 * Validate regression result (check for NaN, Infinity)
 */
export function isValidRegression(regression: RegressionResult): boolean {
  return (
    isFinite(regression.a) &&
    isFinite(regression.b) &&
    !isNaN(regression.a) &&
    !isNaN(regression.b)
  );
}
