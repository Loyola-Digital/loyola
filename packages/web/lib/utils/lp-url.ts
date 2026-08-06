/**
 * Story 29.40 (AC2) — identidade de uma landing page a partir da URL do anúncio.
 *
 * Duas URLs que levam à mesma página TÊM que cair na mesma linha da tabela,
 * senão o comparativo de LPs vira uma lista de UTMs e não responde a pergunta
 * que motivou a story ("qual página cortar, qual escalar").
 *
 * A medição do AC0 mostrou que isso não é hipótese: entre os 40 anúncios da
 * amostra apareceu uma URL com macro da Meta NÃO expandida —
 *
 *   https://omeufilhobilingue.com.br/club-english-for-kids/?utm_source=meta&utm_medium={{adset.name}}
 *
 * — que aponta para a mesma página de outros 29 anúncios. Sem descartar a
 * query string, ela viraria uma LP própria, com investimento próprio e CAC
 * próprio, competindo na tabela contra a página da qual ela é apenas uma
 * variante de rastreio.
 */

/** Identidade de uma LP: serve como chave de agrupamento E como rótulo exibido. */
export type LpKey = string;

/**
 * Reduz uma URL de anúncio à identidade da página de destino.
 *
 * Regras, nesta ordem (AC2):
 *   1. host em minúsculas, sem `www.`
 *   2. query string e fragmento descartados — é onde vivem `utm_*`, `fbclid`,
 *      `gclid` e as macros da Meta, que variam por anúncio e não identificam
 *      a página
 *   3. barra final removida
 *   4. path preservado integralmente — `/inscricao` e `/inscricao-b` são LPs
 *      diferentes, e fundi-las esconderia exatamente o teste que o gestor quer ler
 *
 * O protocolo é `http`/`https` indiferentemente: a mesma página servida nos
 * dois esquemas é uma página só.
 *
 * @returns `host + path` normalizado, ou `null` se a URL não for utilizável.
 *          `null` nunca vira uma linha própria — vai para o bucket
 *          "Sem link resolvido" (AC5), porque inventar identidade a partir de
 *          lixo é pior que admitir que não se sabe (GR-01).
 */
export function normalizeLpUrl(raw: string | null | undefined): LpKey | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // URL relativa ou malformada. Uma segunda tentativa com esquema explícito
    // resolve o caso comum de `dominio.com/pagina` gravado sem protocolo —
    // que é digitação de humano, não dado corrompido.
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  // Só http(s) identifica uma landing page. `tel:`, `mailto:` e deep links de
  // app existem em anúncios e não são páginas — tratá-los como LP colocaria na
  // tabela uma linha que ninguém pode otimizar.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  // `pathname` já vem normalizado pelo construtor de URL ("" nunca ocorre: é
  // no mínimo "/"). A barra final sai para que `/inscricao` e `/inscricao/`
  // sejam a mesma LP — variação de link, não de página.
  const path = parsed.pathname.replace(/\/+$/, "");

  return `${host}${path}`;
}

/**
 * Rótulo exibido na coluna LP. Hoje é a própria chave — mantido como função
 * própria para que mudar a apresentação (encurtar host, destacar o path) não
 * exija mexer na chave de agrupamento, que é o que garante a reconciliação
 * com o Detalhamento (AC6).
 */
export function lpLabel(key: LpKey): string {
  return key;
}
