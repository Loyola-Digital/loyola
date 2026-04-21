import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";
import { normaliseDate } from "@/lib/utils/spreadsheet-filters";
import { normalizeEmail } from "@/lib/utils/normalize-answer";

/**
 * utm_source values que classificam um lead como "pago" (vindo de mídia paga).
 * Comparação é case-insensitive — valores da planilha devem ser normalizados
 * com `toLowerCase` antes de consultar este Set.
 */
export const PAID_SOURCES = new Set(["meta", "meta-ads", "google-ads"]);

/**
 * Retorna o value numérico de uma action específica do array `actions[]` do Meta Ads.
 * Usado pra extrair `link_click`, `landing_page_view`, etc.
 */
export function getActionValue(
  actions: { action_type: string; value: string }[] | undefined,
  type: string,
): number {
  if (!actions) return 0;
  const found = actions.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

/**
 * Divisão segura. Retorna null quando o denominador é zero (em vez de Infinity/NaN)
 * pra permitir que a UI exiba "—" sem tratamento especial.
 */
export function safeDivide(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/**
 * Agrega os insights diários de múltiplas campanhas em totais escalares.
 * IMPORTANTE: usa `link_click` (não `clicks` bruto) pra alinhar com a metodologia da Story 18.1.
 */
export function sumMetaInsights(allInsights: CampaignDailyInsight[][]): {
  spend: number;
  impressions: number;
  linkClicks: number;
  lpViews: number;
} {
  let spend = 0;
  let impressions = 0;
  let linkClicks = 0;
  let lpViews = 0;
  for (const insights of allInsights) {
    for (const row of insights) {
      spend += parseFloat(row.spend || "0");
      impressions += parseFloat(row.impressions || "0");
      linkClicks += getActionValue(row.actions, "link_click");
      lpViews += getActionValue(row.actions, "landing_page_view");
    }
  }
  return { spend, impressions, linkClicks, lpViews };
}

/**
 * Categoriza os leads DEDUPLICADOS por e-mail em 3 grupos baseados em `utm_source`:
 *
 * - `leadsPagos`: e-mail único com utm_source ∈ PAID_SOURCES
 * - `leadsOrg`: e-mail único com utm_source preenchido mas não pago
 * - `leadsSemTrack`: e-mail único com utm_source vazio/ausente/não mapeado
 *
 * **IMPORTANTE — DEDUPLICAÇÃO:** E-mail único = 1 lead (primeira ocorrência por categoria).
 * Quando há múltiplas linhas com mesmo e-mail, conta-se apenas 1 por categoria de origem.
 * Leads sem e-mail recebem ID único com base no índice da linha.
 */
export function categorizeLeads(
  rows: FunnelSpreadsheetRow[],
  utmSourceMapped: boolean,
): { leadsPagos: number; leadsOrg: number; leadsSemTrack: number } {
  const seenEmails = { leadsPagos: new Set<string>(), leadsOrg: new Set<string>(), leadsSemTrack: new Set<string>() };

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const email = (row.named.email ?? "").trim();
    const normalizedEmail = email ? normalizeEmail(email) : `__no-email_${idx}`;
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();

    let category: "leadsPagos" | "leadsOrg" | "leadsSemTrack";
    if (!utmSource || !utmSourceMapped) {
      category = "leadsSemTrack";
    } else if (PAID_SOURCES.has(utmSource)) {
      category = "leadsPagos";
    } else {
      category = "leadsOrg";
    }

    seenEmails[category].add(normalizedEmail);
  }

  return {
    leadsPagos: seenEmails.leadsPagos.size,
    leadsOrg: seenEmails.leadsOrg.size,
    leadsSemTrack: seenEmails.leadsSemTrack.size,
  };
}

/**
 * Estrutura de uma linha diária da tabela "Dados diários" (Story 18.3).
 * Cada linha representa um dia; linha com `date === "Total"` é o agregado do período.
 */
export interface DailyRow {
  date: string;
  spend: number;
  linkClicks: number;
  impressions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  lpView: number;
  connectRate: number | null;
  txConv: number | null;
  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  cplPg: number | null;
  cplG: number | null;
  faturamento: number;
}

/**
 * Agrega os insights diários do Meta Ads por data (YYYY-MM-DD).
 * Cada campanha contribui com suas próprias linhas — somamos tudo por dia.
 */
export function aggregateMetaDailyByDate(
  allInsights: CampaignDailyInsight[][],
): Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }> {
  const map = new Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }>();
  for (const insights of allInsights) {
    for (const row of insights) {
      const date = row.date_start.slice(0, 10);
      const existing = map.get(date) ?? { spend: 0, impressions: 0, linkClicks: 0, lpView: 0 };
      existing.spend += parseFloat(row.spend || "0");
      existing.impressions += parseFloat(row.impressions || "0");
      existing.linkClicks += getActionValue(row.actions, "link_click");
      existing.lpView += getActionValue(row.actions, "landing_page_view");
      map.set(date, existing);
    }
  }
  return map;
}

/**
 * Agrega linhas da planilha por data, categorizando cada linha em pagos/org/semTrack.
 * **IMPORTANTE — DEDUPLICAÇÃO:** Por cada data e categoria, conta e-mail único apenas 1x.
 * Leads sem e-mail recebem ID único com base no índice da linha.
 * Recebe `rows` (já filtradas por data, se o caller quiser) em vez do `FunnelSpreadsheetData`
 * inteiro — fica mais flexível.
 */
