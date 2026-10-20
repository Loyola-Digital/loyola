/**
 * Story 18.89 — leads de um criativo na rota `creative-performance`, pela
 * regra do Top Criativos.
 *
 * Antes a rota contava TODAS as linhas da aba de leads por `ad_id` (pagas ou
 * não, e-mail repetido ou não) e somava os ad_ids do grupo. O Top Criativos
 * conta só lead pago, cada e-mail uma vez no criativo. O mesmo criativo saía
 * com dois números — o gestor escolhia pausar ou escalar conforme a tela.
 *
 * A regra (origem paga e chave de dedup) vem do shared (`leads-pagos.ts`),
 * a mesma que `countLeadsByOriginForAds` usa no web.
 */
import { chaveDoLead, ehOrigemPagaDeLead } from "@loyola-x/shared";
import { utmContentEfetivo } from "./utm-value.js";

/** Índices das colunas na aba de leads. `-1` = coluna não mapeada. */
export interface ColunasDoLead {
  utmContent: number;
  utmSource: number;
  email: number;
}

/**
 * `ad_id → chaves dos leads pagos` daquele anúncio. A chave é o e-mail
 * normalizado (ou a da linha sem e-mail), para o criativo poder deduplicar
 * entre os seus anúncios: quem entrou por dois anúncios do mesmo criativo é UM
 * lead do criativo.
 *
 * Sem `utm_content` ou sem `utm_source` mapeados, nenhum lead é pago — igual
 * ao Top Criativos, que devolve 0 nesse caso.
 *
 * `linhas` já recortadas pela janela do seletor (o índice da linha na lista é
 * o que diferencia as linhas sem e-mail).
 */
export function chavesDeLeadsPagosPorAnuncio(
  linhas: string[][],
  colunas: ColunasDoLead,
): Map<string, Set<string>> {
  const porAnuncio = new Map<string, Set<string>>();
  if (colunas.utmContent === -1 || colunas.utmSource === -1) return porAnuncio;
  linhas.forEach((row, indice) => {
    if (!ehOrigemPagaDeLead(row[colunas.utmSource])) return;
    const adId = utmContentEfetivo(row[colunas.utmContent] ?? "");
    if (!adId) return;
    const email = colunas.email !== -1 ? row[colunas.email] : "";
    let chaves = porAnuncio.get(adId);
    if (!chaves) {
      chaves = new Set();
      porAnuncio.set(adId, chaves);
    }
    chaves.add(chaveDoLead(email, indice));
  });
  return porAnuncio;
}

/** Leads do criativo: chaves distintas entre TODOS os seus anúncios. */
export function leadsPagosDoCriativo(
  chavesPorAnuncio: ReadonlyMap<string, ReadonlySet<string>>,
  adIds: readonly string[],
): number {
  const chaves = new Set<string>();
  for (const adId of adIds) {
    for (const chave of chavesPorAnuncio.get(adId) ?? []) chaves.add(chave);
  }
  return chaves.size;
}
