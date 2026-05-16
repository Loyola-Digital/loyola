import type { DailyRow } from "./funnel-metrics";

/**
 * Calcula a média diária de leads (Pago + Orgânico, excluindo "Sem Track")
 * @param rows - Array de dias com dados de leads
 * @returns Média diária de leads pagos + orgânicos
 */
export function calculateDailyAverage(rows: DailyRow[]): number {
  if (rows.length === 0) return 0;

  const totalLeads = rows.reduce((sum, row) => sum + row.leadsPagos + row.leadsOrg, 0);
  return totalLeads / rows.length;
}

/**
 * Calcula a projeção de tendência (cinza pontilhada)
 * Baseado na média diária do histórico, projeta até a data final
 * @param rows - Array histórico de dias
 * @param dataFinal - Data final do lançamento (YYYY-MM-DD)
 * @returns Array de valores projetados para cada dia
 */
export function calculateTendency(rows: DailyRow[], dataFinal: string): number[] {
  if (rows.length === 0) return [];

  const mediaDiaria = calculateDailyAverage(rows);
  const lastDate = new Date(rows[rows.length - 1].date);
  const finalDate = new Date(dataFinal);

  // Leads acumulados até hoje (último dia do histórico)
  const lastAccumulated = rows.reduce((sum, row) => sum + row.leadsPagos + row.leadsOrg, 0);

  const tendency: number[] = [];
  let currentDate = new Date(rows[0].date);
  let dayIndex = 0;

  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow && currentDate <= lastDate) {
      // Dados reais do passado
      tendency.push(historyRow.leadsPagos + historyRow.leadsOrg);
    } else {
      // Projeção futura
      const daysFromEnd = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      tendency.push(lastAccumulated + mediaDiaria * daysFromEnd);
    }

    currentDate.setDate(currentDate.getDate() + 1);
    dayIndex++;
  }

  return tendency;
}

/**
 * Calcula a meta cumulativa (vermelho sólido)
 * Divide a meta total pelo período e acumula dia a dia
 * @param rows - Array histórico de dias
 * @param dataFinal - Data final do lançamento (YYYY-MM-DD)
 * @param metaTotal - Meta total de leads a capturar
 * @returns Array de valores cumulativos da meta para cada dia
 */
export function calculateMeta(
  rows: DailyRow[],
  dataFinal: string,
  metaTotal: number,
): number[] {
  if (rows.length === 0 || metaTotal <= 0) return [];

  const firstDate = new Date(rows[0].date);
  const finalDate = new Date(dataFinal);

  // Período de captação em dias
  const periodoCapt = Math.floor((finalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (periodoCapt <= 0) {
    console.warn("Data final é anterior ou igual à data de início");
    return [];
  }

  const metaDiaria = metaTotal / periodoCapt;
  const meta: number[] = [];
  let currentDate = new Date(firstDate);
  let dayIndex = 1;

  while (currentDate <= finalDate) {
    meta.push(metaDiaria * dayIndex);
    currentDate.setDate(currentDate.getDate() + 1);
    dayIndex++;
  }

  return meta;
}

/**
 * Expande os dados do gráfico com colunas de tendência e meta
 * @param rows - Array histórico
 * @param dataFinal - Data final
 * @param metaTotal - Meta total
 * @returns Array de objetos com reais, tendência e meta
 */
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

  const firstDate = new Date(rows[0].date);
  const finalDate = new Date(dataFinal);
  const result = [];
  let currentDate = new Date(firstDate);
  let dayIndex = 0;

  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow) {
      result.push({
        date: dateStr,
        leadsPagos: historyRow.leadsPagos,
        leadsOrg: historyRow.leadsOrg,
        leadsSemTrack: historyRow.leadsSemTrack,
        leadsReais: historyRow.leadsPagos + historyRow.leadsOrg + historyRow.leadsSemTrack,
        tendencia: tendency[dayIndex] ?? 0,
        meta: meta[dayIndex] ?? 0,
      });
    } else {
      // Dia sem dados históricos (projeção)
      result.push({
        date: dateStr,
        leadsPagos: 0,
        leadsOrg: 0,
        leadsSemTrack: 0,
        leadsReais: 0,
        tendencia: tendency[dayIndex] ?? 0,
        meta: meta[dayIndex] ?? 0,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
    dayIndex++;
  }

  return result;
}
