// ============================================================
// Story 43.4 — teto de paginação que não trunca em silêncio.
//
// A paginação da Meta é seguida corretamente em todo o `meta-ads.ts`: cada
// laço acompanha `paging.next` até o fim. O que existe são TETOS DEFENSIVOS
// contra loop infinito — e o problema nunca foi paginar pouco, foi parar sem
// avisar.
//
// Levantamento na `main` (2026-08-14), antes desta story:
//
//   fetchCampaigns                              cap 2000   sem aviso
//   fetchCampaignDailyInsightsForIdsSingleRange cap 5000   COM aviso
//   fetchAllAdSetInsightsImpl                   cap  500   sem aviso
//   fetchPlacementDailyInsights                 cap 5000   sem aviso
//   fetchAllAdInsightsImpl                      SEM cap    —
//
// Três dos quatro tetos truncavam calados: a resposta voltava incompleta e
// IDÊNTICA EM FORMA a uma completa. Um relatório sobre 500 de 700 anúncios não
// se anuncia.
//
// O único que avisava (`fetchCampaignDailyInsightsForIdsSingleRange`) trazia a
// justificativa certa no comentário, e virou o modelo desta função.
// ============================================================

export interface CapResult {
  /** Continuar buscando a próxima página? */
  continuar: boolean;
  /** `true` quando havia mais dados e o teto interrompeu. */
  truncado: boolean;
}

/**
 * Decide se a paginação continua, e sinaliza truncamento em vez de engolir.
 *
 * `truncado` só é `true` quando as duas coisas valem: a Meta ofereceu próxima
 * página E o teto foi atingido. Acabar as páginas naturalmente não é
 * truncamento — é o fim dos dados.
 *
 * A função é pura: quem chama decide o que fazer com `truncado` (logar,
 * propagar ao consumidor, ou os dois). Isso é o que a torna testável sem
 * fingir um logger.
 */
export function avaliarCap(nextUrl: string | undefined | null, obtidos: number, cap: number): CapResult {
  if (!nextUrl) return { continuar: false, truncado: false };
  if (obtidos >= cap) return { continuar: false, truncado: true };
  return { continuar: true, truncado: false };
}

/**
 * Mensagem padronizada de truncamento.
 *
 * Uniforme de propósito: quem procurar "cap de" no log encontra qualquer um dos
 * pontos, sem precisar saber que cada função inventou o próprio texto.
 */
export function mensagemTruncamento(origem: string, cap: number, contexto: string): string {
  return `[meta-ads] cap de ${cap} atingido em ${origem} (${contexto}) — resposta INCOMPLETA, pode faltar dado`;
}
