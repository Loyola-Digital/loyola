// Story 18.86 — quando a tabela "Dados diários" aparece no dashboard da etapa.
//
// Antes, só com planilha de LEADS (`funnel_spreadsheets`). Só que na Captação
// Paga a tabela não lê lead de planilha: as colunas de ingresso, faturamento,
// ticket e CPL vêm da planilha de VENDAS (`stage_sales_spreadsheets`, Stories
// 18.51b/18.52), e o resto vem da Meta. Um lançamento com só a planilha de
// vendas (dgpg05-out-26, 28/09/2026) ficava sem a tabela tendo todos os dados
// dela.
//
// Vale só para a TABELA. Os blocos vizinhos da tela (Leads por UTM, CPL,
// Acumulados, Tendência, Projeção) seguem exigindo a planilha de leads — fora do
// escopo da 18.86.

export interface EntradaDadosDiarios {
  /** `ehCaptacaoPaga(stageType)` — inclui `event_capture`. */
  ehPaga: boolean;
  /** Há planilha de leads vinculada à etapa (`metrics.hasLinkedSheet`). */
  temPlanilhaDeLeads: boolean;
  /** A rota de vendas devolveu dados (`salesData.semDados === false`). */
  temVendas: boolean;
  /** Quantos dias a tabela teria (`metrics.rows.length`). */
  qtdDias: number;
}

export function deveMostrarDadosDiarios({
  ehPaga,
  temPlanilhaDeLeads,
  temVendas,
  qtdDias,
}: EntradaDadosDiarios): boolean {
  if (qtdDias === 0) return false;
  if (temPlanilhaDeLeads) return true;
  // Sem planilha de leads, só a Paga tem de onde tirar as colunas de ingresso.
  return ehPaga && temVendas;
}
