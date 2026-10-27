/**
 * Story 18.89 — o que é um lead PAGO de um criativo, num lugar só.
 *
 * ## Por que este arquivo existe
 *
 * O Top Criativos e o Desempenho de Criativos mostravam números diferentes de
 * leads para o mesmo criativo (`ad04-fz-l4-bf26--melhores-amigos`: 38 × 5). Uma
 * das causas era esta lista: o Top Criativos considerava pago
 * `meta | meta-ads | google-ads` (`funnel-metrics.ts`) e a contagem da tabela,
 * `meta | google` (`contagem-de-leads.ts`) — duas constantes com o MESMO nome e
 * conteúdos diferentes. Decisão do gestor (P3): vale a primeira, para as duas
 * telas e para a API.
 *
 * Medido em 19/10/2026 nas 22 abas de leads/vendas vinculadas: `google` puro
 * não aparece em nenhuma linha; `google-ads` aparece em 5 e `meta-ads` em 0.
 *
 * ## A regra (AC1)
 *
 * Leads de um criativo = número de CHAVES distintas entre as linhas pagas cujo
 * `utm_content` é qualquer um dos ad_ids do criativo. A chave é o e-mail
 * normalizado; a linha sem e-mail não tem como ser deduplicada e conta 1
 * (`chaveDoLead`). Quem conta (web ou API) usa as duas funções abaixo.
 *
 * ## Módulo folha, de propósito
 *
 * Sem nenhum import — o web consome por `@loyola-x/shared/src/leads-pagos`
 * (ver a tabela em `index.ts`) e a API pelo índice.
 */

/** As origens (`utm_source`, já em minúsculas) que contam como lead pago. */
export const ORIGENS_PAGAS_DE_LEAD: ReadonlySet<string> = new Set([
  "meta",
  "meta-ads",
  "google-ads",
]);

/** `utm_source` da linha é de tráfego pago? Compara com trim + minúsculas. */
export function ehOrigemPagaDeLead(utmSource: string | null | undefined): boolean {
  return ORIGENS_PAGAS_DE_LEAD.has((utmSource ?? "").trim().toLowerCase());
}

/**
 * Story 18.96 (P6): o subconjunto Meta das origens pagas.
 *
 * Existe para quem divide o investimento DA META por uma contagem: lá
 * `google-ads` não pode entrar, senão o custo sai menor do que é. É o caso do
 * custo por aplicação paga da etapa de Aplicação (API e web leem daqui).
 */
export const ORIGENS_META_DE_LEAD: ReadonlySet<string> = new Set(["meta", "meta-ads"]);

/** `utm_source` da linha é da Meta? Compara com trim + minúsculas. */
export function ehOrigemMetaDeLead(utmSource: string | null | undefined): boolean {
  return ORIGENS_META_DE_LEAD.has((utmSource ?? "").trim().toLowerCase());
}

/**
 * A chave de deduplicação de um lead: o e-mail em minúsculas, sem espaços nas
 * pontas. Sem e-mail, uma chave própria da linha — conta 1 e nunca colide com
 * outra linha nem com um e-mail (e-mail não começa com `__`).
 *
 * `indiceDaLinha` precisa ser estável dentro da contagem (a posição da linha
 * na lista que está sendo contada).
 */
export function chaveDoLead(email: string | null | undefined, indiceDaLinha: number): string {
  const normalizado = (email ?? "").trim().toLowerCase();
  return normalizado || `__no-email_${indiceDaLinha}`;
}
