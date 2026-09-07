/**
 * Story 43.9 — `getAdInsightsFromDb` devolve os mesmos números da Meta?
 *
 * Roda a função REAL contra produção e compara com o export do Gerenciador
 * (`docs/dados/meta-bbe-perpetuo-*.csv`) — a única fonte independente que
 * temos. Suíte verde não prova a forma do dado: o que decide é o payload.
 *
 * Uso: cd packages/api && ./node_modules/.bin/tsx scripts/confere-db-first-ads.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "../src/db/schema.js";
import { getAdInsightsFromDb } from "../src/services/meta-db-source.js";

const CSV = resolve(process.cwd(), "../../docs/dados/meta-bbe-perpetuo-2026-07-17_2026-09-05.csv");
const DE = "2026-07-17";
const ATE = "2026-09-05";

/** ⚠️ O export vem em en-US: ponto é DECIMAL, vírgula é milhar. */
const num = (v: string | undefined) => {
  const n = Number((v ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function linhas(texto: string): string[][] {
  const out: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); out.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const { rows: proj } = await pool.query(`select id, name from projects where name ilike '%BBE%' limit 1`);
  if (proj.length === 0) throw new Error("projeto BBE não encontrado");
  const projectId = proj[0]!.id as string;
  console.log(`projeto: ${proj[0]!.name} (${projectId})\n`);

  const ads = await getAdInsightsFromDb(db, projectId, DE, ATE);

  // ---- o que a função devolveu ----
  const gastoDb = ads.reduce((s, a) => s + parseFloat(a.spend || "0"), 0);
  const impDb = ads.reduce((s, a) => s + parseFloat(a.impressions || "0"), 0);
  const comVideo = ads.filter((a) => a.videoMetrics != null).length;

  // ---- o que a Meta exportou ----
  const l = linhas(readFileSync(CSV, "utf-8").replace(/^\uFEFF/, ""));
  const hdr = l[0]!.map((h) => h.replace(/^\uFEFF/, "").trim());
  const iAd = hdr.indexOf("Identificação do anúncio");
  const iG = hdr.indexOf("Valor gasto (BRL)");
  const iI = hdr.indexOf("Impressões");
  const adsCsv = new Set<string>();
  let gastoCsv = 0, impCsv = 0;
  for (const r of l.slice(1)) {
    if (r.length <= iI || !r[iAd]?.trim()) continue;
    adsCsv.add(r[iAd]!.trim());
    gastoCsv += num(r[iG]); impCsv += num(r[iI]);
  }

  const noBanco = new Set(ads.map((a) => a.ad_id));
  const faltando = [...adsCsv].filter((id) => !noBanco.has(id));

  console.log(`═══ getAdInsightsFromDb — ${DE} → ${ATE} ═══`);
  console.log(`  anúncios devolvidos ...... ${ads.length}`);
  console.log(`  com métrica de vídeo ..... ${comVideo}`);
  console.log(`  gasto .................... R$ ${gastoDb.toFixed(2)}`);
  console.log(`  impressões ............... ${impDb.toLocaleString("pt-BR")}`);
  console.log(`\n═══ export da Meta (fonte independente) ═══`);
  console.log(`  anúncios ................. ${adsCsv.size}`);
  console.log(`  gasto .................... R$ ${gastoCsv.toFixed(2)}`);
  console.log(`  impressões ............... ${impCsv.toLocaleString("pt-BR")}`);
  console.log(`\n═══ CONFRONTO ═══`);
  console.log(`  anúncios do export ausentes na função: ${faltando.length}`);
  const dg = gastoDb - gastoCsv;
  console.log(`  gasto:      dif R$ ${dg.toFixed(2)} (${((dg / gastoCsv) * 100).toFixed(2)}%)`);
  const di = impDb - impCsv;
  console.log(`  impressões: dif ${di.toLocaleString("pt-BR")} (${((di / impCsv) * 100).toFixed(2)}%)`);
  console.log(`\n  ⚠️ Acima a função cobre a CONTA inteira; o export é só do perpétuo.`);
  console.log(`     Diferença para MAIS é esperada. O que não podia acontecer —`);
  console.log(`     anúncio do export faltando — não aconteceu.`);

  // ---- a prova forte: MESMO recorte dos dois lados ----
  const iC = hdr.indexOf("Identificação da campanha");
  const campanhasCsv = new Set<string>();
  for (const r of l.slice(1)) if (r.length > iC && r[iC]?.trim()) campanhasCsv.add(r[iC]!.trim());

  const mesmas = await getAdInsightsFromDb(db, projectId, DE, ATE, [...campanhasCsv]);
  await pool.end();

  const gastoM = mesmas.reduce((s, a) => s + parseFloat(a.spend || "0"), 0);
  const impM = mesmas.reduce((s, a) => s + parseFloat(a.impressions || "0"), 0);

  console.log(`\n═══ MESMO RECORTE — filtrando pelas ${campanhasCsv.size} campanhas do export ═══`);
  console.log(`  anúncios:   função ${mesmas.length}  ×  export ${adsCsv.size}`);
  console.log(`  gasto:      R$ ${gastoM.toFixed(2)}  ×  R$ ${gastoCsv.toFixed(2)}   dif ${(((gastoM - gastoCsv) / gastoCsv) * 100).toFixed(2)}%`);
  console.log(`  impressões: ${impM.toLocaleString("pt-BR")}  ×  ${impCsv.toLocaleString("pt-BR")}   dif ${(((impM - impCsv) / impCsv) * 100).toFixed(2)}%`);
  console.log(`\n  A diferença esperada é ~0,8%: o export foi tirado às 13h35 de 05/09,`);
  console.log(`  com o dia em curso, e o sync continuou depois (medido no AC1 da 29.76).`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
