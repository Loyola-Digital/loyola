/**
 * Hook: useLeadsProjection
 * Story 18.39: Cost-based lead projection
 *
 * Integrates all 8 mathematical functions into a single workflow
 * for computing real + projected leads with CPL-based pacing.
 *
 * Computes:
 * - Daily paced spend (fixed across remaining days)
 * - CPL projection (linear regression of accumulated CPL)
 * - Paid leads projection (spend ÷ CPL)
 * - Organic leads projection (linear regression)
 * - Accumulated projection (real + Σ daily)
 * - Confidence band (±SE from CPL regression)
 * - Pre-fill suggestion for total projected spend
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { DailyRow } from "@/lib/utils/funnel-metrics";
import {
  calculateDailyGastoPacing,
  calculateAccumulatedCPL,
  projectCPL,
  calculateLeadsPaidProjected,
  projectOrganicLeads,
  calculateAccumulatedProjection,
  suggestTotalProjectedSpend,
  validateProjectionInput,
} from "@/lib/utils/leads-projection-math";

/**
 * Output structure for each projected day
 */
export interface ProjectedDayData {
  date: string;
  // Real data (up to today)
  dailyRealPaid: number | null;
  dailyRealOrg: number | null;
  cumulativeReal: number | null;
  // Projected data (from today onwards)
  dailyProjectedPaid: number | null;
  dailyProjectedOrg: number | null;
  cumulativeProjected: number | null;
  // Unified cumulative (real OR projected)
  cumulative: number;
  // CPL projection (eixo secundário)
  cplProjected: number | null;
  cplProjectedLower: number | null;
  cplProjectedUpper: number | null;
  // Meta
  metaCumulative: number;
  // Flags
  isProjection: boolean;
  realPercentage: number; // % of meta
}

/**
 * Hook return type
 */
export interface UseLeadsProjectionResult {
  // Inputs (editable)
  dataFinal: string;
  setDataFinal: (date: string) => void;
  metaTotal: number;
  setMetaTotal: (meta: number) => void;
  gastoTotalProjetado: number;
  setGastoTotalProjetado: (gasto: number) => void;
  // Suggestions
  gastoTotalSuggestion: number;
  // Output
  chartData: ProjectedDayData[];
  projectionPercentage: number;
  // Status
  isLoading: boolean;
  error: string | null;
}

/**
 * Helper: Convert date string to local Date (not UTC)
 */
