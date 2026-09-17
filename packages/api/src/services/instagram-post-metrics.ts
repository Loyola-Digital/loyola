/**
 * As métricas de cada post do Instagram, no banco.
 *
 * ## Por que existe
 *
 * A Meta permite 200 chamadas por hora por conta, e os insights vêm de um em
 * um: uma lista de 100 posts custava 100 chamadas. Com a tabela mensal na
 * mesma tela, a conta estourava e a API respondia 429 — foi o que aconteceu em
 * produção em 15/09/2026.
 *
 * O número de um post antigo não muda mais. Guardar é o que torna a tela
 * barata: abrir de novo não custa chamada nenhuma, e a conta volta a caber no
 * orçamento da Meta.
 *
 * ## O que ainda é buscado ao vivo
 *
 * A LISTA de posts (uma chamada) continua vindo da Meta a cada leitura: é ela
 * que traz post novo, legenda editada, thumbnail (a URL expira) e contagem de
 * curtidas e comentários, que mudam sempre. O que fica no banco são os
 * insights — alcance, views, salvamentos, compartilhamentos, seguidores,
 * retenção —, e só deles se paga chamada.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { instagramPostMetrics } from "../db/schema.js";

export interface MetricasDoPost {
  mediaId: string;
  /** Digitado à mão (Reels): a Meta não entrega seguidores por Reels. */
  followsManual: number | null;
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
  follows: number | null;
  skipRate: number | null;
  avgWatchTimeMs: number | null;
  insightsAt: Date | null;
}

const DIA = 86_400_000;

/**
 * Vale gastar uma chamada para (re)buscar os insights deste post?
 *
 * A curva é a da própria plataforma: post novo ainda está sendo entregue e
 * muda de hora em hora; depois de uma semana o movimento é resíduo; passado um
 * mês o número está congelado e perguntar de novo é queimar cota à toa.
 *
 * Nunca buscado (`insightsAt` null) sempre vale, em qualquer idade — é o caso
 * do backfill.
 */
export function precisaBuscarInsights(
  postadoEm: Date,
  insightsEm: Date | null,
  agora = new Date(),
): boolean {
  if (!insightsEm) return true;
  const idadeDoPost = agora.getTime() - postadoEm.getTime();
  const desdeABusca = agora.getTime() - insightsEm.getTime();
  if (idadeDoPost < 2 * DIA) return desdeABusca > 2 * 3_600_000; // 2h
  if (idadeDoPost < 7 * DIA) return desdeABusca > 12 * 3_600_000;
  if (idadeDoPost < 30 * DIA) return desdeABusca > 3 * DIA;
  return false;
}

/**
 * Quem buscar primeiro quando o orçamento de chamadas não cobre todo mundo.
 *
 * Nunca buscado vem antes de reatualização — uma linha vazia é um "—" na tela;
 * uma linha velha é um número um pouco defasado. Entre iguais, o post mais
 * novo primeiro: é o que a pessoa está olhando.
 */
export function ordemDeBusca<T extends { postadoEm: Date; insightsEm: Date | null }>(
  candidatos: T[],
): T[] {
  return [...candidatos].sort((a, b) => {
    if (!a.insightsEm && b.insightsEm) return -1;
    if (a.insightsEm && !b.insightsEm) return 1;
    return b.postadoEm.getTime() - a.postadoEm.getTime();
  });
}

const num = (v: string | number | null) => (v == null ? null : Number(v));

export async function lerMetricas(
  db: Database,
  accountId: string,
  mediaIds: string[],
): Promise<Map<string, MetricasDoPost>> {
  if (mediaIds.length === 0) return new Map();
  const linhas = await db
    .select()
    .from(instagramPostMetrics)
    .where(
      and(
        eq(instagramPostMetrics.accountId, accountId),
        inArray(instagramPostMetrics.mediaId, mediaIds),
      ),
    );
  return new Map(
    linhas.map((l) => [
      l.mediaId,
      {
        mediaId: l.mediaId,
        reach: l.reach,
        views: l.views,
        saved: l.saved,
        shares: l.shares,
        follows: l.follows,
        followsManual: l.followsManual,
        skipRate: num(l.skipRate),
        avgWatchTimeMs: l.avgWatchTimeMs,
        insightsAt: l.insightsAt,
      },
    ]),
  );
}

export interface LinhaParaGravar {
  mediaId: string;
  postedAt: Date;
  mediaType?: string | null;
  mediaProductType?: string | null;
  caption?: string | null;
  permalink?: string | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  reach?: number | null;
  views?: number | null;
  saved?: number | null;
  shares?: number | null;
  follows?: number | null;
  skipRate?: number | null;
  avgWatchTimeMs?: number | null;
  /** Null quando a linha entra só com o que a lista deu, sem insights. */
  insightsAt: Date | null;
}

