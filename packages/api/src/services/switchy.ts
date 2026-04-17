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
