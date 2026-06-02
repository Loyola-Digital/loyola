import type { DailyRow } from "./funnel-metrics";

/**
 * Retorna YYYY-MM-DD em horário LOCAL (BRT no Brasil).
 *
 * Fix do bug "hoje aparece como dia anterior": `date.toISOString().split("T")[0]`
 * converte pra UTC primeiro, então quando é 00h00 BRT (UTC-3), `toISOString()`
 * já passou pro dia anterior em UTC. Usar getFullYear/getMonth/getDate mantém
 * a data no fuso local.
 */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD string em uma Data LOCAL (não UTC).
 * Evita o bug onde new Date("2026-06-05") interpreta como UTC,
 * causando um dia anterior no fuso local (BRT).
 */
function parseLocalYMD(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return d;
}

/**
 * Deriva a série diária a partir do acumulado
 * d[i] = C[i] - C[i-1], onde d[0] = C[0]
 */
export function calculateDailyFromCumulative(cumulatives: number[]): number[] {
  if (cumulatives.length === 0) return [];

  const daily: number[] = [cumulatives[0]];
  for (let i = 1; i < cumulatives.length; i++) {
    daily.push(cumulatives[i] - cumulatives[i - 1]);
  }
  return daily;
}

/**
 * Calcula run-rate PONDERADA dos últimos N dias
 * Pesos lineares: 1, 2, ..., N
 * r = Σ(d[i] * w[i]) / Σ(w), onde Σ(w) = N * (N+1) / 2
 */
