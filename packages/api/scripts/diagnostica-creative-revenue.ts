/**
 * Story 18.79 (AC2) — por que a aba "Maiores ROAS" não seleciona numa etapa?
 *
 * A aba fica desabilitada quando `revenueData.semDados` é `true`, e a rota
 * `creative-revenue` tem QUATRO caminhos para isso. Este script diz, por etapa,
 * qual deles é — em vez de "não tem dado", que não indica o que fazer.
 *
 * Uso (precisa do `.env` da API com DATABASE_URL):
 *
 *     cd packages/api && ./node_modules/.bin/tsx scripts/diagnostica-creative-revenue.ts [filtro-do-funil]
 */
import "dotenv/config";
import pg from "pg";

const FILTRO = process.argv[2] ?? "";

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Espelha as duas queries da rota (`creative-revenue.ts:138,150`): planilha
  // de LEADS em `funnel_spreadsheets` (type=leads) e de VENDAS em
  // `stage_sales_spreadsheets` (subtype=capture) — tabelas diferentes, e é
  // por isso que "a etapa tem planilha" pode ser verdade e a aba ficar cinza.
  const { rows } = await c.query(
    `select f.name as funil, fs_stage.name as etapa, fs_stage.id as stage_id,
            l.spreadsheet_id  as leads_sheet, l.column_mapping as leads_map,
            s.spreadsheet_id  as sales_sheet, s.column_mapping as sales_map
       from funnel_stages fs_stage
       join funnels f on f.id = fs_stage.funnel_id
       left join funnel_spreadsheets l
              on l.stage_id = fs_stage.id and l.type = 'leads'
       left join stage_sales_spreadsheets s
              on s.stage_id = fs_stage.id and s.subtype = 'capture'
      where f.name ilike $1
      order by f.name, fs_stage.name`,
    [`%${FILTRO}%`],
  );
  await c.end();

  let comRoas = 0;
  for (const r of rows) {
    const lm = (r.leads_map ?? {}) as Record<string, string | undefined>;
    const sm = (r.sales_map ?? {}) as Record<string, string | undefined>;

    let veredito: string;
    if (!r.leads_sheet && !r.sales_sheet) {
      veredito = "SEM as duas planilhas (leads e vendas)";
    } else if (!r.leads_sheet) {
      veredito = "SEM planilha de LEADS (type=leads em funnel_spreadsheets)";
    } else if (!r.sales_sheet) {
      veredito = "SEM planilha de VENDAS (subtype=capture em stage_sales_spreadsheets)";
    } else if (sm.utm_content) {
      // caminho sale-content: basta e-mail OU transactionId na venda
      veredito = sm.email || sm.transactionId
        ? "OK — cruza por co= da venda"
        : "planilhas OK, mas a venda nao tem email nem transactionId mapeado";
    } else if (!lm.email || !lm.utm_content || !sm.email) {
      const faltam = [
        !lm.email ? "lead.email" : null,
        !lm.utm_content ? "lead.utm_content" : null,
        !sm.email ? "venda.email" : null,
      ].filter(Boolean).join(", ");
      veredito = `planilhas OK, mas falta mapear: ${faltam} (caminho legacy)`;
    } else {
      veredito = "OK — cruza por email do lead (legacy)";
    }

    if (veredito.startsWith("OK")) comRoas += 1;
    const marca = veredito.startsWith("OK") ? "✅" : "❌";
    console.log(`${marca} ${r.funil} / ${r.etapa}`);
    console.log(`     ${veredito}`);
  }
  console.log(`\n${comRoas} de ${rows.length} etapas conseguem calcular ROAS por criativo.`);
  console.log("As demais mostram a aba «Maiores ROAS» desabilitada — o tooltip diz o motivo.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
