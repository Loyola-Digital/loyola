/**
 * Story 18.83 — a LP de um anúncio é o link que a pessoa viu.
 *
 * O perpétuo (Story 29.40) já identifica a página pela URL de destino do
 * criativo, lida do `meta_ad_creatives_cache`. O lançamento identificava pelo
 * `lpX` no nome da CAMPANHA, e isso errava de página: no `bbe-pr2`, 24 anúncios
 * da leva03 rodavam em campanhas `…videos-lpa` apontando para a captura-d, e
 * 22,2 % do "LPA" era gasto de outra página.
 *
 * Este módulo é a cadeia `ad_id → URL` do lado da API, compartilhada pelas três
 * leituras que precisam dela no lançamento:
 *
 *   - a tabela "Desempenho de Testes de LPs" (`creative-performance`);
 *   - o mini-funil da LP (`lp-funnel`);
 *   - as aplicações por página da etapa de Vendas (Story 18.84).
 *
 * Nenhuma chamada à Meta: o cache é mantido pelo sync e pela auto-cura (29.56).
 * O que não está lá vira causa de "Sem link resolvido", nunca palpite.
 */

import { and, eq, inArray } from "drizzle-orm";
import { normalizeLpUrl } from "@loyola-x/shared";
import { metaAdCreativesCache, metaAdInsightsDaily } from "../db/schema.js";
import { LINK_URL_RESOLVER_VERSION } from "./meta-ads.js";
import type { Database } from "../db/client.js";

/**
 * As três causas de um anúncio sem URL que dependem do CACHE (29.43). Cada uma
 * manda o gestor a um lugar diferente:
 *
 *   `fora_do_cache`        nunca sincronizado — a auto-cura busca
 *   `cache_desatualizado`  linha gravada antes da 29.40 — a auto-cura busca
 *   `sem_link_na_meta`     carimbada pelo resolver atual, e a Meta não tem URL
 *
 * A quarta causa do perpétuo (indeterminada) não nasce aqui: esta API sempre
 * informa a causa. A quinta, própria do lançamento (campanha sem dado por
 * anúncio), é de nível campanha e vive em `utils/lp-por-anuncio.ts`.
 */
export type CausaSemLink = "fora_do_cache" | "cache_desatualizado" | "sem_link_na_meta";

export interface LinkDoAnuncio {
  /** URL crua do criativo, para o `href`. `null` = sem link resolvido. */
  url: string | null;
  /** Identidade da página (`normalizeLpUrl`). `null` = sem link resolvido. */
  chave: string | null;
  /** Por que não há chave. `null` quando há. */
  causa: CausaSemLink | null;
}

type CriativoDoCache = { linkUrl?: string | null; linkUrlResolver?: number } | null | undefined;

/**
 * Classifica o que o cache diz de UM anúncio.
 *
 * `linha === undefined` = o anúncio não tem linha no cache. `linkUrl` presente
 * mas não normalizável (`tel:`, deep link de app) não é página: conta como
 * "sem link na Meta" quando carimbado, como o perpétuo faz com chave nula.
 */
export function classificarLinkDoCache(linha: { creative: CriativoDoCache } | undefined): LinkDoAnuncio {
  if (!linha) return { url: null, chave: null, causa: "fora_do_cache" };
  const url = linha.creative?.linkUrl ?? null;
  const chave = normalizeLpUrl(url);
  if (chave) return { url, chave, causa: null };
  // Mesma precedência do `/ad-link-urls` (29.43): cache velho antes de "a Meta
  // não tem" — afirmar ausência na Meta com base numa linha que nunca perguntou
  // seria inventar.
  const resolver = linha.creative?.linkUrlResolver ?? 0;
  if (url === null && resolver < LINK_URL_RESOLVER_VERSION) {
    return { url: null, chave: null, causa: "cache_desatualizado" };
  }
  return { url: null, chave: null, causa: "sem_link_na_meta" };
}

