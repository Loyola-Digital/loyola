import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { stageSalesSpreadsheets, manualSales, funnelStages, funnels, funnelSpreadsheets, publicMetricsCache } from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { classifyOrigem, type Origem } from "../utils/lead-origin.js";
import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";

/**
 * Story 36.7 (Buraco 3 / "Dados Diários" — metade de vendas): faturamento +
 * ingressos por dia × origem (Pago/Orgânico/Sem Track), por stage. Réplica FIEL
 * da lógica de `routes/stage-sales-data.ts` (dedup por txId, classifyFonte,
 * ingressosByDay) — mesmos números do dashboard. ZERO PII (só agregados).
 * Combine com `/meta/v1/projects/:id/daily` (investimento) pra ROAS real.
 */

// --- helpers espelhados de stage-sales-data.ts ---
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
  const t = String(val).trim();
  if (!t) return null;
  const l = t.toLowerCase();
  if (l === "null" || l === "undefined" || l === "-" || l === "n/a" || l === "na") return null;
  return t;
}
function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const t = val.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (br) {
    const dt = new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(t);
  return isNaN(dt.getTime()) ? null : dt;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Resumão v4 #3: utm_term não está no columnMapping das planilhas de venda —
// detecção por matcher no cabeçalho (mesmos aliases do survey).
function findTermHeader(headers: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const H = headers.map(norm);
  for (const m of ["utm_term", "utm term", "t=", "termo"]) {
    const i = H.findIndex((h) => h === m || h.includes(m));
    if (i >= 0) return i;
  }
  return -1;
}
function classifyTemperaturaVenda(termRaw: string | null): "hot" | "cold" | null {
  const t = (termRaw ?? "").toLowerCase();
  if (t.includes("hot") || t.includes("quente")) return "hot";
  if (t.includes("cold") || t.includes("frio")) return "cold";
  return null;
}

export interface SalesDailyPayload {
  range: { from: string | null; to: string | null };
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  byDay: {
    date: string;
    faturamentoBruto: number;
    faturamentoLiquido: number;
    ingressos: { pago: number; org: number; semTrack: number; total: number };
  }[];
  porOrigem: { origem: Origem; vendas: number; bruto: number; liquido: number }[];
  /** Resumão v4 #3: matriz Origem × Temperatura (utm_term da VENDA: hot/cold/null).
   * ROAS por temperatura = bruto do bloco ÷ spend hot/cold do stage-daily. */
  porOrigemTemperatura: { origem: Origem; temperatura: "hot" | "cold" | null; vendas: number; bruto: number; liquido: number }[];
  /** Story 39.5 (parcial): quebra por produto (top 30) — base pra separar ingresso × order bump. */
  porProduto: { produto: string; vendas: number; bruto: number; liquido: number }[];
  /** Brief v6 #6: quebra por plataforma (= subtype da planilha de origem, ou
   * "manual"). Permite excluir TMB do total sem depender do nome do produto. */
  porPlataforma: { plataforma: string; vendas: number; bruto: number; liquido: number }[];
  /** Brief v6 #6: produto × plataforma (top 30 por vendas) — expõe o TMB
   * "escondido" dentro do mesmo nome de produto vindo de planilhas diferentes. */
  porProdutoPlataforma: { produto: string; plataforma: string; vendas: number; bruto: number; liquido: number }[];
  /** Story 39.6: subtypes de planilha que entraram na conta (capture fica FORA). */
  subtypesConsidered: string[];
  /** Brief v5 #1: vendas MANUAIS (Evento Presencial/Vendas) incluídas na conta —
   * reembolsadas ficam FORA. bruto = valor combinado; liquido = valor recebido
   * (Caixa) quando lançado, senão o combinado. Sem UTM → origem "Sem Track". */
  manualSalesIncluded: number;
}

type Mapping = {
  email?: string;
  transactionId?: string;
  productName?: string;
  valorBruto?: string;
  valorLiquido?: string;
  utm_source?: string;
  dataVenda?: string;
  /** Status do pagamento (refunded/chargeback saem — mesmo critério do dashboard). */
  status?: string;
};

// Story 39.6 (auditoria Tier 3.3): a etapa Vendas devolvia milhares de "vendas"
// porque somava TODAS as planilhas do stage — inclusive CAPTAÇÃO. Vendas de
// verdade = estes subtypes (capture fica fora).
const SALES_SUBTYPES = ["main_product", "sales", "tmb", "event_sales"];

export async function computeSalesDailyForStage(db: Database, stageId: string): Promise<SalesDailyPayload | null> {
  const [stageRow] = await db
    .select({ stageType: funnelStages.stageType, funnelId: funnelStages.funnelId })
    .from(funnelStages)
    .where(eq(funnelStages.id, stageId))
    .limit(1);

  const allSheets = await db
    .select({
      id: stageSalesSpreadsheets.id,
      subtype: stageSalesSpreadsheets.subtype,
      spreadsheetId: stageSalesSpreadsheets.spreadsheetId,
      sheetName: stageSalesSpreadsheets.sheetName,
      columnMapping: stageSalesSpreadsheets.columnMapping,
    })
    .from(stageSalesSpreadsheets)
    .where(eq(stageSalesSpreadsheets.stageId, stageId));

  // Exceção à 39.6: em CAPTAÇÃO PAGA a planilha capture É o checkout do ingresso
  // (Kiwify — cada linha é compra com valor). Mas SÓ como FALLBACK quando a etapa
  // não tem planilha de venda — quando tem as duas, a capture costuma repetir as
  // MESMAS transações (dedup é por sheet) e dobraria o faturamento.
  let sheets = allSheets.filter((s) => SALES_SUBTYPES.includes(s.subtype));
  if (sheets.length === 0 && stageRow?.stageType === "paid") {
    sheets = allSheets.filter((s) => s.subtype === "capture");
  }

  // Inácio M1 (mapeamento jul/22): FUNIL PERPÉTUO guarda as vendas reais
  // (n8n-Kiwify) na planilha do FUNIL (funnel_spreadsheets type='perpetual_sales',
  // stage_id NULL) — os 4 perpétuos em prod têm 0 planilhas de etapa, então o
  // get_stage_sales_daily devolvia semDados pra TODOS. A etapa de dashboard
  // (free/paid) herda a planilha do funil como fonte de vendas.
  if (stageRow && (stageRow.stageType === "free" || stageRow.stageType === "paid")) {
    const [perpSheet] = await db
      .select({
        id: funnelSpreadsheets.id,
        spreadsheetId: funnelSpreadsheets.spreadsheetId,
        sheetName: funnelSpreadsheets.sheetName,
        columnMapping: funnelSpreadsheets.columnMapping,
      })
      .from(funnelSpreadsheets)
      .where(and(eq(funnelSpreadsheets.funnelId, stageRow.funnelId), eq(funnelSpreadsheets.type, "perpetual_sales")))
      .limit(1);
    if (perpSheet) {
      sheets = [
        ...sheets,
        {
          id: perpSheet.id,
          subtype: "perpetual_sales",
          spreadsheetId: perpSheet.spreadsheetId,
          sheetName: perpSheet.sheetName,
          columnMapping: perpSheet.columnMapping as Mapping,
        },
      ];
    }
  }

  // Brief v5 #1: vendas manuais (Evento Presencial / Vendas / captações) —
  // reembolsadas (refundedAt != null) ficam fora, mesma regra do dashboard.
  const manualRows = await db
    .select({
      id: manualSales.id,
      value: manualSales.value,
      valorRecebido: manualSales.valorRecebido,
      product: manualSales.product,
      saleDate: manualSales.saleDate,
    })
    .from(manualSales)
    .where(and(eq(manualSales.stageId, stageId), isNull(manualSales.refundedAt)));

  if (sheets.length === 0 && manualRows.length === 0) return null;

  // Dedup por (txId + produto) — MESMA chave do all-sales do dashboard
  // (manual-sales.ts): order bumps (mesmo pedido, produtos diferentes) contam
  // como vendas separadas; retry literal (mesmo pedido+produto) colapsa.
  const sales = new Map<
    string,
    { bruto: number; liquido: number; utmSource: string | null; utmTerm: string | null; date: Date | null; produto: string; plataforma: string }
  >();
  const subtypesConsidered = new Set<string>();

  for (const sheet of sheets) {
    const mapping = (sheet.columnMapping ?? {}) as Mapping;
    let data: { headers: string[]; rows: string[][] };
    try {
      const res = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
      data = { headers: res.headers, rows: res.rows };
    } catch {
      continue;
    }
    const col = (name: string | undefined): number => (name ? data.headers.indexOf(name) : -1);
    const emailIdx = col(mapping.email);
    const txIdx = col(mapping.transactionId);
    const produtoIdx = col(mapping.productName);
    const brutoIdx = col(mapping.valorBruto);
    const liquidoIdx = col(mapping.valorLiquido);
    const utmSourceIdx = col(mapping.utm_source);
    const utmTermIdx = findTermHeader(data.headers);
    const dataIdx = col(mapping.dataVenda);
    const statusIdx = col(mapping.status);
    if (emailIdx === -1) continue;
    subtypesConsidered.add(sheet.subtype);

    let rowIndex = -1;
    for (const row of data.rows) {
      rowIndex += 1;
      const email = (row[emailIdx] ?? "").trim().toLowerCase();
      if (!email) continue;
      // Reembolso/chargeback fora (quando a coluna status está mapeada) —
      // mesmo critério do dashboard/perpetual-sales-data.
      if (statusIdx !== -1 && isRefundBucket(classifyRefundStatus(row[statusIdx], true))) continue;
      const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
      const produto = produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim() : "";
      const dedupKey = txId
        ? `${sheet.id}|tx|${txId}|${produto.toLowerCase()}`
        : `${sheet.id}|row|${rowIndex}`;
      if (txId && sales.has(dedupKey)) continue;
      sales.set(dedupKey, {
        bruto: parseNumber(row[brutoIdx] ?? ""),
        liquido: parseNumber(row[liquidoIdx] ?? ""),
        utmSource: utmSourceIdx !== -1 ? sanitizeUtmValue(row[utmSourceIdx]) : null,
        utmTerm: utmTermIdx !== -1 ? sanitizeUtmValue(row[utmTermIdx]) : null,
        date: dataIdx !== -1 ? parseDate(row[dataIdx]) : null,
        produto: produto || "(sem produto)",
        plataforma: sheet.subtype,
      });
    }
  }

  for (const m of manualRows) {
    const bruto = parseFloat(m.value ?? "0") || 0;
    const recebido = m.valorRecebido != null ? parseFloat(m.valorRecebido) || 0 : null;
    sales.set(`manual|${m.id}`, {
      bruto,
      liquido: recebido ?? bruto,
      utmSource: null,
      utmTerm: null,
      date: m.saleDate,
      produto: (m.product ?? "").trim() || "(venda manual)",
      plataforma: "manual",
    });
  }

  if (sales.size === 0) return null;

  const byDay = new Map<string, { bruto: number; liquido: number; pago: number; org: number; semTrack: number }>();
  const porOrigem = new Map<Origem, { vendas: number; bruto: number; liquido: number }>();
  const porOT = new Map<string, { origem: Origem; temperatura: "hot" | "cold" | null; vendas: number; bruto: number; liquido: number }>();
  const porProduto = new Map<string, { vendas: number; bruto: number; liquido: number }>();
  const porPlataforma = new Map<string, { vendas: number; bruto: number; liquido: number }>();
  const porProdutoPlataforma = new Map<string, { produto: string; plataforma: string; vendas: number; bruto: number; liquido: number }>();
  let totalBruto = 0;
  let totalLiquido = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const s of sales.values()) {
    totalBruto += s.bruto;
    totalLiquido += s.liquido;
    const origem = classifyOrigem(s.utmSource);
    const po = porOrigem.get(origem) ?? { vendas: 0, bruto: 0, liquido: 0 };
    po.vendas += 1;
    po.bruto += s.bruto;
    po.liquido += s.liquido;
    porOrigem.set(origem, po);

    const pp = porProduto.get(s.produto) ?? { vendas: 0, bruto: 0, liquido: 0 };
    pp.vendas += 1;
    pp.bruto += s.bruto;
    pp.liquido += s.liquido;
    porProduto.set(s.produto, pp);

    const pf = porPlataforma.get(s.plataforma) ?? { vendas: 0, bruto: 0, liquido: 0 };
    pf.vendas += 1;
    pf.bruto += s.bruto;
    pf.liquido += s.liquido;
    porPlataforma.set(s.plataforma, pf);

    const ppfKey = `${s.produto}|${s.plataforma}`;
    const ppf = porProdutoPlataforma.get(ppfKey) ?? { produto: s.produto, plataforma: s.plataforma, vendas: 0, bruto: 0, liquido: 0 };
    ppf.vendas += 1;
    ppf.bruto += s.bruto;
    ppf.liquido += s.liquido;
    porProdutoPlataforma.set(ppfKey, ppf);

    const temperatura = classifyTemperaturaVenda(s.utmTerm);
    const otKey = `${origem}|${temperatura ?? "null"}`;
    const ot = porOT.get(otKey) ?? { origem, temperatura, vendas: 0, bruto: 0, liquido: 0 };
    ot.vendas += 1;
    ot.bruto += s.bruto;
    ot.liquido += s.liquido;
    porOT.set(otKey, ot);

    if (s.date) {
      const key = ymd(s.date);
      const e = byDay.get(key) ?? { bruto: 0, liquido: 0, pago: 0, org: 0, semTrack: 0 };
      e.bruto += s.bruto;
      e.liquido += s.liquido;
      if (origem === "Pago") e.pago += 1;
      else if (origem === "Sem Track") e.semTrack += 1;
      else e.org += 1;
      byDay.set(key, e);
      if (!minDate || key < minDate) minDate = key;
      if (!maxDate || key > maxDate) maxDate = key;
    }
  }

  return {
    range: { from: minDate, to: maxDate },
    totalVendas: sales.size,
    faturamentoBruto: Math.round(totalBruto * 100) / 100,
    faturamentoLiquido: Math.round(totalLiquido * 100) / 100,
    byDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, e]) => ({
        date,
        faturamentoBruto: Math.round(e.bruto * 100) / 100,
        faturamentoLiquido: Math.round(e.liquido * 100) / 100,
        ingressos: { pago: e.pago, org: e.org, semTrack: e.semTrack, total: e.pago + e.org + e.semTrack },
      })),
    porOrigem: [...porOrigem.entries()].map(([origem, v]) => ({
      origem,
      vendas: v.vendas,
      bruto: Math.round(v.bruto * 100) / 100,
      liquido: Math.round(v.liquido * 100) / 100,
    })),
    porOrigemTemperatura: [...porOT.values()].map((v) => ({
      origem: v.origem,
      temperatura: v.temperatura,
      vendas: v.vendas,
      bruto: Math.round(v.bruto * 100) / 100,
      liquido: Math.round(v.liquido * 100) / 100,
    })),
    porProduto: [...porProduto.entries()]
      .sort((a, b) => b[1].vendas - a[1].vendas)
      .slice(0, 30)
      .map(([produto, v]) => ({
        produto,
        vendas: v.vendas,
        bruto: Math.round(v.bruto * 100) / 100,
        liquido: Math.round(v.liquido * 100) / 100,
      })),
    porPlataforma: [...porPlataforma.entries()]
      .sort((a, b) => b[1].bruto - a[1].bruto)
      .map(([plataforma, v]) => ({
        plataforma,
        vendas: v.vendas,
        bruto: Math.round(v.bruto * 100) / 100,
        liquido: Math.round(v.liquido * 100) / 100,
      })),
    porProdutoPlataforma: [...porProdutoPlataforma.values()]
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 30)
      .map((v) => ({
        produto: v.produto,
        plataforma: v.plataforma,
        vendas: v.vendas,
        bruto: Math.round(v.bruto * 100) / 100,
        liquido: Math.round(v.liquido * 100) / 100,
      })),
    subtypesConsidered: [...subtypesConsidered].sort(),
    manualSalesIncluded: manualRows.length,
  };
}