/** Grava (ou atualiza) as linhas. Um post por vez seria uma ida ao banco por post. */
export async function salvarMetricas(
  db: Database,
  accountId: string,
  linhas: LinhaParaGravar[],
): Promise<void> {
  if (linhas.length === 0) return;
  const agora = new Date();
  await db
    .insert(instagramPostMetrics)
    .values(
      linhas.map((l) => ({
        accountId,
        mediaId: l.mediaId,
        postedAt: l.postedAt,
        mediaType: l.mediaType ?? null,
        mediaProductType: l.mediaProductType ?? null,
        caption: l.caption ?? null,
        permalink: l.permalink ?? null,
        likeCount: l.likeCount ?? null,
        commentsCount: l.commentsCount ?? null,
        reach: l.reach ?? null,
        views: l.views ?? null,
        saved: l.saved ?? null,
        shares: l.shares ?? null,
        follows: l.follows ?? null,
        skipRate: l.skipRate == null ? null : String(l.skipRate),
        avgWatchTimeMs: l.avgWatchTimeMs ?? null,
        insightsAt: l.insightsAt,
        updatedAt: agora,
      })),
    )
    .onConflictDoUpdate({
      target: [instagramPostMetrics.accountId, instagramPostMetrics.mediaId],
      set: {
        caption: sqlExcluded("caption"),
        permalink: sqlExcluded("permalink"),
        likeCount: sqlExcluded("like_count"),
        commentsCount: sqlExcluded("comments_count"),
        mediaType: sqlExcluded("media_type"),
        mediaProductType: sqlExcluded("media_product_type"),
        reach: sqlExcluded("reach"),
        views: sqlExcluded("views"),
        saved: sqlExcluded("saved"),
        shares: sqlExcluded("shares"),
        follows: sqlExcluded("follows"),
        skipRate: sqlExcluded("skip_rate"),
        avgWatchTimeMs: sqlExcluded("avg_watch_time_ms"),
        insightsAt: sqlExcluded("insights_at"),
        updatedAt: agora,
      },
    });
}

/**
 * Grava (ou apaga) os seguidores digitados à mão de um post.
 *
 * Só ATUALIZA: a linha do post já existe — ela nasce na primeira leitura da
 * lista. Se não existir, quem chama recebe `false` e mostra o erro, em vez de
 * criar uma linha órfã sem data de publicação.
 */
export async function salvarSeguidoresManuais(
  db: Database,
  accountId: string,
  mediaId: string,
  seguidores: number | null,
  usuarioId: string | null,
): Promise<boolean> {
  const r = await db
    .update(instagramPostMetrics)
    .set({
      followsManual: seguidores,
      followsManualBy: seguidores === null ? null : usuarioId,
      followsManualAt: seguidores === null ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(instagramPostMetrics.accountId, accountId),
        eq(instagramPostMetrics.mediaId, mediaId),
      ),
    )
    .returning({ mediaId: instagramPostMetrics.mediaId });
  return r.length > 0;
}

// `excluded` é a linha que o INSERT tentou gravar — o jeito do Postgres de
// dizer "use o valor novo" sem repetir o objeto inteiro no set.
function sqlExcluded(coluna: string) {
  return sql.raw(`excluded.${coluna}`);
}

/**
 * A lista de posts montada a partir do banco.
 *
 * Usada quando a Meta recusa por cota: a tabela guarda legenda, permalink,
 * formato, data e todas as métricas da última leitura. O que não sobrevive é a
 * thumbnail — a URL da Meta expira em horas —, então a tela mostra o quadrado
 * cinza no lugar da imagem e o resto funciona.
 */
export async function postsDoBanco(
  db: Database,
  accountId: string,
  limite: number,
): Promise<
  {
    id: string;
    caption?: string;
    media_type: string;
    media_product_type?: string;
    permalink?: string;
    timestamp: string;
    like_count?: number;
    comments_count?: number;
    reach: number | null;
    views: number | null;
    saved: number | null;
    shares: number | null;
    follows: number | null;
    skip_rate: number | null;
    avg_watch_time_ms: number | null;
    engagement_rate: number | null;
    follows_fonte: "meta" | "manual" | null;
  }[]
> {
  const linhas = await db
    .select()
    .from(instagramPostMetrics)
    .where(eq(instagramPostMetrics.accountId, accountId))
    .orderBy(desc(instagramPostMetrics.postedAt))
    .limit(limite);

  return linhas.map((l) => {
    const follows = l.follows ?? l.followsManual ?? null;
    const inter =
      (l.likeCount ?? 0) + (l.commentsCount ?? 0) + (l.saved ?? 0) + (l.shares ?? 0);
    return {
      id: l.mediaId,
      caption: l.caption ?? undefined,
      // O tipo é obrigatório na lista; sem ele no banco, IMAGE é o palpite
       // seguro (vira "Estático" na tela, não Reels).
      media_type: l.mediaType ?? "IMAGE",
      media_product_type: l.mediaProductType ?? undefined,
      permalink: l.permalink ?? undefined,
      timestamp: l.postedAt.toISOString(),
      like_count: l.likeCount ?? undefined,
      comments_count: l.commentsCount ?? undefined,
      reach: l.reach,
      views: l.views,
      saved: l.saved,
      shares: l.shares,
      follows,
      skip_rate: l.skipRate == null ? null : Number(l.skipRate),
      avg_watch_time_ms: l.avgWatchTimeMs,
      engagement_rate: l.reach && l.reach > 0 ? (inter / l.reach) * 100 : null,
      follows_fonte: l.follows != null ? "meta" : l.followsManual != null ? "manual" : null,
    };
  });
}
