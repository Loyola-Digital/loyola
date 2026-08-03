/**
 * Story 41.8 — carrega os dados do relatório perpétuo e chama o motor.
 *
 * Separado de `perpetual-report-metrics.ts` de propósito: lá mora a matemática
 * (pura, conferível contra a §C.10 em teste); aqui mora o I/O. Quem quiser
 * testar o cálculo não precisa de planilha nem de Meta.
 *
 * Regra do epic (R-E2): o spend vem do **cache do banco**
 * (`fetchCampaignDailyInsightsForIdsWithCache`). O gerador não abre um novo
 * caminho de fan-out por criativo na API da Meta.
 */

import { eq, and, inArray, gte, lte } from "drizzle-orm";
import {
  funnelSpreadsheets,
  metaAdsAccounts,
  metaCampaignInsightsDaily,
} from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";
import { fetchCampaignDailyInsightsForIdsWithCache } from "./meta-insights-cache.js";
import { applyMetaTax } from "../utils/meta-tax.js";
import { saleDayKey, businessYesterday, shiftDayKey } from "../utils/sale-date.js";
import {
  loadPerpetualReportConfig,
  resolvePerpetualRates,
} from "./perpetual-report-config.js";
import {
  computePerpetualReport,
  type PerpetualReport,
  type PerpetualSaleRow,
  type CampaignSpendRow,
} from "./perpetual-report-metrics.js";
import type { Database } from "../db/client.js";

export interface LoadPerpetualReportParams {
  funnelId: string;
  /** Nulo = mês corrente até ontem (§C.7 — dias completos). */
  dataInicio?: string | null;
  dataFim?: string | null;
}

