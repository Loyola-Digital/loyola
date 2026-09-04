/**
 * CTR e CPC de CLIQUE NO LINK — a única definição do produto.
 *
 * ## Por que existe
 *
 * O gestor decidiu em 2026-09-03 que o produto tem UM CTR e é o de clique no
 * link, como no Gerenciador da Meta, **sem fallback** para cliques em qualquer
 * lugar do anúncio. A Story 18.76 aplicou a regra no agregado do Top Criativos
 * e parou aí. Sobreviveram duas outras cópias, as duas com o fallback:
 *
 * ```ts
 * // api/services/traffic-analytics.ts (buildAnalyticsRow)
 * // web/components/funnels/perpetual-dashboard.tsx (merge de cópias)
 * ctr: linkClicks > 0 ? (linkClicks / impressions) * 100
 *                     : (clicks / impressions) * 100   // ← o fallback
 * ```
 *
 * O efeito, medido em produção em 2026-09-04: o mesmo criativo com dois
 * números na mesma tela — `—` no card do Top Criativos e um percentual na
 * tabela ao lado (7 de 11 grupos em `bbe-pr2 :: Captação Paga (Aplicação)`,
 * 2 de 19 no Lyrio, 1 de 21 no perpétuo do BBE).
 *
 * Três cópias da mesma fórmula é como elas divergem. Agora é uma.
 *
 * ## A regra
 *
 * `null` = a Meta não devolveu `link_click` para o objetivo desta campanha.
 * `0` = veio, e foi zero. A diferença entre "não medimos" e "ninguém clicou"
 * sobrevive até a tela, que mostra `—` no primeiro caso. Nunca reescrever o
 * retorno com `?? 0`.
 *
 * Módulo FOLHA de propósito: sem imports, para poder ser importado por valor
 * dos dois lados (a API por bare specifier, o web por subpath) sem arrastar o
 * resto do pacote para dentro do bundle do Next.
 */

/** CTR de link: `cliques no link ÷ impressões × 100`. */
export function ctrDeLink(
  linkClicks: number | null | undefined,
  impressions: number,
): number | null {
  if (linkClicks == null || impressions <= 0) return null;
  return (linkClicks / impressions) * 100;
}

/**
 * CPC de link: `investimento ÷ cliques no link`.
 *
 * Zero clique é `null` e não infinito: sem denominador não há custo por clique
 * a informar.
 */
export function cpcDeLink(
  linkClicks: number | null | undefined,
  spend: number,
): number | null {
  if (linkClicks == null || linkClicks <= 0) return null;
  return spend / linkClicks;
}

/**
 * Soma os cliques no link de um grupo (um Ad Name com N ad_ids, as cópias de
 * uma linha do Detalhamento, os anúncios de um card).
 *
 * Só quem TEM a métrica entra na soma, e o grupo fica `null` quando nenhum
 * membro tem. Somar `?? 0` apagaria a distinção que o resto deste módulo
 * existe para preservar.
 */
export function somarLinkClicks(
  membros: readonly { linkClicks: number | null | undefined }[],
): number | null {
  const com = membros.filter((m) => m.linkClicks != null);
  if (com.length === 0) return null;
  return com.reduce((s, m) => s + (m.linkClicks ?? 0), 0);
}
