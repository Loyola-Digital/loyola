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
 * Calcula a projeção de tendência CUMULATIVA (cinza pontilhada)
 * Baseado na média diária do histórico, projeta até a data final
 *
 * **Valores retornados: CUMULATIVOS**
 * - Cada posição do array representa o acumulado até aquele dia
 * - Histórico: soma real dos leads pagos + orgânicos até o dia
 * - Projeção futura: lastAccumulated + mediaDiaria * daysFromEnd
 *
 * **Lógica de passado vs futuro:**
 * - Hoje (new Date()) é considerado o último dia do PASSADO/realizado
 * - Amanhã+ é considerado FUTURO/projeção
 *
 * @param rows - Array histórico de dias
 * @param dataFinal - Data final do lançamento (YYYY-MM-DD)
 * @returns Array de valores CUMULATIVOS projetados para cada dia
 */
export function calculateTendency(rows: DailyRow[], dataFinal: string): number[] {
  if (rows.length === 0) return [];

  const mediaDiaria = calculateDailyAverage(rows);

  // Hoje é o limite entre passado (realizado) e futuro (projeção)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time para comparação correta

  const finalDate = new Date(dataFinal);

  // Leads acumulados até hoje (passado realizado)
  const lastAccumulated = rows.reduce((sum, row) => sum + row.leadsPagos + row.leadsOrg, 0);

  const tendency: number[] = [];
  const startDate = new Date(rows[0].date);
  // eslint-disable-next-line prefer-const
  let currentDate = startDate;
  let cumulativeTotal = 0;

  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow && currentDate <= today) {
      // Dados reais do PASSADO (até hoje inclusive)
      // Acumula os leads reais
      const dailyLeads = historyRow.leadsPagos + historyRow.leadsOrg;
      cumulativeTotal += dailyLeads;
      tendency.push(cumulativeTotal);
    } else {
      // Projeção FUTURA (a partir de amanhã)
      const daysFromEnd = Math.floor((currentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      tendency.push(lastAccumulated + mediaDiaria * daysFromEnd);
    }

    currentDate.setDate(currentDate.getDate() + 1);
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
  // eslint-disable-next-line prefer-const
  let currentDate = new Date(firstDate);

  for (let dayIndex = 1; currentDate <= finalDate; dayIndex++) {
    meta.push(metaDiaria * dayIndex);
    currentDate.setDate(currentDate.getDate() + 1);
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

  const tendency = calculateTendency(rows, dataFinal); // Agora retorna CUMULATIVO
  const meta = calculateMeta(rows, dataFinal, metaTotal); // Já é CUMULATIVO

  const firstDate = new Date(rows[0].date);
  const finalDate = new Date(dataFinal);
  const result = [];
  // eslint-disable-next-line prefer-const
  let currentDate = new Date(firstDate);
  let cumulativeLeads = 0; // Para acumular leadsReais

  for (let dayIndex = 0; currentDate <= finalDate; dayIndex++) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const historyRow = rows.find((r) => r.date === dateStr);

    if (historyRow) {
      // Acumula leads reais (pagos + orgânicos + sem track)
      const dailyLeads = historyRow.leadsPagos + historyRow.leadsOrg + historyRow.leadsSemTrack;
      cumulativeLeads += dailyLeads;

      result.push({
        date: dateStr,
        leadsPagos: historyRow.leadsPagos,
        leadsOrg: historyRow.leadsOrg,
        leadsSemTrack: historyRow.leadsSemTrack,
        leadsReais: cumulativeLeads, // CUMULATIVO
        tendencia: tendency[dayIndex] ?? 0, // Agora é CUMULATIVO
        meta: meta[dayIndex] ?? 0,
      });
    } else {
      // Dia sem dados históricos (projeção)
      result.push({
        date: dateStr,
        leadsPagos: 0,
        leadsOrg: 0,
        leadsSemTrack: 0,
        leadsReais: cumulativeLeads, // Mantém o acumulado (sem novos leads)
        tendencia: tendency[dayIndex] ?? 0, // Já é CUMULATIVO de calculateTendency
        meta: meta[dayIndex] ?? 0,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return result;
}
