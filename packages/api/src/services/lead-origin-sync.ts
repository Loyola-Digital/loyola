import { eq, and, isNotNull, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  funnelSurveys,
  stageLeadScoringSchemas,
  funnelStages,
  funnels,
  publicMetricsCache,
} from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import {
  classifyOrigem,
  classifyTemperatura,
  normalizeEmail,
  phoneTail,
  type Origem,
  type Temperatura,
} from "../utils/lead-origin.js";

/**
 * Story 36.7 (Buraco 2): pré-computa os splits de leads por origem (Pago/Orgânico/
 * Sem Track) × temperatura (quente/frio) + leads únicos, a partir da planilha de
 * pesquisa do stage (funnelSurveys), e grava no public_metrics_cache (scope
 * "leads-origin", key = stageId). Só agregados — ZERO PII.
 */

const SCOPE = "leads-origin";

const ALIASES: Record<string, string[]> = {
  utmSource: ["utm_source", "utmsource", "fonte", "source", "origem"],
  utmTerm: ["utm_term", "utmterm", "termo", "term"],
  // Story 39.2 (auditoria Tier 2.1): sem estas 3 o classificador não acha
  // Closer nem separa Quente/Frio pela campanha.
  utmMedium: ["utm_medium", "utmmedium", "medium", "midia", "medio"],
  utmContent: ["utm_content", "utmcontent", "content", "conteudo", "criativo"],
  utmCampaign: ["utm_campaign", "utmcampaign", "campaign", "campanha"],
  email: ["email", "e-mail", "emaillead", "enderecodeemail"],
  phone: ["telefone", "phone", "whatsapp", "celular", "fone", "tel", "whats", "numero"],
  date: ["data", "date", "timestamp", "carimbodedatahora", "carimbodedata", "datadecadastro", "datahora", "createdat"],
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Resolve o índice de uma coluna por aliases (exact normalizado, depois contains). */
function findColIdx(headers: string[], aliases: string[]): number {
  const H = headers.map(norm);
  for (const a of aliases) {
    const na = norm(a);
    const i = H.indexOf(na);
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const na = norm(a);
    const i = H.findIndex((h) => h.length > 2 && (h.includes(na) || na.includes(h)));
    if (i >= 0) return i;
  }
  return -1;
}

interface Bucket {
  leads: number;
  keys: Set<string>;
}
function emptyBucket(): Bucket {
  return { leads: 0, keys: new Set() };
}

export interface LeadOriginPayload {
  range: { from: string | null; to: string | null };
  totalLeads: number;
  uniqueLeads: number;
  byOrigin: { origem: Origem; leads: number; uniqueLeads: number }[];
  byTemperature: { temperatura: Temperatura; leads: number; uniqueLeads: number }[];
  byOriginTemp: { origem: Origem; temperatura: Temperatura; leads: number; uniqueLeads: number }[];
  /** Quantas linhas têm o identificador PREENCHIDO — explica uniqueLeads baixo/0
   * (cabeçalho pode existir mas os valores estarem vazios na planilha). */
  identifiersFilled: { email: number; phone: number };
  /** Story 39.2: distribuição de leads por valor de cada UTM (top 30 + "(outros)";
   * vazio vira "(vazio)"). Matéria-prima do classificador fino (Closer, IG, WPP...). */
  byUtm: {
    source: { value: string; leads: number }[];
    medium: { value: string; leads: number }[];
    campaign: { value: string; leads: number }[];
    content: { value: string; leads: number }[];
    term: { value: string; leads: number }[];
  };
  columnsResolved: {
    utmSource: boolean;
    utmTerm: boolean;
    utmMedium: boolean;
    utmContent: boolean;
    utmCampaign: boolean;
    email: boolean;
    phone: boolean;
  };
}

/** Normaliza data da célula pra YYYY-MM-DD (aceita DD/MM/YYYY e ISO). */
function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Top-N valores por contagem; o resto colapsa em "(outros)". */
function topCounts(map: Map<string, number>, top = 30): { value: string; leads: number }[] {
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const head = entries.slice(0, top).map(([value, leads]) => ({ value, leads }));
  const rest = entries.slice(top).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) head.push({ value: "(outros)", leads: rest });
  return head;
}