export function calculateRunRateWeighted(dailySeries: number[], windowSize: number): number {
  if (dailySeries.length === 0 || windowSize <= 0) return 0;

  // Usar apenas os últimos N dias (ou menos se não houver N dias)
  const effectiveWindow = Math.min(windowSize, dailySeries.length);
  const lastDays = dailySeries.slice(-effectiveWindow);

  // Calcular pesos lineares
  let numerator = 0;
  for (let i = 0; i < lastDays.length; i++) {
    const weight = i + 1; // pesos: 1, 2, 3, ...
    numerator += lastDays[i] * weight;
  }

  // Denominador = soma dos pesos = N * (N+1) / 2
  const denominator = (effectiveWindow * (effectiveWindow + 1)) / 2;

  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Calcula desvio padrão da série diária (últimos N dias)
 */
export function calculateSigma(dailySeries: number[], windowSize: number): number {
  if (dailySeries.length === 0 || windowSize <= 0) return 0;

  const effectiveWindow = Math.min(windowSize, dailySeries.length);
  const lastDays = dailySeries.slice(-effectiveWindow);

  // Calcular média
  const mean = lastDays.reduce((sum, val) => sum + val, 0) / lastDays.length;

  // Calcular variância
  const variance = lastDays.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / lastDays.length;

  return Math.sqrt(variance);
}

/**
 * Projeta acumulado futuro com banda de confiança
 * C[t+k] = C[t] + r * k
 * banda[t+k] = C[t+k] ± sigma * sqrt(k)
 */
export interface ProjectionPoint {
  date: string;
  cumulativeProjected: number;
  bandUpper: number;
  bandLower: number;
}

export function projectAccumulated(
  lastCumulative: number,
  runRate: number,
  daysAhead: number,
  sigma: number,
  startDate: Date,
): ProjectionPoint[] {
  const result: ProjectionPoint[] = [];

  for (let k = 1; k <= daysAhead; k++) {
    const futureDate = new Date(startDate);
    futureDate.setDate(futureDate.getDate() + k);

    const cumulativeProjected = lastCumulative + runRate * k;
    const bandHalfWidth = sigma * Math.sqrt(k);
    const bandUpper = cumulativeProjected + bandHalfWidth;
    const bandLower = Math.max(0, cumulativeProjected - bandHalfWidth); // Não permitir negativos

    const dateStr = toLocalYMD(futureDate);
    result.push({
      date: dateStr,
      cumulativeProjected,
      bandUpper,
      bandLower,
    });
  }

  return result;
}

/**
 * Expande dados do gráfico com nova estrutura:
 * - dailyReal: barra diária real (até ontem)
 * - dailyProjected: barra diária projetada (de hoje em diante)
 * - cumulativeReal: linha sólida azul (até ontem)
 * - cumulativeProjected: linha tracejada azul (de hoje em diante)
 * - bandUpper/bandLower: banda de confiança (apenas projeção)
 * - meta: linha horizontal de meta
 */
export interface ChartDataPoint {
  date: string;
  dailyReal: number | null;
  dailyProjected: number | null;
  cumulativeReal: number | null;
  cumulativeProjected: number | null;
  cumulative: number; // Unified field: cumulativeReal OR cumulativeProjected
  isProjection: boolean; // true if this row is projected
  bandUpper: number | null;
  bandLower: number | null;
  meta: number;
}

export function expandChartDataV2(
  rows: DailyRow[],
  dataFinal: string,
  metaTotal: number,
  windowSize: number = 5,
): ChartDataPoint[] {
  if (rows.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const finalDate = parseLocalYMD(dataFinal);

  // Calcular série diária real
  const cumulatives: number[] = [];
  let cumSum = 0;
  for (const row of rows) {
    cumSum += row.leadsPagos + row.leadsOrg + row.leadsSemTrack;
    cumulatives.push(cumSum);
  }

  const dailySeries = calculateDailyFromCumulative(cumulatives);

  // Calcular run-rate e sigma
  const runRate = calculateRunRateWeighted(dailySeries, windowSize);
  const sigma = calculateSigma(dailySeries, windowSize);

  // Calcular meta cumulativa
  const firstDate = parseLocalYMD(rows[0].date);
  const periodDays = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dailyMeta = metaTotal / periodDays;

  // Calcular dados do gráfico
  const result: ChartDataPoint[] = [];
  let cumulativeReal = 0;
  const todayStr = toLocalYMD(today);

  const daysToInclude = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  for (let dayIndex = 0; dayIndex < daysToInclude; dayIndex++) {
    const currentDate = new Date(firstDate);
    currentDate.setDate(currentDate.getDate() + dayIndex);

    const dateStr = toLocalYMD(currentDate);
    const historyRow = rows.find((r) => r.date === dateStr);

    const metaCumulative = dailyMeta * (dayIndex + 1);

    const isFuture = dateStr >= todayStr;

    if (historyRow && !isFuture) {
      // REAL: até ontem (inclusive)
      const dailyReal = historyRow.leadsPagos + historyRow.leadsOrg + historyRow.leadsSemTrack;
      cumulativeReal += dailyReal;

      result.push({
        date: dateStr,
        dailyReal,
        dailyProjected: null,
        cumulativeReal,
        cumulativeProjected: null,
        cumulative: cumulativeReal,
        isProjection: false,
        bandUpper: null,
        bandLower: null,
        meta: metaCumulative,
      });
    } else if (!isFuture) {
      // REAL SEM DADO: gap até ontem — tratar como 0, NÃO projetar pra trás
      // (bug: antes caia no else e projetava com daysAhead negativo, gerando
      // valores tipo -145 no primeiro ponto)
      result.push({
        date: dateStr,
        dailyReal: 0,
        dailyProjected: null,
        cumulativeReal,
        cumulativeProjected: null,
        cumulative: cumulativeReal,
        isProjection: false,
        bandUpper: null,
        bandLower: null,
        meta: metaCumulative,
      });
    } else {
      // PROJEÇÃO: a partir de hoje (inclusive)
      const daysAhead = Math.floor((parseLocalYMD(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const cumulativeProjected = cumulativeReal + runRate * daysAhead;
      const bandHalfWidth = sigma * Math.sqrt(Math.max(1, daysAhead));

      result.push({
        date: dateStr,
        dailyReal: null,
        dailyProjected: runRate,
        cumulativeReal: null,
        cumulativeProjected,
        cumulative: cumulativeProjected,
        isProjection: true,
        bandUpper: cumulativeProjected + bandHalfWidth,
        bandLower: Math.max(0, cumulativeProjected - bandHalfWidth),
        meta: metaCumulative,
      });
    }
  }

  return result;
}

/**
 * Calcula projeção final vs meta (em percentual)
 */
export function calculateProjectionPercentage(chartData: ChartDataPoint[]): number {
  if (chartData.length === 0) return 0;

  const lastPoint = chartData[chartData.length - 1];
  const finalCumulative = lastPoint.cumulativeProjected ?? lastPoint.cumulativeReal ?? 0;
  const meta = lastPoint.meta;

  return meta > 0 ? (finalCumulative / meta) * 100 : 0;
}

// Manter compatibilidade com funções antigas (deprecated)
export function calculateDailyAverage(rows: DailyRow[]): number {
  if (rows.length === 0) return 0;
  const totalLeads = rows.reduce((sum, row) => sum + row.leadsPagos + row.leadsOrg, 0);
  return totalLeads / rows.length;
}

export function calculateTendency(rows: DailyRow[], dataFinal: string): number[] {
  // Manter para compatibilidade, mas será deprecado
  const cumulatives = rows.map((_, i) => {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += rows[j].leadsPagos + rows[j].leadsOrg;
    }
    return sum;
  });

  const mediaDiaria = calculateDailyAverage(rows);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const finalDate = parseLocalYMD(dataFinal);
  const lastAccumulated = cumulatives[cumulatives.length - 1] || 0;

  const tendency: number[] = [];
  let cumulativeTotal = 0;
  const startDate = parseLocalYMD(rows[0].date);

  for (let dayIndex = 0; dayIndex <= Math.floor((finalDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)); dayIndex++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + dayIndex);

    const dateStr = toLocalYMD(currentDate);
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow && currentDate <= today) {
      const dailyLeads = historyRow.leadsPagos + historyRow.leadsOrg;
      cumulativeTotal += dailyLeads;
      tendency.push(cumulativeTotal);
    } else {
      const daysFromEnd = Math.floor((currentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      tendency.push(lastAccumulated + mediaDiaria * daysFromEnd);
    }
  }

  return tendency;
}

export function calculateMeta(rows: DailyRow[], dataFinal: string, metaTotal: number): number[] {
  if (rows.length === 0 || metaTotal <= 0) return [];

  const firstDate = parseLocalYMD(rows[0].date);
  const finalDate = parseLocalYMD(dataFinal);
  const periodoCapt = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (periodoCapt <= 0) {
    console.warn("Data final é anterior ou igual à data de início");
    return [];
  }

  const metaDiaria = metaTotal / periodoCapt;
  const meta: number[] = [];

  for (let dayIndex = 1; dayIndex <= periodoCapt; dayIndex++) {
    meta.push(metaDiaria * dayIndex);
  }

  return meta;
}

export function expandChartData(
  rows: DailyRow[],
  dataFinal: string,
  metaTotal: number,
): Array<{
  date: string;
  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  leadsReais: number;
  tendencia: number;
  meta: number;
}> {
  if (rows.length === 0) return [];

  const tendency = calculateTendency(rows, dataFinal);
  const meta = calculateMeta(rows, dataFinal, metaTotal);

  const firstDate = parseLocalYMD(rows[0].date);
  const finalDate = parseLocalYMD(dataFinal);
  const result = [];
  let cumulativeLeads = 0;

  const daysToInclude = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  for (let dayIndex = 0; dayIndex < daysToInclude; dayIndex++) {
    const currentDate = new Date(firstDate);
    currentDate.setDate(currentDate.getDate() + dayIndex);

    const dateStr = toLocalYMD(currentDate);
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow) {
      const dailyLeads = historyRow.leadsPagos + historyRow.leadsOrg + historyRow.leadsSemTrack;
      cumulativeLeads += dailyLeads;

      result.push({
        date: dateStr,
        leadsPagos: historyRow.leadsPagos,
        leadsOrg: historyRow.leadsOrg,
        leadsSemTrack: historyRow.leadsSemTrack,
        leadsReais: cumulativeLeads,
        tendencia: tendency[dayIndex] ?? 0,
        meta: meta[dayIndex] ?? 0,
      });
    } else {
      result.push({
        date: dateStr,
        leadsPagos: 0,
        leadsOrg: 0,
        leadsSemTrack: 0,
        leadsReais: cumulativeLeads,
        tendencia: tendency[dayIndex] ?? 0,
        meta: meta[dayIndex] ?? 0,
      });
    }
  }

  return result;
}
