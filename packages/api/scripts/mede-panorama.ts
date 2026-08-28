/**
 * Story 44.20 (T-8 / AC7) — mede o panorama contra PRODUÇÃO.
 *
 * Existe porque a AC7 manda MEDIR o custo da composição (N chamadas a
 * `montarPayloadCadeiaCac`, uma por etapa) em vez de escondê-lo atrás de cache,
 * e porque suíte verde não prova a forma do dado: os números da tabela "Dados de
 * produção" da story só valem se saírem da implementação.
 *
 * Uso (precisa do `.env` da API com DATABASE_URL):
 *
 *     cd packages/api && ./node_modules/.bin/tsx scripts/mede-panorama.ts [YYYY-MM-DD]
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import { montarPanoramaDoProjeto } from "../src/services/panorama-do-projeto.js";
import { montarPayloadCadeiaCac, resolverEtapaDoProjeto } from "../src/services/cadeia-cac-payload.js";

const TO = process.argv[2] ?? "2026-08-27";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: false });
  const db = drizzle(pool, { schema });
  const config = { SALES_PUBLIC_MAX_AGE_SEC: 86_400 };

  const projetos = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects);

  for (const p of projetos) {
    const t0 = Date.now();
    const panorama = await montarPanoramaDoProjeto(db, config, p.id, {
      to: TO,
      janelaCurtaDias: 7,
      janelaLongaDias: 30,
    });
    const ms = Date.now() - t0;
    if (!panorama) continue;
    const campanhas = panorama.etapas.reduce((s, e) => s + e.campanhas.length, 0);
    console.log(
      `\n=== ${p.name} — ${ms} ms · ${panorama.etapas.length} etapas · ${campanhas} campanhas vinculadas`,
    );
    for (const e of panorama.etapas) {
      const g = e.gargalo;
      console.log(
        `  ${e.stageName.padEnd(24)} fam=${String(e.familia).padEnd(9)} curta=${e.spendCurta
          .toFixed(2)
          .padStart(10)} longa=${e.spendLonga.toFixed(2).padStart(10)} noAr=${e.noAr ? "S" : "n"}` +
          (g ? ` gargalo=${g.metrica} ${g.atual?.toFixed(4)} vs ${g.teto?.toFixed(4)}` : " gargalo=—"),
      );
    }
    if (panorama.campanhasOrfas.length) {
      console.log(
        `  ÓRFÃS: ${panorama.campanhasOrfas.map((o) => `${o.campaignName ?? o.campaignId}=${o.spendCurta}`).join(" · ")}`,
      );
    }
    console.log(
      `  pendências: ${panorama.pendencias.map((x) => `${x.codigo}(${x.origem})`).join(", ") || "—"}`,
    );
    console.log(`  totais: ${JSON.stringify(panorama.totais)}`);

    /**
     * DoD: `spendLonga` tem de bater AO CENTAVO com `agregado.spend` do payload
     * da cadeia na mesma etapa e janela. É a prova de que o imposto não foi
     * reaplicado — divergência aqui significa duas réguas de gross-up.
     */
    for (const e of panorama.etapas) {
      if (e.spendLonga === 0) continue;
      const stage = await resolverEtapaDoProjeto(db, p.id, e.stageId);
      if (!stage) continue;
      const cadeia = await montarPayloadCadeiaCac(db, config, stage, {
        projectId: p.id,
        stageId: e.stageId,
        from: panorama.janelas.longa.from,
        to: panorama.janelas.longa.to,
      });
      const agregado = cadeia.agregado as { spend: number } | undefined;
      if (!agregado) continue;
      const delta = Math.abs(e.spendLonga - agregado.spend);
      console.log(
        `  [spend] ${e.stageName.padEnd(24)} panorama=${e.spendLonga.toFixed(2)} cadeia=${agregado.spend.toFixed(2)} delta=${delta.toFixed(4)} ${delta <= 0.01 ? "OK" : "DIVERGE"}`,
      );
    }
  }

  await pool.end();
}

void main();
