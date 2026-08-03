/**
 * Spy de Conteúdo — coleta do perfil via Apify (`apify/instagram-scraper`).
 *
 * Dois runs em paralelo: detalhes do perfil e o feed de posts (Reels vêm junto
 * dos posts, com productType "clips"). Portado de `src/scraper.js` do CLI.
 *
 * Só perfis PÚBLICOS. Privado, inexistente ou bloqueado falha aqui — o erro
 * sobe pro worker e vira `status: failed` com a mensagem no card.
 */

import { ApifyClient } from "apify-client";
import type { ScanPost, ScanProfile, ScrapeResult } from "./types.js";

const DEFAULT_ACTOR = "apify/instagram-scraper";

/** Normaliza @user, URL completa ou user cru para o handle limpo. */
export function normalizeUsername(input: string): string {
  let value = String(input || "").trim();
  value = value.replace(/^@/, "");
  const urlMatch = value.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(value)) {
    throw new Error(`Usuário inválido: "${input}"`);
  }
  return value.toLowerCase();
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

function isErrorItem(item: unknown): boolean {
  const it = item as { error?: unknown; errorDescription?: unknown } | null;
  return Boolean(it && (it.error || it.errorDescription));
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface RunActorResult {
  items: Record<string, unknown>[];
  runId: string;
}

async function runActor(
  client: ApifyClient,
  actor: string,
  input: Record<string, unknown>,
  label: string,
): Promise<RunActorResult> {
  const run = await client.actor(actor).call(input);
  if (run.status !== "SUCCEEDED") {
    throw new Error(
      `Run da Apify (${label}) terminou com status ${run.status}. ` +
        `Veja https://console.apify.com/actors/runs/${run.id}`,
    );
  }
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { items: items as Record<string, unknown>[], runId: run.id };
}

export async function scrapeProfile(
  username: string,
  options: {
    token: string;
    actor?: string;
    limit?: number;
    since?: string | null;
    onProgress?: (msg: string) => void;
  },
): Promise<ScrapeResult> {
  const { token, actor = DEFAULT_ACTOR, limit = 120, since = null, onProgress = () => {} } = options;
  const client = new ApifyClient({ token });
  const url = profileUrl(username);

  const detailsInput: Record<string, unknown> = {
    directUrls: [url],
    resultsType: "details",
    resultsLimit: 1,
    addParentData: false,
  };
  const postsInput: Record<string, unknown> = {
    directUrls: [url],
    resultsType: "posts",
    resultsLimit: limit,
    addParentData: false,
  };
  if (since) postsInput.onlyPostsNewerThan = since;

  onProgress(`Disparando 2 runs na Apify (${actor})...`);

  const [details, posts] = await Promise.all([
    runActor(client, actor, detailsInput, "details"),
    runActor(client, actor, postsInput, "posts"),
  ]);

  const detailErrors = details.items.filter(isErrorItem);
  const profileRaw = details.items.find((item) => !isErrorItem(item) && item.username);

  if (!profileRaw) {
    const first = detailErrors[0] as { errorDescription?: string; error?: string } | undefined;
    const reason = first?.errorDescription || first?.error || "sem itens";
    throw new Error(
      `Não consegui ler o perfil @${username} (${reason}). ` +
        "Perfis privados, inexistentes ou bloqueados não são acessíveis.",
    );
  }

  const rawPosts = posts.items.filter((item) => !isErrorItem(item) && item.shortCode);
  const postErrors = posts.items.filter(isErrorItem);

  onProgress(
    `Perfil ok. ${rawPosts.length} publicações coletadas` +
      (postErrors.length ? ` (${postErrors.length} itens com erro ignorados)` : "") +
      ".",
  );

  return {
    scrapedAt: new Date().toISOString(),
    username,
    profile: cleanProfile(profileRaw),
    posts: rawPosts
      .map(cleanPost)
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || ""))),
    runs: { details: details.runId, posts: posts.runId },
  };
}

function cleanProfile(p: Record<string, unknown>): ScanProfile {
  const username = String(p.username);
  return {
    username,
    fullName: (p.fullName as string) ?? null,
    biography: (p.biography as string) ?? "",
    followersCount: num(p.followersCount),
    followsCount: num(p.followsCount),
    postsCount: num(p.postsCount),
    verified: Boolean(p.verified),
    isBusinessAccount: Boolean(p.isBusinessAccount),
    businessCategoryName: (p.businessCategoryName as string) ?? null,
    externalUrl: (p.externalUrl as string) ?? null,
    profilePicUrl: (p.profilePicUrlHD as string) || (p.profilePicUrl as string) || null,
    url: (p.url as string) || profileUrl(username),
  };
}

function cleanPost(p: Record<string, unknown>): ScanPost {
  const likes = num(p.likesCount);
  const comments = num(p.commentsCount);
  const isReel = p.productType === "clips" || (p.type === "Video" && Boolean(p.videoDuration));

  return {
    id: (p.id as string) ?? (p.shortCode as string),
    shortCode: p.shortCode as string,
    url: (p.url as string) || `https://www.instagram.com/p/${p.shortCode}/`,
    type: (p.type as string) ?? null,
    productType: (p.productType as string) ?? null,
    formato: isReel ? "Reel" : p.type === "Sidecar" ? "Carrossel" : "Imagem",
    caption: (p.caption as string) ?? "",
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h) => String(h).toLowerCase()) : [],
    mentions: Array.isArray(p.mentions) ? (p.mentions as string[]) : [],
    // -1 = contagem oculta pelo Instagram. Tratamos como desconhecido (null),
    // não zero — senão as médias despencam sem motivo.
    likesCount: likes >= 0 ? likes : null,
    commentsCount: comments >= 0 ? comments : null,
    videoViewCount: pickViews(p),
    videoDuration: (p.videoDuration as number) ?? null,
    timestamp: (p.timestamp as string) ?? null,
    displayUrl: (p.displayUrl as string) ?? null,
    isSponsored: Boolean(p.isSponsored),
    childrenCount: Array.isArray(p.childPosts) ? p.childPosts.length : null,
    musicTitle: (p.musicInfo as { song_name?: string } | undefined)?.song_name ?? null,
  };
}

function pickViews(p: Record<string, unknown>): number | null {
  for (const c of [p.videoPlayCount, p.videoViewCount]) {
    const n = num(c);
    if (n > 0) return n;
  }
  return null;
}