/** Erro de dado ausente — distinto de gate e de invariante. */
export class PerpetualReportDataError extends Error {
  readonly erro = "DADO_INDISPONIVEL";
  constructor(
    readonly detalhe: string,
    readonly acao: string,
  ) {
    super(detalhe);
    this.name = "PerpetualReportDataError";
  }
  toResponse() {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

/** Período default: do dia 1 do mês corrente até ONTEM (§C.7). */
export function defaultPeriodo(now: Date = new Date()): { inicio: string; fim: string } {
  const fim = businessYesterday(now);
  const inicio = `${fim.slice(0, 7)}-01`;
  // Se ontem foi o último dia do mês anterior (hoje é dia 1), o mês corrente
  // ainda não tem dia fechado — cai para o mês de `fim`.
  return { inicio, fim };
}

export async function loadPerpetualReport(
  db: Database,
  accessTokenFor: (accountId: string) => Promise<string | null>,
  params: LoadPerpetualReportParams,
): Promise<PerpetualReport> {
  // 1. Config + gate (§C.8). Lança ReportScopeError se não validado.
  const config = await loadPerpetualReportConfig(db, params.funnelId);

  const periodo =
    params.dataInicio && params.dataFim
      ? { inicio: params.dataInicio, fim: params.dataFim }
      : defaultPeriodo();
  if (periodo.inicio > periodo.fim) {
    throw new PerpetualReportDataError(
      `período inválido: início ${periodo.inicio} depois do fim ${periodo.fim}`,
      "Corrigir as datas do relatório",
    );
  }

  // 2. Planilha de vendas
  const [sheet] = await db
    .select()
    .from(funnelSpreadsheets)
    .where(
      and(
        eq(funnelSpreadsheets.funnelId, params.funnelId),
        eq(funnelSpreadsheets.type, "perpetual_sales"),
      ),
    )
    .limit(1);
  if (!sheet) {
    throw new PerpetualReportDataError(
      "funil não tem planilha de vendas perpétuas conectada",
      "Conectar a planilha na aba Planilhas antes de gerar o relatório",
    );
  }

  const mapping = sheet.columnMapping as Record<string, string | undefined>;
  let sheetData;
  try {
    sheetData = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
  } catch (e) {
    throw new PerpetualReportDataError(
      `não foi possível ler a planilha: ${(e as Error).message}`,
      "Verificar o acesso à planilha e tentar de novo",
    );
  }

  const { vendas, hasStatusCol } = parseVendas(sheetData, mapping, periodo);

  // 3. Spend por campanha — do cache do banco (R-E2), nunca fan-out novo.
  const campaignIds = config.campanhas.map((c) => c.id);
  const campanhas = await loadCampanhaSpend(
    db,
    accessTokenFor,
    config.projectId,
    config.metaAccountId,
    campaignIds,
    config.campanhas,
    periodo,
  );

  // 3b. Investimento zero com campanha vinculada e venda no período é sintoma,
  // não resultado: foi assim que o bug do `campaign_id` ausente se manifestou —
  // relatório com CAC 0, ROAS indefinido e margem inflada, sem reclamar de nada.
  // Melhor recusar do que entregar número com cara de confiável (§C.8).
  const investimentoTotal = campanhas.reduce((s, c) => s + c.spend, 0);
  if (campanhas.length > 0 && investimentoTotal === 0 && vendas.length > 0) {
    throw new PerpetualReportDataError(
      `as ${campanhas.length} campanha(s) do funil não têm investimento no período ` +
        `${periodo.inicio}..${periodo.fim}, mas há ${vendas.length} venda(s) — ` +
        `o relatório sairia com CAC zero e margem inflada`,
      "Abrir a aba Meta Ads no período para o cache de insights ser preenchido, e gerar de novo",
    );
  }

  // 4. Taxas — plataforma vem da planilha, ramo de reembolso vem da coluna status
  const rates = resolvePerpetualRates(config, sheet.platform ?? null, hasStatusCol);

  return computePerpetualReport({ config, rates, periodo, vendas, campanhas });
}

// ------------------------------------------------------------------

interface SheetShape {
  headers: string[];
  rows: string[][];
}

/**
 * Converte linhas da planilha em `PerpetualSaleRow`, já recortadas no período
 * por **dia civil de São Paulo** (§C.7) e sem as reembolsadas.
 */
function parseVendas(
  sheetData: SheetShape,
  mapping: Record<string, string | undefined>,
  periodo: { inicio: string; fim: string },
): { vendas: PerpetualSaleRow[]; hasStatusCol: boolean } {
  const { headers, rows } = sheetData;
  const idx = (field: string | undefined) => (field ? headers.indexOf(field) : -1);

  const emailIdx = idx(mapping.email);
  const dataIdx = idx(mapping.dataVenda);
  const brutoIdx = idx(mapping.valorBruto);
  const statusIdx = idx(mapping.status);
  const txIdx = idx(mapping.transactionId);
  const sourceIdx = idx(mapping.utm_source);
  const campaignIdx = idx(mapping.utm_campaign);
  const mediumIdx = idx(mapping.utm_medium);
  const contentIdx = idx(mapping.utm_content);
  const produtoIdx = idx(mapping.produto);

  const hasStatusCol = statusIdx !== -1;

  if (emailIdx === -1 || dataIdx === -1 || brutoIdx === -1) {
    throw new PerpetualReportDataError(
      "a planilha precisa ter e-mail, data da venda e valor bruto mapeados",
      "Completar o mapeamento de colunas no wizard de planilhas",
    );
  }
  if (campaignIdx === -1) {
    // Sem `utm_campaign` não há atribuição possível por ID — e cair para
    // heurística de nome é exatamente o que o §C.3.6.1 proíbe.
    throw new PerpetualReportDataError(
      "a planilha não tem `utm_campaign` mapeado — sem ele não há como atribuir venda a campanha",
      "Mapear a coluna que traz o Campaign ID (c=) no wizard de planilhas",
    );
  }

  // Passe 1: transações reembolsadas saem inteiras (a linha paga pareada também).
  const refundedTxIds = new Set<string>();
  if (hasStatusCol && txIdx !== -1) {
    for (const row of rows) {
      if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) {
        const txId = (row[txIdx] ?? "").trim();
        if (txId) refundedTxIds.add(txId);
      }
    }
  }

  const clean = (i: number, row: string[]) => {
    if (i === -1) return null;
    const v = (row[i] ?? "").trim();
    if (!v) return null;
    const low = v.toLowerCase();
    if (low === "null" || low === "undefined" || low === "-" || low === "n/a") return null;
    return v;
  };

  const vendas: PerpetualSaleRow[] = [];
  for (const row of rows) {
    if (hasStatusCol) {
      if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) continue;
      if (txIdx !== -1) {
        const txId = (row[txIdx] ?? "").trim();
        if (txId && refundedTxIds.has(txId)) continue;
      }
    }

    const dia = saleDayKey(row[dataIdx]);
    if (!dia || dia < periodo.inicio || dia > periodo.fim) continue;

    const email = clean(emailIdx, row);
    if (!email) continue;

    const valorBruto = parseNumber(row[brutoIdx]);
    if (valorBruto <= 0) continue;

    vendas.push({
      email,
      dia,
      valorBruto,
      utmSource: clean(sourceIdx, row),
      utmCampaign: clean(campaignIdx, row),
      utmMedium: clean(mediumIdx, row),
      utmContent: clean(contentIdx, row),
      produto: clean(produtoIdx, row),
    });
  }

