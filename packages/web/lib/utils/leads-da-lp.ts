/**
 * De onde vêm os leads de uma LP: a planilha do formulário ou o pixel.
 *
 * A LPA do FZM3 tem formulário e manda os leads para a planilha. A LPB não tem
 * formulário nenhum — a pessoa vai direto para o grupo — então a planilha fica
 * zerada para ela, e o `Lead` do pixel da Meta é o único rastro.
 *
 * A regra é a própria definição: **LP sem nenhum lead na planilha usa o
 * pixel**. Quem tem formulário continua exatamente como era. Se a LPB ganhar
 * formulário, ela passa a ter lead na planilha e volta sozinha para ela.
 *
 * "Nenhum lead" olha o TOTAL da planilha, não o recorte Hot/Cold: filtrar por
 * público não pode trocar a fonte da linha — senão Hot mostraria pixel e
 * Todos mostraria planilha para a mesma página.
 */

export type FonteDeLeads = "planilha" | "pixel";

export function leadsDaLp(
  planilha: { total: number; hot: number; cold: number } | undefined,
  pixelNoFiltro: number,
  filtro: "hot" | "cold" | "todos",
): { leads: number; fonte: FonteDeLeads } {
  if (!planilha || planilha.total === 0) {
    return { leads: pixelNoFiltro, fonte: "pixel" };
  }
  const leads =
    filtro === "hot" ? planilha.hot : filtro === "cold" ? planilha.cold : planilha.total;
  return { leads, fonte: "planilha" };
}
