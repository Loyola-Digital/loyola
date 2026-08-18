/**
 * Story 44.5 — GATE: o teto nasce utilizável, frágil ou vazio?
 *
 * Régua real (decisões de 2026-08-17):
 *  - melhor JANELA DESLIZANTE DE 7 DIAS de cada campanha, não o total;
 *  - janela por DATA (`RANGE`), não por linha: 41% das campanhas têm gap na
 *    série, o maior de 14 dias — com `ROWS`, 7 linhas cobririam até 21 dias e a
 *    base inflaria (correção do @po);
 *  - identidade = `campaignId`, sem agrupar por nome (o time decidiu não agrupar);
 *  - Conv. Checkout FORA da régua (Bloqueio B1, opção 3: a cadeia para em Conv. LP);
 *  - dois pisos: alto e baixo.
 *
 * Uso: npx tsx src/scripts/recontagem-viabilidade-teto.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });
import pg from "pg";

const FAMILIA: Record<string, string> = {
  paid: "paga", sales: "paga", event_capture: "paga", event: "paga",
  free: "gratuita", cpl: "gratuita",
};

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows } = await c.query(`
    WITH camp AS (
      SELECT DISTINCT p.name AS projeto, s.stage_type,
             jsonb_array_elements(s.campaigns)->>'id' AS campaign_id, p.id AS project_id
      FROM funnel_stages s
      JOIN funnels f ON f.id = s.funnel_id
      JOIN projects p ON p.id = f.project_id
      WHERE jsonb_array_length(COALESCE(s.campaigns,'[]'::jsonb)) > 0
        AND s.stage_type IN ('paid','sales','event_capture','event','free','cpl')
    ),
    dia AS (
      SELECT c.projeto, c.stage_type, c.campaign_id, m.date_start::date AS d,
        m.impressions::numeric AS impr,
        COALESCE((SELECT (a->>'value')::numeric FROM jsonb_array_elements(m.actions) a
                  WHERE a->>'action_type'='link_click'),0) AS lc,
        COALESCE((SELECT (a->>'value')::numeric FROM jsonb_array_elements(m.actions) a
                  WHERE a->>'action_type'='landing_page_view'),0) AS lpv
      FROM camp c
      JOIN meta_campaign_insights_daily m
        ON m.campaign_id = c.campaign_id AND m.project_id = c.project_id
    ),
    -- Janela por DATA: RANGE, nunca ROWS. Campanha com gap não pode inflar base.
    janela AS (
      SELECT projeto, stage_type, campaign_id,
        sum(impr) OVER w AS impr7, sum(lc) OVER w AS lc7, sum(lpv) OVER w AS lpv7
      FROM dia
      WINDOW w AS (PARTITION BY projeto, stage_type, campaign_id ORDER BY d
                   RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)
    ),
    melhor AS (
      SELECT projeto, stage_type, campaign_id,
             max(impr7) AS impr, max(lc7) AS lc, max(lpv7) AS lpv
      FROM janela GROUP BY 1,2,3
    )
    SELECT projeto, stage_type, count(*)::int AS campanhas,
      count(*) FILTER (WHERE impr >= 30000)::int AS impr_alto,
      count(*) FILTER (WHERE impr >= 10000)::int AS impr_baixo,
      count(*) FILTER (WHERE lc   >= 300)::int   AS lc_alto,
      count(*) FILTER (WHERE lc   >= 100)::int   AS lc_baixo,
      count(*) FILTER (WHERE lpv  >= 300)::int   AS lpv_alto,
      count(*) FILTER (WHERE lpv  >= 150)::int   AS lpv_baixo
    FROM melhor GROUP BY 1,2 ORDER BY 1,2`);
  await c.end();

  console.log("RECONTAGEM — melhor janela de 7 dias, por DATA. Conv. Checkout fora da régua.\n");
  console.log("projeto      | tipo          | fam.     | camp | CPM/CTR/CPC  | Connect      | Conv. LP");
  console.log("             |               |          |      | alto / baixo | alto / baixo | alto / baixo");
  const leitura: string[] = [];
  for (const r of rows) {
    const fam = FAMILIA[r.stage_type] ?? "?";
    console.log(
      `${r.projeto.slice(0,12).padEnd(12)} | ${r.stage_type.padEnd(13)} | ${fam.padEnd(8)} | ${String(r.campanhas).padStart(4)} | ` +
      `${String(r.impr_alto).padStart(4)} / ${String(r.impr_baixo).padStart(5)} | ` +
      `${String(r.lc_alto).padStart(4)} / ${String(r.lc_baixo).padStart(5)} | ` +
      `${String(r.lpv_alto).padStart(4)} / ${String(r.lpv_baixo).padStart(5)}`);
    const min = Math.min(r.impr_alto, r.lc_alto, r.lpv_alto);
    leitura.push(`  ${r.projeto} / ${r.stage_type}: ${min >= 3 ? "UTILIZÁVEL" : min >= 1 ? "FRÁGIL (1-2 campanhas)" : "VAZIO"} no piso alto`);
  }
  console.log("\n== leitura por grupo (piso ALTO, métrica mais restritiva) ==");
  console.log(leitura.join("\n"));
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
