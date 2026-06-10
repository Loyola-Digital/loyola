const GRAPHQL_ENDPOINT = "https://graphql.switchy.io/v1/graphql";

// ============================================================
// TYPES
// ============================================================

export interface SwitchyFolder {
  id: number;
  name: string;
  order: number;
  type: string;
}

export interface SwitchyLink {
  uniq: number;
  id: string;
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  clicks: number;
  createdDate: string;
  folderId: number | null;
  tags: string[];
  pixels: SwitchyPixel[];
  name: string | null;
  note: string | null;
  image: string | null;
  favicon: string | null;
}

export interface SwitchyPixel {
  id: string;
  title: string;
  value: string;
  platform: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// ============================================================
// CLIENT
// ============================================================

async function graphql<T>(token: string, query: string): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Authorization": token,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Switchy API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(`Switchy GraphQL error: ${json.errors[0].message}`);
  }

  if (!json.data) {
    throw new Error("Switchy GraphQL returned no data");
  }

  return json.data;
}

// ============================================================
// PUBLIC API
// ============================================================

export async function fetchSwitchyFolders(
  token: string,
): Promise<SwitchyFolder[]> {
  const data = await graphql<{ folders: SwitchyFolder[] }>(
    token,
    `{ folders(order_by: { name: asc }) { id name order type } }`,
  );
  return data.folders;
}

export async function fetchSwitchyLinks(
  token: string,
  folderId?: number,
): Promise<SwitchyLink[]> {
  const where = folderId
    ? `(where: { folderId: { _eq: ${folderId} } }, order_by: { clicks: desc })`
    : `(order_by: { clicks: desc }, limit: 100)`;

  const data = await graphql<{ links: SwitchyLink[] }>(
    token,
    `{
      links${where} {
        uniq id domain url title description clicks createdDate
        folderId tags pixels name note image favicon
      }
    }`,
  );
  return data.links;
}

// ============================================================
// REST WRITE CLIENT (Story 33.2)
// ============================================================

const REST_ENDPOINT = "https://api.switchy.io/v1";
const DEFAULT_DOMAIN = "hi.switchy.io";

// ============================================================
// REST TYPES
// ============================================================

export interface BuildTrackedUrlParams {
  baseUrl: string;
  campaign: string; // OBRIGATÓRIO (ex.: "fzl1")
  medium: string; // do preset (ex.: "bio")
  source: string; // do preset (ex.: "ig")
  term?: string; // OPCIONAL (ex.: "cpl")
  content?: string; // OPCIONAL (ex.: "org")
}

export interface SwitchyCreateLinkPixel {
  platform: string; // "facebook" | "gtm" (Meta / GTM)
  value: string; // pixel id / container id
  title: string;
}

export interface SwitchyCreateLinkPayload {
  url: string;
  folderId: number;
  pixels?: SwitchyCreateLinkPixel[];
  showGDPR?: boolean;
  domain?: string; // default DEFAULT_DOMAIN
  tags?: string[];
  note?: string;
}

export interface CreatedSwitchyLink {
  shortUrl: string | null; // url curta retornada (pode vir como url/shortUrl/short)
  switchyLinkId: string | null;
  switchyUniq: number | null;
  raw: unknown; // resposta crua para depuração/persistência
}

// ============================================================
// REST PUBLIC API
// ============================================================

/**
 * Monta a URL de checkout rastreada de forma determinística.
 * Ordem EXATA dos params: utm_campaign, utm_medium, utm_source, utm_term,
 * utm_content, sck, vk_source. `sck` = join dos valores não-vazios de
 * [campaign, medium, source, term, content] por "_". `vk_source` sempre
 * presente e vazio. term/content vazios são omitidos da URL E do sck.
 * Preserva querystring pré-existente da base (? vs &). encodeURIComponent
 * aplicado apenas aos valores.
 */
export function buildTrackedCheckoutUrl(params: BuildTrackedUrlParams): string {
  const { baseUrl, campaign, medium, source } = params;
  const term = (params.term ?? "").trim();
  const content = (params.content ?? "").trim();

  const sck = [campaign, medium, source, term, content]
    .filter((v) => v && v.length > 0)
    .join("_");

  const pairs: string[] = [
    `utm_campaign=${encodeURIComponent(campaign)}`,
    `utm_medium=${encodeURIComponent(medium)}`,
    `utm_source=${encodeURIComponent(source)}`,
  ];

  if (term) {
    pairs.push(`utm_term=${encodeURIComponent(term)}`);
  }
  if (content) {
    pairs.push(`utm_content=${encodeURIComponent(content)}`);
  }

  pairs.push(`sck=${encodeURIComponent(sck)}`);
  pairs.push("vk_source=");

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${pairs.join("&")}`;
}

/**
 * Cria um shortlink no Switchy via REST (POST /links/create).
 * Header de auth reusa o padrão GraphQL (Api-Authorization).
 * Parse defensivo da response: aceita `{ link: {...} }` ou shape flat; não
 * lança por campo ausente (só por erro de rede/HTTP). Normaliza para
 * `{ shortUrl, switchyLinkId, switchyUniq, raw }`.
 */
export async function createSwitchyLink(
  token: string,
  payload: SwitchyCreateLinkPayload,
): Promise<CreatedSwitchyLink> {
  const body = {
    link: {
      url: payload.url,
      domain: payload.domain ?? DEFAULT_DOMAIN,
      folderId: payload.folderId,
      pixels: payload.pixels ?? [],
      showGDPR: payload.showGDPR ?? false,
      ...(payload.tags ? { tags: payload.tags } : {}),
      ...(payload.note ? { note: payload.note } : {}),
    },
    autofill: false,
  };

  const res = await fetch(`${REST_ENDPOINT}/links/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Authorization": token,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Switchy REST error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const link = ((json?.link as Record<string, unknown> | undefined) ??
    json) as Record<string, unknown>;

  const shortUrl =
    (link?.shortUrl as string | undefined) ??
    (link?.short as string | undefined) ??
    (link?.url as string | undefined) ??
    null;
  const switchyLinkId = (link?.id as string | undefined) ?? null;
  const switchyUniq = typeof link?.uniq === "number" ? link.uniq : null;

  if (shortUrl == null && switchyLinkId == null) {
    // Não logar o token; apenas o raw para diagnóstico. A rota chamadora
    // loga em nível mais alto via fastify.log.
    console.warn("[switchy] resposta inesperada de /links/create", json);
  }

  return { shortUrl, switchyLinkId, switchyUniq, raw: json };
}
