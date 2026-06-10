/**
 * Cost-based lead projection mathematics (Story 18.39)
 *
 * Implements 7 calculation steps:
 * 1. Gasto diário projetado (pacing)
 * 2. CPL projetado (regressão linear do CPL acumulado)
 * 3. Leads pagos projetados (gasto ÷ CPL)
 * 4. Leads orgânicos projetados (regressão linear)
 * 5. Acumulado projetado (real + Σ projetado)
 * 6. Banda min/máx (intervalo de confiança do CPL)
 * 7. Sugestão de Gasto Total Projetado (pré-preenchimento)
 */

import { linearRegressionWithStandardError, projectValuesWithBand } from "./regression";

/**
 * 1. Calculate daily paced spend (fixed value per remaining day)
 *
 * gastoDiarioProjetado = max(0, (GastoTotalProjetado − gastoAcumuladoReal) ÷ diasRestantes)
 *
 * @param totalSpendProjected - Total projected spend (R$)
 * @param spendAccumulated - Accumulated real spend (R$)
 * @param daysRemaining - Days until projection end date
 * @returns Daily paced spend (fixed for all remaining days)
 */
export function calculateDailyGastoPacing(
  totalSpendProjected: number,
  spendAccumulated: number,
  daysRemaining: number,
): number {
  if (daysRemaining <= 0) return 0;
  return Math.max(0, (totalSpendProjected - spendAccumulated) / daysRemaining);
}

/**
 * 2. Calculate accumulated CPL from historical data
 *
 * CPLacum(dia) = gastoAcumulado(dia) ÷ leadsPagosAcumulado(dia)
 *
 * Avoids division by zero: returns null if leadsPagosAcum = 0
 *
 * @param historicalData - Array of {gasto, leadsPagos} per day
 * @returns Array of accumulated CPL values (null for days with 0 paid leads)
 */
export function calculateAccumulatedCPL(
  historicalData: Array<{ gasto: number; leadsPagos: number }>,
): (number | null)[] {
  let gastoAccum = 0;
  let leadsAccum = 0;

  return historicalData.map(({ gasto, leadsPagos }) => {
    gastoAccum += gasto;
    leadsAccum += leadsPagos;

    // Avoid division by zero: return null if no paid leads yet
    if (leadsAccum === 0) return null;
    return gastoAccum / leadsAccum;
  });
}

/**
 * 3. Project CPL for future days (using linear regression of accumulated CPL)
 *
 * CPLproj(d) = a + b·d (where d = 1-indexed day)
 * Piso: if CPLproj(d) ≤ 0, use CPLacum(hoje) instead
 *
 * @param historicalCPLAccum - Array of accumulated CPL values (may contain nulls)
 * @param lastCPLToday - Last valid accumulated CPL (for floor)
 * @param daysToProject - Number of future days to project
 * @param minPointsForRegression - Minimum points for regression (default: 5)
 * @returns Array of projected CPL values
 */
export function projectCPL(
  historicalCPLAccum: (number | null)[],
  lastCPLToday: number,
  daysToProject: number,
  minPointsForRegression: number = 5,
): Array<{ value: number; lower: number; upper: number }> {
  // Filter out nulls and convert to array for regression
  const validCPL = historicalCPLAccum.filter((val): val is number => val !== null);

  if (validCPL.length === 0) {
    // No historical CPL: project flat line at lastCPLToday
    return Array(daysToProject)
      .fill(null)
      .map(() => ({ value: lastCPLToday, lower: lastCPLToday, upper: lastCPLToday }));
  }

  const regression = linearRegressionWithStandardError(validCPL, minPointsForRegression);

  // Project for future day indices (starting from historicalLength + 1)
  const startIndex = validCPL.length + 1;
  const futureIndices = Array.from({ length: daysToProject }, (_, i) => startIndex + i);

  const projections = projectValuesWithBand(regression, futureIndices);

  // Apply floor: if projected CPL ≤ 0, use lastCPLToday
  return projections.map((proj) => ({
    value: proj.value > 0 ? proj.value : lastCPLToday,
    lower: proj.lower > 0 ? proj.lower : lastCPLToday,
    upper: proj.upper > 0 ? proj.upper : lastCPLToday,
  }));
}

/**
 * 4. Calculate projected paid leads
 *
 * leadsPagosProj(d) = gastoDiarioProjetado ÷ CPLproj(d)
 *
 * @param dailySpendPacing - Fixed daily spend (from calculateDailyGastoPacing)
 * @param projectedCPL - Projected CPL value
 * @returns Projected paid leads (can be fractional)
 */
export function calculateLeadsPaidProjected(dailySpendPacing: number, projectedCPL: number): number {
  if (projectedCPL <= 0) return 0; // Safety check
  return dailySpendPacing / projectedCPL;
}

/**
 * 5. Project organic leads
 *
 * orgProj(d) = max(0, a + b·d) (from regression of historical organic leads)
 * Piso = 0 (never negative)
 *
 * @param historicalOrganic - Array of daily organic leads
 * @param daysToProject - Number of days to project
 * @param minPointsForRegression - Minimum points for regression (default: 5)
 * @returns Array of projected organic leads
 */