export function aggregateSpreadsheetByDate(
  rows: FunnelSpreadsheetRow[],
  utmSourceMapped: boolean,
  dateMapped: boolean,
): Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number; faturamento: number }> {
  const map = new Map<string, { seenEmails: { leadsPagos: Set<string>; leadsOrg: Set<string>; leadsSemTrack: Set<string> }; faturamento: number }>();
  if (!dateMapped) return new Map();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const date = normaliseDate(row.named.date);
    if (!date) continue;

    const email = (row.named.email ?? "").trim();
    const normalizedEmail = email ? normalizeEmail(email) : `__no-email_${idx}`;
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    const valueStr = (row.named.value ?? "").trim();
    const value = valueStr ? parseFloat(valueStr.replace(/[^\d.,]/g, "").replace(",", ".")) || 0 : 0;

    let category: "leadsPagos" | "leadsOrg" | "leadsSemTrack";
    if (!utmSource || !utmSourceMapped) {
      category = "leadsSemTrack";
    } else if (PAID_SOURCES.has(utmSource)) {
      category = "leadsPagos";
    } else {
      category = "leadsOrg";
    }

    const dateEntry = map.get(date) ?? {
      seenEmails: { leadsPagos: new Set<string>(), leadsOrg: new Set<string>(), leadsSemTrack: new Set<string>() },
      faturamento: 0,
    };
    dateEntry.seenEmails[category].add(normalizedEmail);
    dateEntry.faturamento += value;
    map.set(date, dateEntry);
  }

  // Converter Sets em counts
  const result = new Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number; faturamento: number }>();
  for (const [date, entry] of map) {
    result.set(date, {
      leadsPagos: entry.seenEmails.leadsPagos.size,
      leadsOrg: entry.seenEmails.leadsOrg.size,
      leadsSemTrack: entry.seenEmails.leadsSemTrack.size,
      faturamento: entry.faturamento,
    });
  }
  return result;
}

/**
 * Cruza os dados agregados do Meta (por data) com os dados da planilha (por data)
 * e produz uma `DailyRow[]` com todas as colunas calculadas (CPM, CPC, CTR, etc).
 * Ordenação: data ascendente.
 */
export function buildDailyRows(
  metaMap: Map<string, { spend: number; impressions: number; linkClicks: number; lpView: number }>,
  sheetMap: Map<string, { leadsPagos: number; leadsOrg: number; leadsSemTrack: number; faturamento: number }>,
): DailyRow[] {
  const allDates = new Set([...metaMap.keys(), ...sheetMap.keys()]);
  const rows: DailyRow[] = [];
  for (const date of allDates) {
    const meta = metaMap.get(date) ?? { spend: 0, impressions: 0, linkClicks: 0, lpView: 0 };
    const sheet = sheetMap.get(date) ?? { leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0, faturamento: 0 };
    const totalLeads = sheet.leadsPagos + sheet.leadsOrg + sheet.leadsSemTrack;
    rows.push({
      date,
      spend: meta.spend,
      linkClicks: meta.linkClicks,
      impressions: meta.impressions,
      cpm: meta.impressions > 0 ? (meta.spend / meta.impressions) * 1000 : 0,
      cpc: safeDivide(meta.spend, meta.linkClicks) ?? 0,
      ctr: meta.impressions > 0 ? (meta.linkClicks / meta.impressions) * 100 : 0,
      lpView: meta.lpView,
      connectRate: meta.linkClicks > 0 ? (meta.lpView / meta.linkClicks) * 100 : null,
      txConv: meta.linkClicks > 0 ? (sheet.leadsPagos / meta.linkClicks) * 100 : null,
      leadsPagos: sheet.leadsPagos,
      leadsOrg: sheet.leadsOrg,
      leadsSemTrack: sheet.leadsSemTrack,
      cplPg: safeDivide(meta.spend, sheet.leadsPagos),
      cplG: safeDivide(meta.spend, totalLeads),
      faturamento: sheet.faturamento,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rows;
}

/**
 * Calcula a linha de total agregando todas as linhas diárias.
 * Retorna uma `DailyRow` com `date === "Total"` pra usar no footer da tabela.
 */
export function computeTotals(rows: DailyRow[]): DailyRow {
  const t = rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.linkClicks += r.linkClicks;
      acc.impressions += r.impressions;
      acc.lpView += r.lpView;
      acc.leadsPagos += r.leadsPagos;
      acc.leadsOrg += r.leadsOrg;
      acc.leadsSemTrack += r.leadsSemTrack;
      acc.faturamento += r.faturamento;
      return acc;
    },
    { spend: 0, linkClicks: 0, impressions: 0, lpView: 0, leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0, faturamento: 0 },
  );
  const totalLeads = t.leadsPagos + t.leadsOrg + t.leadsSemTrack;
  return {
    date: "Total",
    spend: t.spend,
    linkClicks: t.linkClicks,
    impressions: t.impressions,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
    cpc: safeDivide(t.spend, t.linkClicks) ?? 0,
    ctr: t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : 0,
    lpView: t.lpView,
    connectRate: t.linkClicks > 0 ? (t.lpView / t.linkClicks) * 100 : null,
    txConv: t.linkClicks > 0 ? (t.leadsPagos / t.linkClicks) * 100 : null,
    leadsPagos: t.leadsPagos,
    leadsOrg: t.leadsOrg,
    leadsSemTrack: t.leadsSemTrack,
    cplPg: safeDivide(t.spend, t.leadsPagos),
    cplG: safeDivide(t.spend, totalLeads),
    faturamento: t.faturamento,
  };
}