/**
 * O recorte da leitura do cache de criativos. Exportado para o teste renderizar
 * a SQL: um banco mockado aceitaria o `where` sem o `project_id` e o teste
 * continuaria verde — e `ad_id` solto leria o criativo de OUTRO projeto que
 * tenha o mesmo anúncio (a PK é `(project_id, ad_id)`).
 */
export function condicaoDoCacheDeCriativos(projectId: string, adIds: string[]) {
  return and(
    eq(metaAdCreativesCache.projectId, projectId),
    inArray(metaAdCreativesCache.adId, adIds),
  );
}

/** `ad_id → link`, lido do cache do projeto. Anúncio sem linha → `fora_do_cache`. */
export async function lerLinksDosAnuncios(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<Map<string, LinkDoAnuncio>> {
  const unicos = [...new Set(adIds.filter(Boolean))];
  const out = new Map<string, LinkDoAnuncio>();
  if (unicos.length === 0) return out;
  const linhas = await db
    .select({ adId: metaAdCreativesCache.adId, creative: metaAdCreativesCache.creative })
    .from(metaAdCreativesCache)
    .where(condicaoDoCacheDeCriativos(projectId, unicos));
  const porId = new Map(linhas.map((l) => [l.adId, l]));
  for (const id of unicos) out.set(id, classificarLinkDoCache(porId.get(id)));
  return out;
}

/**
 * As listas que a auto-cura (29.56) recebe, a partir das causas. Só as duas
 * causas curáveis entram — "sem link na Meta" é fato medido, e re-perguntar
 * seria tráfego perpétuo contra a Meta (o AC5 da 29.56).
 */
export function listasDaCura(links: Map<string, LinkDoAnuncio>): {
  staleInCache: string[];
  missingFromCache: string[];
} {
  const staleInCache: string[] = [];
  const missingFromCache: string[] = [];
  for (const [id, l] of links) {
    if (l.causa === "cache_desatualizado") staleInCache.push(id);
    else if (l.causa === "fora_do_cache") missingFromCache.push(id);
  }
  return { staleInCache, missingFromCache };
}

/**
 * Recorte da leitura `ad_id → campaign_id` no banco, para a correção manual por
 * campanha (AC5) alcançar o mini-funil. Exportado pelo mesmo motivo da
 * `condicaoDoCacheDeCriativos`: sem o `project_id` o recorte vaza de projeto.
 */
export function condicaoDasCampanhasDosAnuncios(projectId: string, adIds: string[]) {
  return and(
    eq(metaAdInsightsDaily.projectId, projectId),
    inArray(metaAdInsightsDaily.adId, adIds),
  );
}

/** `ad_id → campaign_id` pelo banco (qualquer dia com entrega). */
export async function lerCampanhasDosAnuncios(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(adIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (unicos.length === 0) return out;
  const linhas = await db
    .selectDistinct({ adId: metaAdInsightsDaily.adId, campaignId: metaAdInsightsDaily.campaignId })
    .from(metaAdInsightsDaily)
    .where(condicaoDasCampanhasDosAnuncios(projectId, unicos));
  for (const l of linhas) if (l.campaignId && !out.has(l.adId)) out.set(l.adId, l.campaignId);
  return out;
}

/**
 * AC5 — a correção manual por campanha vale SÓ para o que está sem link.
 *
 * Anúncio com URL resolvida nunca muda por causa da correção: ela existe para
 * o que o cache não sabe, não para contrariar o que ele sabe.
 *
 * Correção com URL que não normaliza é ignorada (o PUT já valida http/https,
 * mas o dado do banco não passa por aqui validado de novo).
 */
export function linkComCorrecao(
  link: LinkDoAnuncio,
  campaignId: string | null | undefined,
  correcoes: Record<string, string> | null | undefined,
): LinkDoAnuncio & { corrigido: boolean } {
  if (link.chave || !campaignId || !correcoes) return { ...link, corrigido: false };
  const url = correcoes[campaignId];
  const chave = normalizeLpUrl(url);
  if (!chave) return { ...link, corrigido: false };
  return { url: url ?? null, chave, causa: null, corrigido: true };
}