  return { vendas, hasStatusCol };
}

/** Aceita `119.54` (export do Gerenciador) e `119,54` (export BR) — §C.9. */
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return Number.parseFloat(normalized) || 0;
}

async function loadCampanhaSpend(
  db: Database,
  accessTokenFor: (accountId: string) => Promise<string | null>,
  projectId: string,
  metaAccountId: string | null,
  campaignIds: string[],
  campanhasDoFunil: { id: string; name: string }[],
  periodo: { inicio: string; fim: string },
): Promise<CampaignSpendRow[]> {
  if (campaignIds.length === 0 || !metaAccountId) return [];

  const [account] = await db
    .select({ id: metaAdsAccounts.id, metaAccountId: metaAdsAccounts.metaAccountId })
    .from(metaAdsAccounts)
    .where(eq(metaAdsAccounts.id, metaAccountId))
    .limit(1);
  if (!account) return [];

  const token = await accessTokenFor(account.id);
  if (!token) return [];

  // Passo 1 — AQUECE o cache. Esta chamada faz o refetch do que estiver faltando
  // ou velho e grava em `meta_campaign_insights_daily`. Não usamos o retorno dela
  // para a quebra por campanha: o merge cache+fresh devolve `MetaDailyInsight[]`
  // SEM `campaign_id` (conferido em 2026-07-28: 58 linhas, todas sem o campo).
  // Confiar nesse retorno descartava tudo e o relatório saía com investimento
  // zero — calado, que é o pior modo de errar.
  await fetchCampaignDailyInsightsForIdsWithCache(
    db,
    projectId,
    account.metaAccountId,
    token,
    campaignIds,
    0,
    periodo.inicio,
    periodo.fim,
  );

  // Passo 2 — lê a quebra POR CAMPANHA da tabela, que tem `campaign_id` na PK.
  // É também o que o R-E2 do epic manda: ler do banco.
  const linhas = await db
    .select({
      campaignId: metaCampaignInsightsDaily.campaignId,
      dateStart: metaCampaignInsightsDaily.dateStart,
      spend: metaCampaignInsightsDaily.spend,
    })
    .from(metaCampaignInsightsDaily)
    .where(
      and(
        eq(metaCampaignInsightsDaily.projectId, projectId),
        inArray(metaCampaignInsightsDaily.campaignId, campaignIds),
        gte(metaCampaignInsightsDaily.dateStart, periodo.inicio),
        lte(metaCampaignInsightsDaily.dateStart, periodo.fim),
      ),
    );

  const nomePorId = new Map(campanhasDoFunil.map((c) => [c.id, c.name]));
  const acc = new Map<string, CampaignSpendRow>();

  for (const row of linhas) {
    const spend = Number.parseFloat(row.spend ?? "0") || 0;
    // Gross-up de mídia por DIA: a alíquota só vale a partir de 2026-01-01, e um
    // período pode atravessar essa data.
    const comImposto = applyMetaTax(spend, row.dateStart);

    let entry = acc.get(row.campaignId);
    if (!entry) {
      entry = {
        campaignId: row.campaignId,
        campaignName: nomePorId.get(row.campaignId) ?? row.campaignId,
        spend: 0,
        spendComImposto: 0,
      };
      acc.set(row.campaignId, entry);
    }
    entry.spend += spend;
    entry.spendComImposto += comImposto;
  }

  // Campanha vinculada sem insight no período entra zerada — é o que permite o
  // alerta W-P5 ("gastou e não vendeu") distinguir de "nem apareceu".
  for (const c of campanhasDoFunil) {
    if (!acc.has(c.id)) {
      acc.set(c.id, { campaignId: c.id, campaignName: c.name, spend: 0, spendComImposto: 0 });
    }
  }

  return [...acc.values()];
}

export { shiftDayKey };
