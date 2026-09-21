/**
 * Backfill da tabela mensal do Instagram: os 24 meses que a Meta guarda.
 *
 * Usa o PRÓPRIO serviço (`getAccountInsights`) para gravar exatamente na chave
 * de cache que a tela lê — um script com fetch próprio gravaria numa chave
 * parecida que ninguém consulta.
 *
 * Pula o mês já completo. Refaz o que foi gravado pela metade antes da
 * correção de 21/09/2026 (mês com só o alcance, que a tela mostrava zerado).
 * Para a conta no primeiro mês que não fechar — quase sempre cota (200
 * chamadas/hora, ~10 por mês): é só rodar de novo depois de uma hora.
 *
 * Uso:
 *   npx tsx src/scripts/backfill-instagram-mensal.ts [--conta=<username>] [--meses=24]
 */

import "dotenv/config";
import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../db/schema.js";
import { instagramAccounts, instagramMetricsCache } from "../db/schema.js";
import instagramServicePlugin from "../services/instagram.js";
import {
  MESES_NO_MAXIMO,
  METRICAS_DO_MENSAL,
  janelasMensais,
} from "../services/instagram-mensal.js";

/** O que a linha do mês precisa para não sair zerada. */
const ESSENCIAIS = ["reach", "reach_total", "views", "follows_and_unfollows", "likes"];
/** Gravado depois disto, o serviço só guarda "para sempre" o que veio inteiro. */
const CORRECAO = new Date("2026-09-21T00:00:00Z");
const UM_ANO_MS = 365 * 86_400_000;

const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

async function main() {
  const soConta = arg("conta");
  const quantos = Math.min(Number(arg("meses") ?? MESES_NO_MAXIMO), MESES_NO_MAXIMO);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const app = Fastify({ logger: false });
  app.decorate("db", db as never);
  await app.register(instagramServicePlugin);
  await app.ready();

  // Mesma chave que `getAccountInsights` monta para o subconjunto do mensal.
  const chave = `account_insights_v6_${[...METRICAS_DO_MENSAL].sort().join("-")}`.slice(0, 50);
  const dia = (d: Date) => d.toISOString().split("T")[0]!;
  const agora = Date.now();

  for (const conta of await db.select().from(instagramAccounts)) {
    const nome = conta.instagramUsername ?? conta.accountName ?? conta.id;
    if (soConta && !nome.toLowerCase().includes(soConta.toLowerCase())) continue;

    const janelas = janelasMensais(quantos, new Date());
    // O mês corrente não fecha — a tela o busca ao vivo.
    const fechadas = janelas.filter((j) => j.fim.getTime() < agora - 2 * 86_400_000);
    let feitos = 0;
    let pulados = 0;

    for (const j of fechadas) {
      const onde = and(
        eq(instagramMetricsCache.accountId, conta.id),
        eq(instagramMetricsCache.metricType, chave),
        eq(instagramMetricsCache.periodStart, dia(j.inicio)),
        eq(instagramMetricsCache.periodEnd, dia(j.fim)),
      );
      const [linha] = await db.select().from(instagramMetricsCache).where(onde).limit(1);
      const nomes = new Set(((linha?.metricData ?? []) as { name: string }[]).map((e) => e.name));
      const guardadoParaSempre = linha && linha.expiresAt.getTime() - agora > UM_ANO_MS;
      const completo =
        guardadoParaSempre &&
        (linha.fetchedAt >= CORRECAO || ESSENCIAIS.every((n) => nomes.has(n)));
      if (completo) {
        pulados += 1;
        continue;
      }

      // Vence a linha velha em vez de apagá-la: vencida, o serviço chama a Meta;
      // e se a cota acabar no meio, ele ainda completa com ela. Apagada, o mês
      // sumia da tela até a próxima rodada.
      if (linha) {
        await db.update(instagramMetricsCache).set({ expiresAt: new Date(0) }).where(onde);
      }
      const entradas = await app.instagramService.getAccountInsights(
        conta.id,
        "day",
        Math.floor(j.inicio.getTime() / 1000),
        Math.floor(j.fim.getTime() / 1000),
        METRICAS_DO_MENSAL,
      );
      const [nova] = await db.select().from(instagramMetricsCache).where(onde).limit(1);
      const fechou = nova && nova.expiresAt.getTime() - agora > UM_ANO_MS;
      console.log(
        `${nome} ${j.mes}: ${fechou ? "ok" : "INCOMPLETO"} (${entradas.map((e) => e.name).join(", ") || "nada"})`,
      );
      if (!fechou) {
        // Quase sempre cota. Seguir só queimaria chamadas que voltam 429.
        console.log(`${nome}: parado em ${j.mes} — rode de novo daqui a uma hora.`);
        break;
      }
      feitos += 1;
    }
    console.log(`${nome}: ${feitos} meses buscados, ${pulados} já estavam completos.`);
  }

  await app.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
