/**
 * Story 18.88 — o post publicado de cada linha do Desempenho de Criativos.
 *
 * A coluna Preview abria a Ads Library (`?id=<adId>`) e, na visão compilada
 * (temperatura Todos), recebia `compiled_<nome>`, um id inválido. Passa a abrir
 * o mesmo link do "Ver criativo publicado" do Top Criativos.
 *
 * ## A ordem por anúncio (Story 29.63)
 *
 * 1. `igPermalinkUrl`: `https://www.instagram.com/p/{code}/`
 * 2. `adPermalinkUrl`: o post do Facebook (36.8)
 * 3. `null`: a tela mostra "—"
 *
 * É a mesma cascata de `creativePermalink` (`packages/web/lib/utils/
 * creative-permalink.ts`). Está reescrita aqui porque a API não importa do web
 * e o `packages/shared` não tem runner de teste. Os dois campos costumam vir
 * juntos: inverter a ordem não quebra cobertura nenhuma, só troca o link calado.
 * O teste `post-do-criativo-1888.test.ts` prende a ordem.
 *
 * ⚠️ O cache chama o post do Facebook de **`adPermalinkUrl`**. A rota de vídeo
 * chama o mesmo dado de `permalinkUrl`; o tipo abaixo tem os dois campos
 * opcionais, então passar o objeto errado compila e devolve `null`.
 *
 * ## Um link por Ad Name (AC1)
 *
 * Um Ad Name agrupa vários ad_ids, e cada um pode ser um post diferente. Fica o
 * post do ad_id de **maior investimento entre os que têm link**, a mesma regra
 * do `previewUrl` de vídeo da rota. Empate: o primeiro encontrado. Se o maior
 * investimento só tem Facebook e um anúncio menor tem Instagram, fica o
 * Facebook: é o anúncio que mais responde pelos números da linha.
 *
 * Pura e sem I/O.
 */

/** O que a cascata lê do `meta_ad_creatives_cache.creative`. */
export interface PermalinksDoCache {
  igPermalinkUrl?: string | null;
  adPermalinkUrl?: string | null;
}

/** Instagram, depois Facebook, depois `null` (nunca string vazia). */
export function postDoAnuncio(
  creative: PermalinksDoCache | null | undefined,
): string | null {
  return creative?.igPermalinkUrl || creative?.adPermalinkUrl || null;
}

/**
 * O post do grupo: o do ad_id de maior investimento entre os que têm link.
 *
 * @param adIds ad_ids do grupo, na ordem em que a rota os encontrou (decide o empate)
 * @param spendPorAdId investimento por ad_id (ausente conta como 0)
 * @param postPorAdId post já resolvido por ad_id (`postDoAnuncio`)
 */
export function postDoGrupo(
  adIds: readonly string[],
  spendPorAdId: ReadonlyMap<string, number>,
  postPorAdId: ReadonlyMap<string, string>,
): string | null {
  let post: string | null = null;
  let melhorSpend = -1;
  for (const id of adIds) {
    const url = postPorAdId.get(id);
    if (!url) continue;
    const sp = spendPorAdId.get(id) ?? 0;
    if (sp > melhorSpend) {
      melhorSpend = sp;
      post = url;
    }
  }
  return post;
}