export const SALES_DAILY_SCOPE = "sales-daily";

export async function upsertSalesDailyCache(db: Database, projectId: string, stageId: string, payload: SalesDailyPayload): Promise<void> {
  await db
    .insert(publicMetricsCache)
    .values({ projectId, scope: SALES_DAILY_SCOPE, key: stageId, payload, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [publicMetricsCache.projectId, publicMetricsCache.scope, publicMetricsCache.key],
      set: { payload, computedAt: new Date() },
    });
}

export interface SalesDailySyncSummary {
  stagesProcessed: number;
  stagesSkipped: number;
  errors: { stageId: string; error: string }[];
}

/** Job: recomputa o cache de vendas diárias para todos os stages com planilha de vendas. */
export async function syncSalesDaily(
  db: Database,
  opts: { projectIds?: string[]; log?: (msg: string) => void } = {},
): Promise<SalesDailySyncSummary> {
  const log = opts.log ?? (() => {});
  const summary: SalesDailySyncSummary = { stagesProcessed: 0, stagesSkipped: 0, errors: [] };

  const sheetStages = await db
    .selectDistinct({ stageId: stageSalesSpreadsheets.stageId, projectId: funnels.projectId })
    .from(stageSalesSpreadsheets)
    .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId));

  // Brief v5 #1: etapas SÓ com vendas manuais (Evento Presencial) também
  // entram no sync — antes ficavam eternamente semDados.
  const manualStages = await db
    .selectDistinct({ stageId: manualSales.stageId, projectId: funnels.projectId })
    .from(manualSales)
    .innerJoin(funnelStages, eq(funnelStages.id, manualSales.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(isNull(manualSales.refundedAt));

  // Inácio M1: etapas de dashboard (free/paid) de funis com planilha do
  // PERPÉTUO (perpetual_sales) — a fonte de vendas é a planilha do funil.
  const perpStages = await db
    .selectDistinct({ stageId: funnelStages.id, projectId: funnels.projectId })
    .from(funnelSpreadsheets)
    .innerJoin(funnels, eq(funnels.id, funnelSpreadsheets.funnelId))
    .innerJoin(funnelStages, eq(funnelStages.funnelId, funnels.id))
    .where(
      and(
        eq(funnelSpreadsheets.type, "perpetual_sales"),
        inArray(funnelStages.stageType, ["free", "paid"]),
      ),
    );

  const byStage = new Map<string, string>();
  for (const r of sheetStages) byStage.set(r.stageId, r.projectId);
  for (const r of manualStages) byStage.set(r.stageId, r.projectId);
  for (const r of perpStages) byStage.set(r.stageId, r.projectId);
  const rows = [...byStage.entries()].map(([stageId, projectId]) => ({ stageId, projectId }));

  const filter = opts.projectIds ? new Set(opts.projectIds) : null;
  for (const { stageId, projectId } of rows) {
    if (filter && !filter.has(projectId)) continue;
    try {
      const payload = await computeSalesDailyForStage(db, stageId);
      if (!payload) {
        summary.stagesSkipped++;
        continue;
      }
      await upsertSalesDailyCache(db, projectId, stageId, payload);
      summary.stagesProcessed++;
      log(`[sales-daily] stage ${stageId}: ${payload.totalVendas} vendas, R$ ${payload.faturamentoBruto} bruto`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ stageId, error: msg });
      log(`[sales-daily] ERRO stage ${stageId}: ${msg}`);
    }
  }
  return summary;
}
