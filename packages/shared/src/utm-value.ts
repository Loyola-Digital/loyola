/**
 * Story 18.71 — o valor efetivo de um `utm_content` vindo de célula de planilha.
 *
 * ## O problema
 *
 * O `co=` das planilhas de venda deixou de ser sempre o ad_id puro. Medindo as
 * 85 células que começam com `{` em todas as abas de venda de produção
 * (2026-09-02), aparecem **três** formatos, não um:
 *
 * | formato | linhas | exemplo |
 * |---|---|---|
 * | objeto JSON | 5 | `{"co":"120247542282230489","url":"…","v":1}` |
 * | par duplicado | 41 | `{"org","org"}`, `{"imersao","imersao"}` |
 * | macro não resolvida | 42 | `{{ad.id}}` |
 *
 * O código tratava os três como texto e usava a string inteira como chave de
 * anúncio. Ela não casa com nada, e a venda era descartada **sem erro e sem
 * log** — 2 vendas do `bbe-pr2-ago-26` (R$ 2.991,00) sumiram da atribuição.
 *
 * ## Por que aqui, e não em `api/src/utils/`
 *
 * A tabela "Leads & vendas por UTM" agrupa no frontend e precisa da mesma
 * regra: sem ela, cada `{"co":"org","u":"<uuid>"…}` vira um grupo próprio na
 * tela, porque o `u` muda a cada venda.
 *
 * ## Módulo folha, de propósito
 *
 * **Sem nenhum import** — mesmo desenho de `stage-types.ts` e `contract.ts`, e
 * pelo mesmo motivo. O web consome por subpath
 * (`@loyola-x/shared/src/utm-value`), a API pelo índice (bare). Os dois
 * caminhos **não** são intercambiáveis: ver a tabela em `index.ts`.
 */

/**
 * Story 18.100 (AC4a) — o prefixo que a integração do Lead Form da Meta põe na
 * frente do id, por coluna. A aba `facebook-lead-form` grava `c:120249…` em
 * `utm_campaign`, `as:120249…` em `utm_medium` e `ag:120249…` em `utm_content`;
 * a aba do formulário da LP grava o id puro. Sem tirar o prefixo, o lead do
 * Lead Form não casa com o anúncio, o conjunto nem a campanha.
 *
 * A regra é POR COLUNA: um `as:` em `utm_content` não é prefixo de anúncio.
 */
const PREFIXO_DE_ID_POR_COLUNA: Readonly<Record<string, string>> = {
  utm_campaign: "c:",
  utm_medium: "as:",
  utm_content: "ag:",
};

/** O resto que conta como id: dígitos, com o `_` opcional do Sheets na frente. */
const ID_NUMERICO = /^_?\d+$/;

/**
 * Story 18.100 (AC4a) — o valor da célula sem o prefixo de id da sua coluna.
 *
 * | coluna | entrada | saída |
 * |---|---|---|
 * | `utm_campaign` | `c:120249689901480208` | `120249689901480208` |
 * | `utm_medium` | `as:120249…` | `120249…` |
 * | `utm_content` | `ag:120249…` | `120249…` |
 * | `utm_content` | `ag:_120249…` | `_120249…` (o `_` sai em `normalizeNumericId`) |
 * | `utm_content` | `as:120249…` | intacto (prefixo de outra coluna) |
 * | `utm_content` | `ag:abc` | intacto (resto não é id) |
 * | qualquer outra | qualquer valor | intacto |
 *
 * Idempotente: aplicar duas vezes dá o mesmo que uma. Fica FORA de
 * `utmContentEfetivo` de propósito: aquela função também serve o `co=` das
 * vendas, e a tabela de formatos da 18.71 não muda. É aplicada uma vez por
 * linha, na camada que une as planilhas de leads (web e API).
 */
export function semPrefixoDeId(coluna: string, valor: string): string {
  if (typeof valor !== "string") return valor;
  const prefixo = PREFIXO_DE_ID_POR_COLUNA[coluna];
  if (!prefixo) return valor;
  const limpo = valor.trim();
  if (!limpo.startsWith(prefixo)) return valor;
  const resto = limpo.slice(prefixo.length);
  return ID_NUMERICO.test(resto) ? resto : valor;
}

/** `{{ad.id}}`, `{{campaign.name}}` — macro do Meta que o anúncio não substituiu. */
const MACRO_NAO_RESOLVIDA = /^\{\{.*\}\}$/;

/** `{"org","org"}` — dois literais entre chaves. Não é JSON: `JSON.parse` lança. */
const PAR_ENTRE_CHAVES = /^\{\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\}$/;

/**
 * `_123` → `123`. O Sheets exporta id longo com underscore na frente para não
 * perder precisão. Vale para id que vem da **API do Meta** também, onde nunca
 * há JSON — por isso continua exportada separada.
 */
export function normalizeNumericId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("_")) {
    const rest = trimmed.slice(1);
    if (/^\d+$/.test(rest)) return rest;
  }
  return trimmed;
}

/**
 * O `utm_content` efetivo de uma célula de planilha.
 *
 * Devolve `""` quando não há criativo a atribuir — o chamador já trata `""`
 * como "linha sem ad_id" e pula.
 *
 * **Nunca lança.** Célula de planilha é dado externo: JSON malformado volta
 * como texto cru, não como exceção.
 *
 * | entrada | saída |
 * |---|---|
 * | `120247234266910489` | `120247234266910489` |
 * | `_120247234266910489` | `120247234266910489` |
 * | `{"co":"1202…","url":"…","v":1}` | `1202…` |
 * | `{"co":"org","u":"<uuid>",…}` | `org` |
 * | `{"url":"…","v":1}` (sem `co`) | `""` |
 * | `{"org","org"}` | `org` |
 * | `{"a","b"}` (par que não é duplicado) | o texto cru |
 * | `{{ad.id}}` | `""` |
 * | `{ qualquer outra coisa` | o texto cru |
 * | `""` / `"   "` / nulo | `""` |
 */
export function utmContentEfetivo(raw: string | null | undefined): string {
  if (raw == null) return "";
  const bruto = String(raw).trim();
  if (!bruto) return "";
  if (!bruto.startsWith("{")) return normalizeNumericId(bruto);

  // Macro que o Meta não substituiu: não é criativo, e devolver o texto cru
  // criaria um "anúncio" chamado `{{ad.id}}` na tela.
  if (MACRO_NAO_RESOLVIDA.test(bruto)) return "";

  try {
    const obj: unknown = JSON.parse(bruto);
    if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
      const co = (obj as Record<string, unknown>).co;
      // Só string ou número. Um `co` aninhado (`{"co":{"x":1}}`) viraria
      // "[object Object]" no String() e criaria um anúncio com esse nome na
      // tela — pior que não atribuir.
      if (typeof co !== "string" && typeof co !== "number") return "";
      return normalizeNumericId(String(co));
    }
  } catch {
    // Não é JSON — cai no par duplicado abaixo. Nunca propaga.
  }

  const par = PAR_ENTRE_CHAVES.exec(bruto);
  // Só quando os dois lados são o MESMO valor. `{"a","b"}` é ambíguo, e
  // escolher um dos dois seria inventar atribuição — devolve o texto cru e
  // deixa a linha visível como o dado estranho que ela é.
  if (par && par[1] === par[2] && par[1] !== "") return normalizeNumericId(par[1]);

  return bruto;
}
