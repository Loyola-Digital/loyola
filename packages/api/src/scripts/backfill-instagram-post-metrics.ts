/**
 * Backfill das métricas de post do Instagram.
 *
 * Enche `instagram_post_metrics` com o histórico de cada conta, respeitando a
 * cota da Meta (200 chamadas por hora por conta). Depois disso o dashboard
 * abre lendo do banco, sem gastar chamada — que era a causa dos 429 de
 * 15/09/2026.
 *
 * Uso:
 *   npx tsx src/scripts/backfill-instagram-post-metrics.ts [--posts=200] [--chamadas=150] [--conta=<username>]
 *
 * Roda de novo quando quiser: posts que já têm insights recentes são pulados
 * (`precisaBuscarInsights`), então repetir não custa cota.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../db/schema.js";
import { instagramAccounts } from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import {
  lerMetricas,
  ordemDeBusca,
  precisaBuscarInsights,
  salvarMetricas,
  type LinhaParaGravar,
} from "../services/instagram-post-metrics.js";

const G = "https://graph.instagram.com/v25.0";
const EM_PARALELO = 3;

interface PostDaLista {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface Entrada {
  name: string;
  total_value?: { value?: unknown };
  values?: { value?: unknown }[];
}

function valor(entries: Entrada[], nome: string): number | null {
  const e = entries.find((x) => x.name === nome);
  if (!e) return null;
  if (typeof e.total_value?.value === "number") return e.total_value.value;
  const vs = (e.values ?? []).filter((v) => typeof v.value === "number");
  return vs.length ? vs.reduce((a, v) => a + (v.value as number), 0) : null;
}

const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

async function main() {
  const maxPosts = Number(arg("posts") ?? 200);
  const maxChamadas = Number(arg("chamadas") ?? 150);
  const soConta = arg("conta");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const contas = await db.select().from(instagramAccounts);

  for (const conta of contas) {
    const nome = conta.instagramUsername ?? conta.accountName ?? conta.id;
    if (soConta && !nome.toLowerCase().includes(soConta.toLowerCase())) continue;
    const token = decrypt(conta.accessTokenEncrypted, conta.accessTokenIv);
    let chamadas = 0;
    const posts: PostDaLista[] = [];
    let url =
      `${G}/${conta.instagramUserId}/media` +
      `?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count` +
      `&limit=100&access_token=${token}`;
    // Páginas da lista: cada uma é UMA chamada e traz 100 posts.
    while (url && posts.length < maxPosts) {
      const r = (await (await fetch(url)).json()) as {
        data?: PostDaLista[];
        paging?: { next?: string };
        error?: { message: string };
      };
      chamadas++;
      if (r.error) {
        console.log(`@${nome}: ${r.error.message}`);
        break;
      }
      posts.push(...(r.data ?? []));
      url = r.paging?.next ?? "";
    }

    const guardadas = await lerMetricas(db, conta.id, posts.map((p) => p.id));
    const aBuscar = ordemDeBusca(
      posts
        .map((post) => ({
          post,
          postadoEm: new Date(post.timestamp),
          insightsEm: guardadas.get(post.id)?.insightsAt ?? null,
        }))
        .filter((c) => precisaBuscarInsights(c.postadoEm, c.insightsEm)),
    ).slice(0, Math.max(0, maxChamadas - chamadas));

    console.log(
      `@${nome}: ${posts.length} posts na lista, ${guardadas.size} já no banco, buscando ${aBuscar.length}`,
    );

    const buscados = new Map<string, { entries: Entrada[]; em: Date }>();
    let cota = false;
    for (let i = 0; i < aBuscar.length && !cota; i += EM_PARALELO) {
      const bloco = aBuscar.slice(i, i + EM_PARALELO);
      await Promise.all(
        bloco.map(async (c) => {
          const metrics =
            c.post.media_type === "VIDEO" || c.post.media_type === "REEL"
              ? "reach,views,likes,comments,saved,shares,ig_reels_avg_watch_time,reels_skip_rate"
              : "reach,views,likes,comments,saved,shares,follows";
          const r = (await (
            await fetch(`${G}/${c.post.id}/insights?metric=${metrics}&access_token=${token}`)
          ).json()) as { data?: Entrada[]; error?: { message: string; code?: number } };
          chamadas++;
          if (r.error) {
            // Código 4/32 = cota da Meta. Parar: insistir só prolonga o bloqueio.
            if (r.error.code === 4 || r.error.code === 32) {
              cota = true;
              console.log(`  cota da Meta atingida em ${chamadas} chamadas — parando`);
            }
            return;
          }
          buscados.set(c.post.id, { entries: r.data ?? [], em: new Date() });
        }),
      );
      // Um respiro entre blocos: a Meta pune rajada mais que volume.
      await new Promise((r) => setTimeout(r, 400));
    }

    const linhas: LinhaParaGravar[] = posts.map((p) => {
      const novo = buscados.get(p.id);
      const antigo = guardadas.get(p.id);
      const e = novo?.entries;
      return {
        mediaId: p.id,
        postedAt: new Date(p.timestamp),
        mediaType: p.media_type ?? null,
        mediaProductType: p.media_product_type ?? null,
        caption: p.caption ?? null,
        permalink: p.permalink ?? null,
        likeCount: p.like_count ?? null,
        commentsCount: p.comments_count ?? null,
        reach: e ? valor(e, "reach") : (antigo?.reach ?? null),
        views: e ? valor(e, "views") : (antigo?.views ?? null),
        saved: e ? valor(e, "saved") : (antigo?.saved ?? null),
        shares: e ? valor(e, "shares") : (antigo?.shares ?? null),
        follows: e ? valor(e, "follows") : (antigo?.follows ?? null),
        skipRate: e ? valor(e, "reels_skip_rate") : (antigo?.skipRate ?? null),
        avgWatchTimeMs: e ? valor(e, "ig_reels_avg_watch_time") : (antigo?.avgWatchTimeMs ?? null),
        insightsAt: novo?.em ?? antigo?.insightsAt ?? null,
      };
    });
    await salvarMetricas(db, conta.id, linhas);
    console.log(
      `  gravados ${linhas.length} posts (${buscados.size} com insights novos) em ${chamadas} chamadas`,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
