// Story 44.12 — DIAGNÓSTICO (somente leitura). Levanta quais etapas em cache
// estão sem data resolvida e QUAL coluna carrega a data em cada planilha.
//   tsx src/scripts/diag-cobertura-colunas.ts
//
// Não escreve nada. A escrita do `column_mapping` é decisão à parte.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";
import { resolveLeadSource } from "../services/lead-origin-sync.js";
import { readSheetData } from "../services/google-sheets.js";

const ALIASES_DATE = ["data", "date", "timestamp", "carimbodedatahora", "carimbodedata", "datadecadastro", "datahora", "createdat"];

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findColIdx(headers: string[], aliases: string[]): number {
  const H = headers.map(norm);
  for (const a of aliases) {
    const i = H.indexOf(norm(a));
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const na = norm(a);
    const i = H.findIndex((h) => h.includes(na));
    if (i >= 0) return i;
  }
  return -1;
}
function toIsoDate(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const cache = await pool.query(
    `SELECT c.key AS stage_id, c.payload, c.computed_at,
            s.name AS stage_name, s.stage_type,
            f.name AS funnel_name, p.name AS project_name
       FROM public_metrics_cache c
       LEFT JOIN funnel_stages s ON s.id::text = c.key
       LEFT JOIN funnels f ON f.id = s.funnel_id
       LEFT JOIN projects p ON p.id = f.project_id
      WHERE c.scope = 'leads-origin'
      ORDER BY p.name, f.name, s.name`,
  );
  console.log(`=== ${cache.rows.length} etapas com cache scope='leads-origin' ===\n`);

  for (const r of cache.rows) {
    const p = r.payload ?? {};
    const dias = Array.isArray(p.coberturaDiaria) ? p.coberturaDiaria.length : "(campo ausente)";
    const semData = p.leadsSemData ?? "(campo ausente)";
    const temData = Array.isArray(p.coberturaDiaria) && p.coberturaDiaria.length > 0;
    console.log(`${temData ? "✅" : "❌"} ${r.project_name} / ${r.funnel_name} / ${r.stage_name}  [${r.stage_type}]`);
    console.log(`   stage=${r.stage_id} | dias=${dias} leadsSemData=${semData} range=${JSON.stringify(p.range)} totalLeads=${p.totalLeads}`);
    if (temData) { console.log(""); continue; }

    let source;
    try {
      source = await resolveLeadSource(db, r.stage_id);
    } catch (e) {
      console.log(`   ⚠️ resolveLeadSource falhou: ${(e as Error).message}\n`);
      continue;
    }
    if (!source) { console.log("   ⚠️ sem fonte resolvível\n"); continue; }
    console.log(`   fonte: kind=${source.kind} (${source.sheets.length} planilha(s))`);

    for (const ref of source.sheets) {
      console.log(`   ── ${ref.label} | sheet="${ref.sheetName}" | ss=${ref.spreadsheetId}`);
      console.log(`      columnMapping visto pelo sync: ${JSON.stringify(ref.columnMapping)}`);

      // O mapping REAL na tabela de origem (o sync pode não estar lendo).
      const survey = await pool.query(
        `SELECT id, column_mapping FROM funnel_surveys WHERE spreadsheet_id=$1 AND sheet_name=$2 LIMIT 1`,
        [ref.spreadsheetId, ref.sheetName],
      );
      if (survey.rows[0]) {
        console.log(`      funnel_surveys.id=${survey.rows[0].id} column_mapping=${JSON.stringify(survey.rows[0].column_mapping)}`);
      }
      const fsp = await pool.query(
        `SELECT id, type, column_mapping FROM funnel_spreadsheets WHERE spreadsheet_id=$1 AND sheet_name=$2 LIMIT 1`,
        [ref.spreadsheetId, ref.sheetName],
      );
      if (fsp.rows[0]) {
        console.log(`      funnel_spreadsheets.id=${fsp.rows[0].id} type=${fsp.rows[0].type} column_mapping=${JSON.stringify(fsp.rows[0].column_mapping)}`);
      }

      let sheet;
      try {
        sheet = await readSheetData(ref.spreadsheetId, ref.sheetName);
      } catch (e) {
        console.log(`      ⚠️ planilha ilegível: ${(e as Error).message}`);
        continue;
      }
      console.log(`      headers(${sheet.headers.length}): ${JSON.stringify(sheet.headers.slice(0, 12))}`);
      const byAlias = findColIdx(sheet.headers, ALIASES_DATE);
      console.log(`      ALIASES.date resolve? ${byAlias >= 0 ? `SIM (idx ${byAlias} = "${sheet.headers[byAlias]}")` : "NÃO"}`);

      // Evidência por coluna: quantas das primeiras 200 linhas parseiam como data.
      const amostra = sheet.rows;
      const largura = Math.max(sheet.headers.length, ...amostra.map((x) => x.length), 0);
      const candidatos: { idx: number; header: string; hits: number; exemplo: string; iso: string }[] = [];
      for (let i = 0; i < largura; i++) {
        let hits = 0;
        let exemplo = "";
        let iso = "";
        for (const row of amostra) {
          const v = (row[i] ?? "").trim();
          const d = toIsoDate(v);
          if (d) { hits++; if (!exemplo) { exemplo = v; iso = d; } }
        }
        if (hits > 0) candidatos.push({ idx: i, header: sheet.headers[i] ?? "(vazio)", hits, exemplo, iso });
      }
      candidatos.sort((a, b) => b.hits - a.hits);
      if (candidatos.length === 0) {
        console.log(`      ⚠️ NENHUMA coluna com data parseável nas ${amostra.length} primeiras linhas`);
      } else {
        console.log(`      colunas com data parseável (de ${amostra.length} linhas):`);
        for (const c of candidatos.slice(0, 5)) {
          console.log(`        idx ${c.idx} header="${c.header}" → ${c.hits}/${amostra.length} · ex "${c.exemplo}" → ${c.iso}`);
        }
      }
    }
    console.log("");
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