function parseLocalYMD(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Helper: Convert local Date to YYYY-MM-DD string
 */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Main hook for cost-based lead projection
 */
export function useLeadsProjection(
  rows: DailyRow[],
  initialDataFinal?: string,
  initialMetaTotal?: number,
): UseLeadsProjectionResult {
  // Inputs
  const [dataFinal, setDataFinal] = useState<string>(() => {
    if (initialDataFinal) return initialDataFinal;
    const d = new Date();
    d.setDate(d.getDate() + 20); // Default: 20 days from today
    return toLocalYMD(d);
  });

  const [metaTotal, setMetaTotal] = useState<number>(initialMetaTotal ?? 0);
  const [gastoTotalProjetado, setGastoTotalProjetado] = useState<number>(0);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill suggestion for gasto total
  const gastoTotalSuggestion = useMemo(() => {
    if (rows.length === 0) return 0;

    try {
      // Calculate accumulated spend from historical data
      let gastoAccum = 0;
      const dailySpend = rows.map((row) => {
        const daily = row.gasto ?? 0;
        gastoAccum += daily;
        return daily;
      });

      // Calculate remaining days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const finalDate = parseLocalYMD(dataFinal);
      const daysRemaining = Math.max(
        1,
        Math.floor((finalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      );

      return suggestTotalProjectedSpend(dailySpend, gastoAccum, daysRemaining, 5);
    } catch (e) {
      console.error("Error calculating spend suggestion:", e);
      return 0;
    }
  }, [rows, dataFinal]);

  // Initialize gastoTotalProjetado with suggestion on first load
  useEffect(() => {
    if (gastoTotalProjetado === 0 && gastoTotalSuggestion > 0) {
      setGastoTotalProjetado(gastoTotalSuggestion);
    }
  }, [gastoTotalSuggestion]);

  // Main computation
  const chartData = useMemo(() => {
    setIsLoading(true);
    setError(null);

    try {
      if (rows.length === 0 || !dataFinal) {
        return [];
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = toLocalYMD(today);

      const finalDate = parseLocalYMD(dataFinal);
      const firstDate = parseLocalYMD(rows[0].date);

      // Validate input
      const historicalData = rows.map((row) => ({
        date: row.date,
        gasto: row.gasto ?? 0,
        leadsPagos: row.leadsPagos ?? 0,
        leadsOrg: row.leadsOrg ?? 0,
      }));

      const validation = validateProjectionInput(historicalData);
      if (!validation.valid) {
        setError(`Invalid input: ${validation.errors.join(", ")}`);
        return [];
      }

      // Calculate accumulated values from historical data
      let gastoAccum = 0;
      let leadsAccumPaid = 0;
      let leadsAccumOrg = 0;
      const historicalCPLAccum: (number | null)[] = [];
      let lastCPLToday = 0;
      const dailyDatasForSpendRegression = rows.map((row) => {
        gastoAccum += row.gasto ?? 0;
        leadsAccumPaid += row.leadsPagos ?? 0;
        leadsAccumOrg += row.leadsOrg ?? 0;

        // CPL accumulated
        const cplAccum = leadsAccumPaid > 0 ? gastoAccum / leadsAccumPaid : null;
        historicalCPLAccum.push(cplAccum);
        if (cplAccum !== null && cplAccum > 0) {
          lastCPLToday = cplAccum;
        }

        return row.gasto ?? 0;
      });

      // Safety: if we never had a valid CPL, use a sensible default
      if (lastCPLToday === 0 && leadsAccumPaid > 0) {
        lastCPLToday = gastoAccum / leadsAccumPaid;
      }
      if (lastCPLToday <= 0) {
        lastCPLToday = 1; // Fallback minimum
      }

      // Calculate days remaining
      const totalDays = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      let daysRemaining = Math.max(1, Math.floor((finalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      // Daily meta
      const dailyMeta = metaTotal > 0 ? metaTotal / totalDays : 0;

      // Projection
      const dailyGastoPacing = calculateDailyGastoPacing(
        gastoTotalProjetado,
        gastoAccum,
        daysRemaining,
      );

      const projectedCPL = projectCPL(
        historicalCPLAccum,
        lastCPLToday,
        daysRemaining,
        5,
      );

      const dailySpendForOrg = rows.map((row) => row.leadsOrg ?? 0);
      const projectedOrganic = projectOrganicLeads(dailySpendForOrg, daysRemaining, 5);

      // Build daily projections
      const dailyProjections: Array<{ paidLeads: number; organicLeads: number }> = [];
      for (let i = 0; i < daysRemaining; i++) {
        const paid = calculateLeadsPaidProjected(dailyGastoPacing, projectedCPL[i]?.value ?? lastCPLToday);
        const organic = projectedOrganic[i] ?? 0;
        dailyProjections.push({ paidLeads: paid, organicLeads: organic });
      }

      // Accumulated projection
      const accumulatedProjection = calculateAccumulatedProjection(
        leadsAccumPaid + leadsAccumOrg,
        dailyProjections,
      );

      // Build chart data
      const result: ProjectedDayData[] = [];
      let cumulativeReal = 0;
      let dayIndexForProjection = 0;

      for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
        const currentDate = new Date(firstDate);
        currentDate.setDate(currentDate.getDate() + dayIndex);
        const dateStr = toLocalYMD(currentDate);

        const historyRow = rows.find((r) => r.date === dateStr);
        const metaCumulative = dailyMeta * (dayIndex + 1);

        const isFuture = dateStr >= todayStr;

        if (historyRow && !isFuture) {
          // REAL: até ontem (inclusive)
          const dailyPaid = historyRow.leadsPagos ?? 0;
          const dailyOrg = historyRow.leadsOrg ?? 0;
          cumulativeReal += dailyPaid + dailyOrg;

          const realPercentage = metaTotal > 0 ? (cumulativeReal / metaTotal) * 100 : 0;

          result.push({
            date: dateStr,
            dailyRealPaid: dailyPaid,
            dailyRealOrg: dailyOrg,
            cumulativeReal,
            dailyProjectedPaid: null,
            dailyProjectedOrg: null,
            cumulativeProjected: null,
            cumulative: cumulativeReal,
            cplProjected: null,
            cplProjectedLower: null,
            cplProjectedUpper: null,
            metaCumulative,
            isProjection: false,
            realPercentage,
          });
        } else if (!isFuture) {
          // REAL SEM DADO: gap até ontem — tratar como 0
          const realPercentage = metaTotal > 0 ? (cumulativeReal / metaTotal) * 100 : 0;

          result.push({
            date: dateStr,
            dailyRealPaid: 0,
            dailyRealOrg: 0,
            cumulativeReal,
            dailyProjectedPaid: null,
            dailyProjectedOrg: null,
            cumulativeProjected: null,
            cumulative: cumulativeReal,
            cplProjected: null,
            cplProjectedLower: null,
            cplProjectedUpper: null,
            metaCumulative,
            isProjection: false,
            realPercentage,
          });
        } else {
          // PROJEÇÃO: a partir de hoje (inclusive)
          if (dayIndexForProjection < accumulatedProjection.length) {
            const cumulativeProjected = accumulatedProjection[dayIndexForProjection];
            const dailyProj = dailyProjections[dayIndexForProjection];
            const cplProj = projectedCPL[dayIndexForProjection];
            const projectionPercentage = metaTotal > 0 ? (cumulativeProjected / metaTotal) * 100 : 0;

            result.push({
              date: dateStr,
              dailyRealPaid: null,
              dailyRealOrg: null,
              cumulativeReal: null,
              dailyProjectedPaid: dailyProj?.paidLeads ?? 0,
              dailyProjectedOrg: dailyProj?.organicLeads ?? 0,
              cumulativeProjected,
              cumulative: cumulativeProjected,
              cplProjected: cplProj?.value ?? null,
              cplProjectedLower: cplProj?.lower ?? null,
              cplProjectedUpper: cplProj?.upper ?? null,
              metaCumulative,
              isProjection: true,
              realPercentage: projectionPercentage,
            });

            dayIndexForProjection++;
          }
        }
      }

      setIsLoading(false);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      setIsLoading(false);
      return [];
    }
  }, [rows, dataFinal, metaTotal, gastoTotalProjetado]);

  // Calculate final projection percentage
  const projectionPercentage = useMemo(() => {
    if (chartData.length === 0) return 0;
    const lastPoint = chartData[chartData.length - 1];
    const meta = lastPoint.metaCumulative;
    return meta > 0 ? (lastPoint.cumulative / meta) * 100 : 0;
  }, [chartData]);

  return {
    dataFinal,
    setDataFinal,
    metaTotal,
    setMetaTotal,
    gastoTotalProjetado,
    setGastoTotalProjetado,
    gastoTotalSuggestion,
    chartData,
    projectionPercentage,
    isLoading,
    error,
  };
}
