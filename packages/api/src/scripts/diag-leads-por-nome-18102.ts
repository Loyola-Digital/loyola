// Story 18.102 — T0 / AC5 / P-2 (SOMENTE LEITURA). Leads por criativo pela regra
// antiga (só ad_id) e pela nova (ad_id + nome único), por etapa.
//
//   cd packages/api && npx tsx src/scripts/diag-leads-por-nome-18102.ts [--dias=30] <stageId> [<stageId> ...]
//   cd packages/api && npx tsx src/scripts/diag-leads-por-nome-18102.ts [--dias=30] --todas      (P-2)
//
// Não escreve nada: SELECT no Postgres + leitura das planilhas.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { chaveDoNomeSeUnico, nomesQueIdentificamUmCriativo } from "@loyola-x/shared";

import * as schema from "../db/schema.js";
import { buscarPlanilhasDeLeads, lerPlanilhasDeLeads } from "../utils/planilhas-de-leads.js";
import { recortarLinhasPelaJanela } from "../utils/janela-das-linhas.js";
import { businessToday } from "../utils/sale-date.js";
import { utmContentEfetivo } from "../utils/utm-value.js";
import {
  chavesDeLeadsPagosPorAnuncio,
  chavesDeLeadsPagosPorNome,
  leadsPagosDoCriativo,
} from "../utils/leads-pagos-por-criativo.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dias = Number(args.find((a) => a.startsWith("--dias="))?.split("=")[1] ?? 30);
  const todas = args.includes("--todas");
  let stageIds = args.filter((a) => !a.startsWith("--"));

  // QA REL-001: somente leitura em TODA conexão do pool (um `SET` valeria só
  // para a conexão que o executasse).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c default_transaction_read_only=on",
  });
  const db = drizzle(pool, { schema });

  function findCol(headers: string[], name: string | undefined): number {
    if (!name) return -1;
    const n = name.trim().toLowerCase();
    return headers.findIndex((h) => h.trim().toLowerCase() === n);
  }

  if (todas) {
    const r = await pool.query(
      `SELECT DISTINCT stage_id::text AS id FROM funnel_spreadsheets WHERE type = 'leads' AND stage_id IS NOT NULL`,
    );
    stageIds = r.rows.map((x) => x.id);
  }

  const hoje = businessToday();
  console.log(`Janela: ${dias} dias até ${hoje}. Etapas: ${stageIds.length}\n`);
  let comNome = 0;

  for (const stageId of stageIds) {
    const st = await pool.query(
      `SELECT s.name, s.stage_type, s.campaigns AS sc, f.name AS funil, f.campaigns AS fc
         FROM funnel_stages s JOIN funnels f ON f.id = s.funnel_id WHERE s.id = $1`,
      [stageId],
    );
    if (!st.rows[0]) { console.log(`${stageId}: etapa não encontrada\n`); continue; }
    const { name, stage_type, sc, funil, fc } = st.rows[0];
    const camps: { id: string }[] = (Array.isArray(sc) && sc.length ? sc : fc) ?? [];
    const campIds = camps.map((c) => String(c.id)).filter(Boolean);

    let unida;
    try {
      const planilhas = await buscarPlanilhasDeLeads(db, stageId);
      if (!planilhas.length) { if (!todas) console.log(`${funil} › ${name}: sem planilha de leads\n`); continue; }
      unida = await lerPlanilhasDeLeads(planilhas);
    } catch (e) {
      console.log(`${funil} › ${name}: falha lendo planilhas — ${(e as Error).message}\n`);
      continue;
    }
    const m = unida.columnMapping;
    const col = {
      utmContent: findCol(unida.headers, m.utm_content),
      utmSource: findCol(unida.headers, m.utm_source),
      email: findCol(unida.headers, m.email),
    };
    const { linhas } = recortarLinhasPelaJanela(unida.rows, findCol(unida.headers, m.date), dias, hoje);

    // Grupos como a rota: anúncios das campanhas da etapa, por ad_name.trim().
    const ads = campIds.length
      ? await pool.query(
          `SELECT DISTINCT ad_id, ad_name FROM meta_ad_insights_daily
            WHERE campaign_id = ANY($1) AND date_start >= to_char(($2::date - ($3::int - 1)), 'YYYY-MM-DD')`,
          [campIds, hoje, dias],
        )
      : { rows: [] as { ad_id: string; ad_name: string }[] };
    const grupos = new Map<string, string[]>();
    for (const a of ads.rows) {
      const nome = (a.ad_name || "").trim() || "(sem nome)";
      grupos.set(nome, [...(grupos.get(nome) ?? []), a.ad_id]);
    }

    const porAnuncio = chavesDeLeadsPagosPorAnuncio(linhas, col);
    const porNome = chavesDeLeadsPagosPorNome(porAnuncio);
    const unicos = nomesQueIdentificamUmCriativo(grupos.keys());
    const conteudos = linhas.map((r) => utmContentEfetivo(r[col.utmContent] ?? "")).filter(Boolean);
    const numericos = conteudos.filter((c) => /^\d+$/.test(c)).length;

    let antes = 0, depois = 0;
    const detalhe: string[] = [];
    for (const [nome, ids] of grupos) {
      const a = leadsPagosDoCriativo(porAnuncio, ids);
      const d = leadsPagosDoCriativo(porAnuncio, ids, { chavesPorNome: porNome, chaveDoNome: chaveDoNomeSeUnico(nome, unicos) });
      antes += a; depois += d;
      if (a !== d || !todas) detalhe.push(`   ${a === d ? " " : "Δ"} ${nome}: ${a} → ${d}`);
    }
    if (depois !== antes) comNome++;
    if (todas && depois === antes) continue;
    console.log(`${funil} › ${name} [${stage_type}] ${stageId}`);
    console.log(`   linhas na janela: ${linhas.length} · content numérico: ${numericos} · content não numérico: ${conteudos.length - numericos} · grupos: ${grupos.size}`);
    console.log(`   TOTAL leads: antes ${antes} → depois ${depois}`);
    console.log(detalhe.join("\n") + "\n");
  }

  if (todas) console.log(`P-2: ${comNome} de ${stageIds.length} etapas mudam com a regra nova.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
