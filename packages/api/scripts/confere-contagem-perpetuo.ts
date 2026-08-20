/**
 * Story 29.53 — confere a contagem de vendas do perpétuo contra a planilha.
 *
 * Roda as MESMAS funções que a rota usa (`chaveDeComprador`, `tipoDoProduto`,
 * `isRevenueBucket`) sobre os dados de produção e imprime, lado a lado, as
 * quatro regras que já conviveram na tela. Existe porque suíte verde não prova
 * a forma do dado: os três defeitos de 20/08 passaram por gate e por build e só
 * apareceram rodando contra produção.
 *
 * Uso (precisa do `.env` da API com DATABASE_URL e GOOGLE_SERVICE_ACCOUNT_KEY):
 *
 *     cd packages/api && ./node_modules/.bin/tsx scripts/confere-contagem-perpetuo.ts [slug-do-funil] [YYYY-MM-DD]
 *
 * O slug default é o funil do Netão; a data é o dia a detalhar (default 08/08).
 */
import "dotenv/config";
import pg from "pg";
import { readSheetData } from "../src/services/google-sheets.js";
import { chaveDeComprador } from "../src/utils/comprador.js";
import { tipoDoProduto, quebraVazia, type TipoDeProduto } from "../src/utils/produto.js";
import { classifyRefundStatus, isRevenueBucket } from "../src/services/sales-status.js";

const { Client } = pg;

const SLUG = process.argv[2] ?? "bbe-fc1";
const DIA = process.argv[3] ?? "2026-08-08";

/** A planilha traz `DD/MM/YYYY HH:mm` ou ISO — só precisamos do dia. */
function diaDaLinha(valor: string | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1]! : null;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows: sheets } = await c.query(
    `select f.slug, fs.spreadsheet_id, fs.sheet_name, fs.column_mapping, fs.product_types
       from funnel_spreadsheets fs
       join funnels f on f.id = fs.funnel_id
      where f.slug like $1 and fs.type = 'perpetual_sales'`,
    [`%${SLUG}%`],
  );
  await c.end();

  if (sheets.length === 0) {
    console.error(`Nenhuma planilha de perpétuo para o slug "${SLUG}".`);
    process.exit(1);
  }

  for (const sh of sheets) {
    const mapping = sh.column_mapping as Record<string, string | undefined>;
    const tipos = (sh.product_types as Record<string, TipoDeProduto> | null) ?? {};
    const { headers, rows } = await readSheetData(sh.spreadsheet_id, sh.sheet_name);
    const idx = (campo: string | undefined) => (campo ? headers.indexOf(campo) : -1);

    const emailIdx = idx(mapping.email);
    const txIdx = idx(mapping.transactionId);
    const dataIdx = idx(mapping.dataVenda);
    const statusIdx = idx(mapping.status);
    const produtoIdx = idx(mapping.productName);
    const temStatus = statusIdx !== -1;

    const compradoresDoPeriodo = new Set<string>();
    const transacoes = new Set<string>();
    const quebra = quebraVazia();
    const compradoresDoDia = new Set<string>();
    let linhasPagas = 0;
    let linhasNoDia = 0;

    for (const [i, row] of rows.entries()) {
      if (temStatus && !isRevenueBucket(classifyRefundStatus(row[statusIdx], true))) continue;
      linhasPagas += 1;
      compradoresDoPeriodo.add(chaveDeComprador(row[emailIdx], row[txIdx], i));
      const tx = (row[txIdx] ?? "").trim();
      if (tx) transacoes.add(tx);
      quebra[tipoDoProduto(produtoIdx === -1 ? null : row[produtoIdx], tipos)] += 1;

      if (diaDaLinha(row[dataIdx]) === DIA) {
        linhasNoDia += 1;
        compradoresDoDia.add(chaveDeComprador(row[emailIdx], row[txIdx], i, DIA));
      }
    }

    console.log(`\n=== ${sh.slug} · ${sh.sheet_name} ===`);
    console.log(`coluna de produto mapeada: ${produtoIdx !== -1 ? mapping.productName : "NÃO"} · produtos classificados: ${Object.keys(tipos).length}`);
    console.log(`linhas na planilha: ${rows.length} · pagas: ${linhasPagas}`);
    console.log("\nquantas vendas? — as regras que já conviveram na tela:");
    console.log(`  linhas pagas .................. ${linhasPagas}   (o que a tabela diária contava antes da 29.53)`);
    console.log(`  transações únicas ............. ${transacoes.size}`);
    console.log(`  COMPRADORES (regra atual) ..... ${compradoresDoPeriodo.size}   ← card, quadro diário e relatório`);
    console.log(`  linhas de produto principal ... ${quebra.principal}`);
    console.log(`\nquebra por tipo (LINHAS, não compradores): principal ${quebra.principal} · order_bump ${quebra.order_bump} · upsell ${quebra.upsell}`);
    console.log(`\n${DIA}: ${linhasNoDia} linha(s) paga(s) → ${compradoresDoDia.size} comprador(es)`);
    console.log(`  CAC do dia = investimento ÷ ${compradoresDoDia.size} (contra ÷ ${linhasNoDia} antes da correção)`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
