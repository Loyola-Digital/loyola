/**
 * Story 44.3 AC7 — cobertura de atribuição venda/lead → campanha, nos 5 projetos.
 *
 * É o insumo do Bloqueio B1 (AUDITORIA-ABA-CAC.md): decidir o que fazer com a
 * Conv. Checkout por campanha sem este número seria adivinhação.
 *
 * Uso: npx tsx src/scripts/medir-cobertura-atribuicao.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });
import pg from "pg";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRevenueBucket } from "../services/sales-status.js";

const ehAdId = (s: string | null) => (s && /^\d{5,}$/.test(s.trim()) ? s.trim() : null);

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const etapas = await c.query(`
    SELECT s.id, s.name AS etapa, s.stage_type, p.name AS projeto, p.id AS project_id
    FROM funnel_stages s
    JOIN funnels f ON f.id = s.funnel_id
    JOIN projects p ON p.id = f.project_id
    WHERE s.stage_type IN ('paid','sales','event_capture','event','free','cpl')
      AND EXISTS (SELECT 1 FROM stage_sales_spreadsheets ss WHERE ss.stage_id = s.id)
    ORDER BY p.name, s.name`);

  console.log(`etapas com planilha de venda: ${etapas.rows.length}\n`);
  console.log("projeto        | etapa                     | tipo          | vendas | c/ utm | cobertura | naoResolv");

  for (const e of etapas.rows) {
    const sheets = await c.query(
      `SELECT spreadsheet_id, sheet_name, column_mapping FROM stage_sales_spreadsheets WHERE stage_id=$1`,
      [e.id],
    );
    let total = 0, comUtm = 0, naoResolv = 0;
    const adIds = new Set<string>();
    const linhas: { ad: string | null }[] = [];

    for (const sp of sheets.rows) {
      const m = sp.column_mapping ?? {};
      if (!m.email) continue;
      let d;
      try { d = await readSheetData(sp.spreadsheet_id, sp.sheet_name); } catch { continue; }
      const iEmail = d.headers.indexOf(m.email);
      const iUtm = m.utm_content ? d.headers.indexOf(m.utm_content) : -1;
      const iStatus = m.status ? d.headers.indexOf(m.status) : -1;
      if (iEmail === -1) continue;
      for (const r of d.rows) {
        if (!(r[iEmail] ?? "").trim()) continue;
        if (iStatus !== -1 && !isRevenueBucket(classifyRefundStatus(r[iStatus] ?? "", true))) continue;
        total += 1;
        const ad = iUtm === -1 ? null : ehAdId(r[iUtm] ?? null);
        if (ad) { comUtm += 1; adIds.add(ad); }
        linhas.push({ ad });
      }
    }

    if (adIds.size) {
      const res = await c.query(
        `SELECT DISTINCT ad_id FROM meta_ad_insights_daily WHERE project_id=$1 AND ad_id = ANY($2)`,
        [e.project_id, [...adIds]],
      );
      const conhecidos = new Set(res.rows.map((x) => x.ad_id));
      naoResolv = linhas.filter((l) => l.ad && !conhecidos.has(l.ad)).length;
    }
    const atrib = comUtm - naoResolv;
    const cob = total > 0 ? ((atrib / total) * 100).toFixed(1) + "%" : "—";
    console.log(
      `${e.projeto.slice(0,14).padEnd(14)} | ${e.etapa.slice(0,25).padEnd(25)} | ${e.stage_type.padEnd(13)} | ${String(total).padStart(6)} | ${String(comUtm).padStart(6)} | ${cob.padStart(9)} | ${String(naoResolv).padStart(9)}`,
    );
  }
  await c.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