/**
 * Computa o payload de leads por origem de um stage. Retorna null se o stage não
 * tem survey/planilha configurada. Dedup: chave = e-mail normalizado, senão
 * últimos 8 dígitos do telefone (lead sem nenhum identificador não entra em únicos).
 */
export async function computeLeadOriginForStage(
  db: Database,
  stageId: string,
): Promise<LeadOriginPayload | null> {
  const [scoring] = await db
    .select({ surveyId: stageLeadScoringSchemas.surveyId })
    .from(stageLeadScoringSchemas)
    .where(eq(stageLeadScoringSchemas.stageId, stageId))
    .limit(1);
  if (!scoring?.surveyId) return null;

  const [survey] = await db
    .select({
      spreadsheetId: funnelSurveys.spreadsheetId,
      sheetName: funnelSurveys.sheetName,
    })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.id, scoring.surveyId))
    .limit(1);
  if (!survey) return null;

  let sheet: { headers: string[]; rows: string[][] };
  try {
    const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
    sheet = { headers: res.headers, rows: res.rows };
  } catch {
    return null;
  }

  const idx = {
    utmSource: findColIdx(sheet.headers, ALIASES.utmSource),
    utmTerm: findColIdx(sheet.headers, ALIASES.utmTerm),
    utmMedium: findColIdx(sheet.headers, ALIASES.utmMedium),
    utmContent: findColIdx(sheet.headers, ALIASES.utmContent),
    utmCampaign: findColIdx(sheet.headers, ALIASES.utmCampaign),
    email: findColIdx(sheet.headers, ALIASES.email),
    phone: findColIdx(sheet.headers, ALIASES.phone),
    date: findColIdx(sheet.headers, ALIASES.date),
  };

  const cell = (row: string[], i: number): string => (i >= 0 ? (row[i] ?? "").trim() : "");

  const globalKeys = new Set<string>();
  const byOrigin = new Map<Origem, Bucket>();
  const byTemp = new Map<Temperatura, Bucket>();
  const byOT = new Map<string, Bucket>();
  // Story 39.2: contagens cruas por valor de UTM (base do classificador fino).
  const utmCounts = {
    source: new Map<string, number>(),
    medium: new Map<string, number>(),
    campaign: new Map<string, number>(),
    content: new Map<string, number>(),
    term: new Map<string, number>(),
  };
  const bumpUtm = (map: Map<string, number>, raw: string) => {
    const v = raw.toLowerCase() || "(vazio)";
    map.set(v, (map.get(v) ?? 0) + 1);
  };
  let total = 0;
  let emailFilled = 0;
  let phoneFilled = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  const bump = (map: Map<string, Bucket>, k: string, key: string | null) => {
    let b = map.get(k);
    if (!b) {
      b = emptyBucket();
      map.set(k, b);
    }
    b.leads++;
    if (key) b.keys.add(key);
  };

  for (const row of sheet.rows) {
    total++;
    const origem = classifyOrigem(cell(row, idx.utmSource));
    const temperatura = classifyTemperatura(cell(row, idx.utmTerm));
    const email = normalizeEmail(cell(row, idx.email));
    const phone = phoneTail(cell(row, idx.phone));
    if (email) emailFilled++;
    if (phone) phoneFilled++;
    const key = email || phone || null;
    if (key) globalKeys.add(key);

    bump(byOrigin as Map<string, Bucket>, origem, key);
    bump(byTemp as Map<string, Bucket>, temperatura, key);
    bump(byOT, `${origem}|${temperatura}`, key);

    bumpUtm(utmCounts.source, cell(row, idx.utmSource));
    bumpUtm(utmCounts.medium, cell(row, idx.utmMedium));
    bumpUtm(utmCounts.campaign, cell(row, idx.utmCampaign));
    bumpUtm(utmCounts.content, cell(row, idx.utmContent));
    bumpUtm(utmCounts.term, cell(row, idx.utmTerm));

    // Range em ISO: a planilha usa DD/MM/YYYY — comparar a string crua invertia
    // o min/max ("01/06" < "31/05" lexicográfico). Normaliza antes de comparar.
    const d = toIsoDate(cell(row, idx.date));
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
  }

  return {
    range: { from: minDate, to: maxDate },
    totalLeads: total,
    uniqueLeads: globalKeys.size,
    byOrigin: [...byOrigin.entries()].map(([origem, b]) => ({ origem, leads: b.leads, uniqueLeads: b.keys.size })),
    byTemperature: [...byTemp.entries()].map(([temperatura, b]) => ({ temperatura, leads: b.leads, uniqueLeads: b.keys.size })),
    byOriginTemp: [...byOT.entries()].map(([k, b]) => {
      const [origem, temperatura] = k.split("|") as [Origem, Temperatura];
      return { origem, temperatura, leads: b.leads, uniqueLeads: b.keys.size };
    }),
    identifiersFilled: { email: emailFilled, phone: phoneFilled },
    byUtm: {
      source: topCounts(utmCounts.source),
      medium: topCounts(utmCounts.medium),
      campaign: topCounts(utmCounts.campaign),
      content: topCounts(utmCounts.content),
      term: topCounts(utmCounts.term),
    },
    columnsResolved: {
      utmSource: idx.utmSource >= 0,
      utmTerm: idx.utmTerm >= 0,
      utmMedium: idx.utmMedium >= 0,
      utmContent: idx.utmContent >= 0,
      utmCampaign: idx.utmCampaign >= 0,
      email: idx.email >= 0,
      phone: idx.phone >= 0,
    },
  };
}

