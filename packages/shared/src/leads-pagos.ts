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

/*
 * ## Story 18.102 — o lead cujo `utm_content` é o NOME do anúncio
 *
 * Os anúncios do `bbe-m1-out26` saíram com parâmetros de URL por nome
 * (`utm_content={{ad.name}}`). A planilha da etapa tinha ~100 leads e a coluna
 * Leads mostrava 1, a única linha que veio com o ad_id. A linha da tabela já
 * é o grupo de anúncios com o mesmo nome; casar o `utm_content` com esse nome
 * é a mesma regra de agrupamento, não uma atribuição nova.
 *
 * **Unicidade.** O nome só atribui quando identifica UMA unidade da lista que
 * está sendo contada. Na visão "Todos" do Top Criativos (um card por anúncio)
 * o mesmo nome aparece em N cards, e os agrupamentos usam `trim()` sem baixar
 * a caixa (`AD01` e `ad01` são dois grupos). Contar a linha em todos inflaria
 * o total; sem saber de qual deles o lead veio, ela não conta em nenhum. A
 * linha com ad_id segue a regra de antes, sem essa restrição.
 */

/**
 * O nome do criativo como chave de comparação: sem espaços nas pontas e em
 * minúsculas. Vazio quando não há nome. Não decodifica URL: a planilha guarda
 * o texto já decodificado.
 */
export function chaveDoNomeDoCriativo(nome: string | null | undefined): string {
  return (nome ?? "").trim().toLowerCase();
}

/**
 * As chaves de nome que identificam UMA unidade só na lista. Nome que aparece
 * em duas ou mais unidades (mesmo depois de normalizado) fica de fora.
 */
export function nomesQueIdentificamUmCriativo(
  nomes: Iterable<string | null | undefined>,
): Set<string> {
  const vezes = new Map<string, number>();
  for (const nome of nomes) {
    const chave = chaveDoNomeDoCriativo(nome);
    if (chave) vezes.set(chave, (vezes.get(chave) ?? 0) + 1);
  }
  const unicos = new Set<string>();
  for (const [chave, n] of vezes) if (n === 1) unicos.add(chave);
  return unicos;
}

/**
 * A chave do nome deste criativo, se ele for único na lista
 * (`nomesQueIdentificamUmCriativo`); `null` quando não pode atribuir por nome.
 */
export function chaveDoNomeSeUnico(
  nome: string | null | undefined,
  unicos: ReadonlySet<string>,
): string | null {
  const chave = chaveDoNomeDoCriativo(nome);
  return chave && unicos.has(chave) ? chave : null;
}

/**
 * A linha casa com o criativo pelo nome? Recebe o `utm_content` JÁ efetivo
 * (`utmContentEfetivo`, que este módulo folha não importa) e a chave de
 * `chaveDoNomeSeUnico`. Sem chave (nome repetido ou vazio), nunca casa.
 */
export function utmContentEhONomeDoCriativo(
  utmContentEfetivo: string,
  chaveDoNome: string | null,
): boolean {
  if (!chaveDoNome) return false;
  return chaveDoNomeDoCriativo(utmContentEfetivo) === chaveDoNome;
}