export function projectOrganicLeads(
  historicalOrganic: number[],
  daysToProject: number,
  minPointsForRegression: number = 5,
): number[] {
  if (historicalOrganic.length === 0) {
    return Array(daysToProject).fill(0);
  }

  const regression = linearRegressionWithStandardError(historicalOrganic, minPointsForRegression);

  // Project for future day indices
  const startIndex = historicalOrganic.length + 1;
  const futureIndices = Array.from({ length: daysToProject }, (_, i) => startIndex + i);

  return futureIndices.map((x) => {
    const projected = regression.a + regression.b * x;
    return Math.max(0, projected); // Floor at 0
  });
}

/**
 * 6. Calculate accumulated projection
 *
 * acumuladoProjetado(d) = acumuladoRealAteHoje + Σ (leadsPagosProj + orgProj)
 *
 * @param cumulativeRealToday - Real cumulative leads up to today
 * @param dailyProjections - Array of {paidLeads, organicLeads} per day
 * @returns Array of cumulative projected values
 */
export function calculateAccumulatedProjection(
  cumulativeRealToday: number,
  dailyProjections: Array<{ paidLeads: number; organicLeads: number }>,
): number[] {
  let cumulative = cumulativeRealToday;
  const result: number[] = [];

  for (const day of dailyProjections) {
    cumulative += day.paidLeads + day.organicLeads;
    result.push(cumulative);
  }

  return result;
}

/**
 * 7. Calculate confidence band for CPL (using standard error)
 *
 * SE = sqrt(Σ(yi − ŷi)² / (n − 2))
 * CPLproj_baixo(d) = max(piso, CPLproj(d) − SE)
 * CPLproj_alto(d) = CPLproj(d) + SE
 *
 * This is embedded in projectCPL() and returns lower/upper bounds.
 * This function extracts those bounds for the band visualization.
 *
 * @param projectedCPLWithBand - Array from projectCPL() with {value, lower, upper}
 * @returns {band: Array of {projected, lower, upper}}
 */
export function extractCPLBand(
  projectedCPLWithBand: Array<{ value: number; lower: number; upper: number }>,
): Array<{ projected: number; lower: number; upper: number }> {
  return projectedCPLWithBand.map((proj) => ({
    projected: proj.value,
    lower: proj.lower,
    upper: proj.upper,
  }));
}

/**
 * 8. Suggest initial "Gasto Total Projetado" based on spending trend
 *
 * Regrida gasto diário histórico, projete cada dia restante, some ao gasto real acumulado:
 * sugestao = gastoAcumuladoReal + Σ (a_gasto + b_gasto·d) para cada d projetado
 *
 * @param historicalDailySpend - Array of daily spend values
 * @param spendAccumulated - Real accumulated spend to date
 * @param daysToProject - Days remaining until projection end
 * @param minPointsForRegression - Minimum points for regression (default: 5)
 * @returns Suggested total projected spend (R$)
 */
export function suggestTotalProjectedSpend(
  historicalDailySpend: number[],
  spendAccumulated: number,
  daysToProject: number,
  minPointsForRegression: number = 5,
): number {
  if (daysToProject <= 0) return spendAccumulated;

  const regression = linearRegressionWithStandardError(
    historicalDailySpend,
    minPointsForRegression,
  );

  // Project remaining days
  const startIndex = historicalDailySpend.length + 1;
  let futureSpendSum = 0;

  for (let i = 0; i < daysToProject; i++) {
    const dayIndex = startIndex + i;
    const projectedDaily = regression.a + regression.b * dayIndex;
    futureSpendSum += Math.max(0, projectedDaily); // Don't accumulate negative values
  }

  return spendAccumulated + futureSpendSum;
}

/**
 * Validate input data for projection
 *
 * Checks:
 * - historicalData has required fields
 * - dates are valid and sequential
 * - numeric values are non-negative
 *
 * @param historicalData - Raw daily data
 * @returns {valid: boolean, errors: string[]}
 */
export function validateProjectionInput(
  historicalData: Array<{ date: string; gasto: number; leadsPagos: number; leadsOrg: number }>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(historicalData) || historicalData.length === 0) {
    errors.push("Historical data is empty or not an array");
    return { valid: false, errors };
  }

  for (let i = 0; i < historicalData.length; i++) {
    const row = historicalData[i];

    if (!row.date || typeof row.date !== "string") {
      errors.push(`Row ${i}: missing or invalid date`);
    }

    if (typeof row.gasto !== "number" || row.gasto < 0) {
      errors.push(`Row ${i}: gasto must be non-negative number`);
    }

    if (typeof row.leadsPagos !== "number" || row.leadsPagos < 0) {
      errors.push(`Row ${i}: leadsPagos must be non-negative number`);
    }

    if (typeof row.leadsOrg !== "number" || row.leadsOrg < 0) {
      errors.push(`Row ${i}: leadsOrg must be non-negative number`);
    }
  }

  return { valid: errors.length === 0, errors };
}
