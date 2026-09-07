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
import {
  resumirOrderBump,
  tabelaPorPublico,
  type LinhaDeVenda,
} from "../src/utils/order-bump.js";

const { Client } = pg;

const SLUG = process.argv[2] ?? "bbe-fc1";
const DIA = process.argv[3] ?? "2026-08-08";

/**
 * ⚠️ Cópia LITERAL de `perpetual-sales-data.ts:87,98,106` — lá não são
 * exportadas (e já existem três cópias no repo). Se divergirem, a medição
 * deixa de valer: é justamente o `parseNumber` que lia `1.097,00` como
 * `1,097` até a 18.73.
 */
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return parseFloat(normalized) || 0;
}

function sanitizeUtmValue(val: string | undefined | null): string | null {
  if (val == null) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "-" || lower === "n/a" || lower === "na") return null;
  return trimmed;
}

function parseDataDaLinha(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (br) {
    const [, d, m, y] = br;
    const dt = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

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
    // ⚠️ `funnels` NAO tem coluna `slug` — o script nasceu com ela e quebrava
    // com "column f.slug does not exist" desde alguma migration posterior a
    // 29.53. O identificador legivel do funil e `name` (ex.: bbe-fc1-a1-mai-26).
    `select f.name as slug, fs.spreadsheet_id, fs.sheet_name, fs.column_mapping, fs.product_types
       from funnel_spreadsheets fs
       join funnels f on f.id = fs.funnel_id
      where f.name ilike $1 and fs.type = 'perpetual_sales'`,
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

    // ⚠️ As chaves do `column_mapping` NAO sao uniformes: valor em camelCase
    // (`valorBruto`), UTM em snake_case (`utm_source`). E o que a rota usa
    // (`perpetual-sales-data.ts:296,299,308`) — errar aqui zera o publico em
    // silencio, sem zerar a contagem.
    const brutoIdx = idx(mapping.valorBruto);
    const utmSourceIdx = idx(mapping.utm_source);
    const utmTermIdx = idx(mapping.utm_term);

    /** Story 29.61 — as MESMAS linhas que a rota passa a `resumirOrderBump`. */
    const linhasParaPublico: LinhaDeVenda[] = [];

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
      const tipoDaLinha = tipoDoProduto(produtoIdx === -1 ? null : row[produtoIdx], tipos);
      quebra[tipoDaLinha] += 1;
      linhasParaPublico.push({
        email: (row[emailIdx] ?? "").trim().toLowerCase(),
        tipo: tipoDaLinha,
        bruto: parseNumber(row[brutoIdx] ?? ""),
        data: dataIdx === -1 ? null : parseDataDaLinha(row[dataIdx]),
        transacaoId: txIdx === -1 ? null : (row[txIdx] ?? "").trim() || null,
        // ⚠️ `null`, nunca `SEM_ORIGEM_LABEL` — ver o gate citado na rota.
        utmSource: utmSourceIdx === -1 ? null : sanitizeUtmValue(row[utmSourceIdx]),
        utmTerm: utmTermIdx === -1 ? null : sanitizeUtmValue(row[utmTermIdx]),
      });

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
    // --- Story 29.75 (AC1): a terceira base, a que o CARD usa ---
    const temAdicionais = Object.values(tipos).some((x) => x === "order_bump" || x === "upsell");
    const ob = resumirOrderBump(linhasParaPublico, temAdicionais);
    const pub = tabelaPorPublico(linhasParaPublico);
    const checkoutsNoDonut = pub.reduce((s, l) => s + l.compradores, 0);

    console.log(`\nmapeamento: bruto=${mapping.valorBruto ?? "NAO"} · utm_source=${mapping.utm_source ?? "NAO"} · utm_term=${mapping.utm_term ?? "NAO"}`);
    console.log(`publicos: ${pub.map((l) => `${l.publico} ${l.compradores}`).join(" · ") || "(nenhum)"}`);
    console.log("\nas TRES bases que convivem na tela (Story 29.75, AC1):");
    console.log(`  [1] COMPRADORES (dedup por e-mail) ....... ${compradoresDoPeriodo.size}   → KPI "Vendas", Faturamento, CAC, ROAS, Ticket`);
    console.log(`  [2] LINHAS (uma por linha da planilha) ... principal ${quebra.principal} · bump ${quebra.order_bump} · upsell ${quebra.upsell}   → legenda do KPI Vendas e do Faturamento`);
    console.log(`  [3] CHECKOUTS (e-mail + data + tx) ....... captacao ${ob.compradoresComPrincipal} · com bump ${ob.compradoresComBump} · so bump ${ob.compradoresSoBump}   → cards AOV / Order Bump / Combo`);
    console.log(`      donut de publicos (tabelaPorPublico) . ${checkoutsNoDonut}   → so checkout com produto que ancora`);
    console.log("\ncard Order Bump, como a tela mostra hoje:");
    console.log(`  ${ob.compradoresComBump} de ${ob.compradoresComPrincipal} compradores (${ob.taxaDeAdesao == null ? "—" : (ob.taxaDeAdesao * 100).toFixed(1) + "%"})`);
    console.log(`  R$ ${ob.bumpAcessorio.toFixed(2)} acessorio (${ob.representatividade == null ? "—" : (ob.representatividade * 100).toFixed(1) + "%"}) + R$ ${ob.bumpAvulso.toFixed(2)} em venda avulsa`);
    console.log(`  AOV geral = receitaCaptacao ${ob.receitaCaptacao.toFixed(2)} / ${ob.compradoresComPrincipal} = ${ob.aovGeral == null ? "—" : ob.aovGeral.toFixed(2)}`);
    console.log("\nfaturamento (AC4/AC5 — MEDIDO, nao derivado do '57,9K' do relato):");
    console.log(`  faturamentoTotal (todas as linhas) ...... R$ ${ob.faturamentoTotal.toFixed(2)}`);
    console.log(`  receitaCaptacao (base + bump acessorio) . R$ ${ob.receitaCaptacao.toFixed(2)}`);
    console.log(`  faturamentoPrincipal .................... R$ ${ob.faturamentoPrincipal.toFixed(2)}`);
    console.log(`  AOV se o denominador virar COMPRADORES .. ${(ob.receitaCaptacao / compradoresDoPeriodo.size).toFixed(2)}`);

    console.log(`\n${DIA}: ${linhasNoDia} linha(s) paga(s) → ${compradoresDoDia.size} comprador(es)`);
    console.log(`  CAC do dia = investimento ÷ ${compradoresDoDia.size} (contra ÷ ${linhasNoDia} antes da correção)`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