/** Grava o payload no cache (upsert por projectId+scope+stageId). */
export async function upsertLeadOriginCache(
  db: Database,
  projectId: string,
  stageId: string,
  payload: LeadOriginPayload,
): Promise<void> {
  await db
    .insert(publicMetricsCache)
    .values({ projectId, scope: SCOPE, key: stageId, payload, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [publicMetricsCache.projectId, publicMetricsCache.scope, publicMetricsCache.key],
      set: { payload, computedAt: new Date() },
    });
}

export const LEAD_ORIGIN_SCOPE = SCOPE;

export interface LeadOriginSyncSummary {
  stagesProcessed: number;
  stagesSkipped: number;
  errors: { stageId: string; error: string }[];
}

/**
 * Job: recomputa o cache de leads-por-origem para todos os stages com survey
 * configurado (opcionalmente filtrado por projectIds). Falha de um stage não
 * derruba os outros.
 */
export async function syncLeadOrigin(
  db: Database,
  opts: { projectIds?: string[]; log?: (msg: string) => void } = {},
): Promise<LeadOriginSyncSummary> {
  const log = opts.log ?? (() => {});
  const summary: LeadOriginSyncSummary = { stagesProcessed: 0, stagesSkipped: 0, errors: [] };

  const baseWhere = isNotNull(stageLeadScoringSchemas.surveyId);
  const rows = await db
    .select({ stageId: stageLeadScoringSchemas.stageId, projectId: funnels.projectId })
    .from(stageLeadScoringSchemas)
    .innerJoin(funnelStages, eq(funnelStages.id, stageLeadScoringSchemas.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(
      opts.projectIds && opts.projectIds.length > 0
        ? and(baseWhere, inArray(funnels.projectId, opts.projectIds))
        : baseWhere,
    );

  for (const { stageId, projectId } of rows) {
    try {
      const payload = await computeLeadOriginForStage(db, stageId);
      if (!payload) {
        summary.stagesSkipped++;
        continue;
      }
      await upsertLeadOriginCache(db, projectId, stageId, payload);
      summary.stagesProcessed++;
      log(`[lead-origin] stage ${stageId}: ${payload.totalLeads} leads, ${payload.uniqueLeads} únicos`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ stageId, error: msg });
      log(`[lead-origin] ERRO stage ${stageId}: ${msg}`);
    }
  }
  return summary;
}
