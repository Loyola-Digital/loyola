import { eq, and, isNotNull, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  funnelSurveys,
  funnelSpreadsheets,
  stageLeadScoringSchemas,
  funnelStages,
  funnels,
  publicMetricsCache,
} from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import {
  classifyOrigem,
  classifyTemperatura,
  classifyCanal,
  normalizeEmail,
  phoneTail,
  type Origem,
  type Temperatura,
  type Canal,
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
  // Brief v6 #5 (FZ/LGPD): "email_sha256" ANTES de "email" — planilha com as
  // duas colunas (email vazio por LGPD + hash preenchido) resolve pro hash.
  // O dedup não exige formato de e-mail: qualquer valor estável serve de chave.
  email: ["emailsha256", "emailhash", "hashemail", "email", "e-mail", "emaillead", "enderecodeemail"],
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

/**
 * Story 36.9 (AC4) — resolve o índice de uma coluna dando precedência ao
 * `column_mapping` configurado, com os `ALIASES` como rede.
 *
 * O mapeamento foi preenchido por alguém que sabia qual coluna era qual;
 * heurística sobre header é o palpite que se usa na ausência dele. Ex.: a
 * planilha `n8n-kiwify-captação` mapeia `utm_source` para a coluna literalmente
 * chamada `s=` — nenhum alias acharia isso.
 */
function resolveColIdx(headers: string[], mapped: string | undefined, aliases: string[]): number {
  if (mapped) {
    const i = headers.map(norm).indexOf(norm(mapped));
    if (i >= 0) return i;
  }
  return findColIdx(headers, aliases);
}

/**
 * Story 36.9 (AC3) — de onde os números desta etapa vieram.
 *
 * Sem isto, dois números com significados diferentes chegam com a mesma forma a
 * quem consome: contar pela pesquisa é contar **quem respondeu**, subconjunto de
 * quem virou lead.
 */
export type LeadSourceKind = "lead_scoring" | "pesquisa" | "planilha_leads";

interface SheetRef {
  spreadsheetId: string;
  sheetName: string;
  label: string;
  columnMapping: Record<string, string | undefined> | null;
}

interface LeadSource {
  kind: LeadSourceKind;
  sheets: SheetRef[];
}

/**
 * Story 36.9 (AC1) — qual planilha alimenta o `leads-summary` desta etapa.
 *
 * **Precedência, e por que a planilha de leads vem por último:** o diagnóstico de
 * 2026-08-15 mostrou que 4 etapas em produção já computam este cache a partir da
 * pesquisa. Promover a planilha de leads acima delas trocaria o denominador de
 * relatórios já apresentados — decisão tomada de restringir esta story à
 * elegibilidade (o que destrava a etapa do chamado, que não tem pesquisa) e
 * deixar a precedência para story própria, com o delta na mão.
 *
 * Ou seja: nenhuma etapa que já produz cache muda de fonte aqui.
 */
export async function resolveLeadSource(db: Database, stageId: string): Promise<LeadSource | null> {
  const [scoring] = await db
    .select({ surveyId: stageLeadScoringSchemas.surveyId })
    .from(stageLeadScoringSchemas)
    .where(eq(stageLeadScoringSchemas.stageId, stageId))
    .limit(1);

  const surveyCols = {
    spreadsheetId: funnelSurveys.spreadsheetId,
    sheetName: funnelSurveys.sheetName,
  };

  if (scoring?.surveyId) {
    const [s] = await db
      .select(surveyCols)
      .from(funnelSurveys)
      .where(eq(funnelSurveys.id, scoring.surveyId))
      .limit(1);
    if (s) {
      return {
        kind: "lead_scoring",
        sheets: [{ ...s, label: "Lead Scoring", columnMapping: null }],
      };
    }
  }

  const [survey] = await db
    .select(surveyCols)
    .from(funnelSurveys)
    .where(eq(funnelSurveys.stageId, stageId))
    .limit(1);
  if (survey) {
    return { kind: "pesquisa", sheets: [{ ...survey, label: "Pesquisa", columnMapping: null }] };
  }

  // Story 36.9 (AC1): os LEADS POPUP vivem aqui, e o sync nunca consultou esta
  // tabela — era essa a causa do `semDados`, não o sync não ter rodado.
  const sheets = await db
    .select({
      spreadsheetId: funnelSpreadsheets.spreadsheetId,
      sheetName: funnelSpreadsheets.sheetName,
      label: funnelSpreadsheets.label,
      columnMapping: funnelSpreadsheets.columnMapping,
    })
    .from(funnelSpreadsheets)
    .where(and(eq(funnelSpreadsheets.stageId, stageId), eq(funnelSpreadsheets.type, "leads")));

  // Uma etapa pode ter MAIS DE UMA planilha de leads (`bbe-pr1-mar-26` tem duas).
  // Decisão de 2026-08-15: somar todas, deduplicando entre elas, e declarar as
  // fontes no payload — somar sem dizer de onde veio produziria um total que
  // ninguém consegue explicar.
  if (sheets.length > 0) {
    return { kind: "planilha_leads", sheets };
  }

  return null;
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
  /**
   * Story 36.9 (AC3): de onde estes números vieram. `pesquisa`/`lead_scoring`
   * contam **quem respondeu a pesquisa** — subconjunto de quem virou lead;
   * `planilha_leads` conta os leads. Mesma forma, significados diferentes.
   */
  fonte: LeadSourceKind;
  /**
   * Story 36.9: as planilhas somadas e quanto cada uma contribuiu. Uma etapa pode
   * ter mais de uma planilha de leads; sem esta lista o total não é auditável.
   * `leads` aqui é a contagem BRUTA de cada planilha — a soma pode exceder
   * `uniqueLeads`, que deduplica entre elas.
   */
  fontes: { label: string; sheetName: string; leads: number }[];
  totalLeads: number;
  uniqueLeads: number;
  byOrigin: { origem: Origem; leads: number; uniqueLeads: number }[];
  byTemperature: { temperatura: Temperatura; leads: number; uniqueLeads: number }[];
  byOriginTemp: { origem: Origem; temperatura: Temperatura; leads: number; uniqueLeads: number }[];
  /** Story 39.3: canal NOMEADO (Closer, WhatsApp, ManyChat, Instagram, Meta/Google
   * Ads, E-mail, YouTube, Outros, Sem Track) por utm_source+utm_medium — os canais
   * finos que os 3 baldes de byOrigin escondem. */
  byCanal: { canal: Canal; leads: number; uniqueLeads: number }[];
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
  // Elegibilidade (Resumão v4 #1 + Story 36.9 AC1): Lead Scoring > pesquisa >
  // planilha de leads. Ver `resolveLeadSource` para por que a planilha vem por
  // último — preservar a fonte das etapas que já produzem cache é deliberado.
  const source = await resolveLeadSource(db, stageId);
  if (!source) return null;

  const cell = (row: string[], i: number): string => (i >= 0 ? (row[i] ?? "").trim() : "");

  const globalKeys = new Set<string>();
  const byOrigin = new Map<Origem, Bucket>();
  const byTemp = new Map<Temperatura, Bucket>();
  const byOT = new Map<string, Bucket>();
  const byCanal = new Map<Canal, Bucket>();
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

  // `columnsResolved` agregado: com mais de uma planilha, um campo conta como
  // resolvido se ALGUMA delas o resolveu.
  const resolved = {
    utmSource: false, utmTerm: false, utmMedium: false,
    utmContent: false, utmCampaign: false, email: false, phone: false,
  };
  const fontes: { label: string; sheetName: string; leads: number }[] = [];

  for (const ref of source.sheets) {
    let sheet: { headers: string[]; rows: string[][] };
    try {
      const res = await readSheetData(ref.spreadsheetId, ref.sheetName);
      sheet = { headers: res.headers, rows: res.rows };
    } catch {
      // AC7: planilha ilegível não derruba as outras da mesma etapa. Ela some da
      // lista `fontes`, que é como quem consome percebe a ausência.
      continue;
    }

    // AC4: `column_mapping` explícito primeiro, ALIASES como rede.
    const m = ref.columnMapping ?? {};
    const idx = {
      utmSource: resolveColIdx(sheet.headers, m.utm_source, ALIASES.utmSource),
      utmTerm: resolveColIdx(sheet.headers, m.utm_term, ALIASES.utmTerm),
      utmMedium: resolveColIdx(sheet.headers, m.utm_medium, ALIASES.utmMedium),
      utmContent: resolveColIdx(sheet.headers, m.utm_content, ALIASES.utmContent),
      utmCampaign: resolveColIdx(sheet.headers, m.utm_campaign, ALIASES.utmCampaign),
      email: resolveColIdx(sheet.headers, m.email, ALIASES.email),
      phone: resolveColIdx(sheet.headers, m.phone, ALIASES.phone),
      date: resolveColIdx(sheet.headers, m.date, ALIASES.date),
    };
    resolved.utmSource ||= idx.utmSource >= 0;
    resolved.utmTerm ||= idx.utmTerm >= 0;
    resolved.utmMedium ||= idx.utmMedium >= 0;
    resolved.utmContent ||= idx.utmContent >= 0;
    resolved.utmCampaign ||= idx.utmCampaign >= 0;
    resolved.email ||= idx.email >= 0;
    resolved.phone ||= idx.phone >= 0;

    fontes.push({ label: ref.label, sheetName: ref.sheetName, leads: sheet.rows.length });

    for (const row of sheet.rows) {
      total++;
      const origem = classifyOrigem(cell(row, idx.utmSource));
      const temperatura = classifyTemperatura(cell(row, idx.utmTerm));
      const email = normalizeEmail(cell(row, idx.email));
      const phone = phoneTail(cell(row, idx.phone));
      if (email) emailFilled++;
      if (phone) phoneFilled++;
      const key = email || phone || null;
      // Dedupe GLOBAL, não por planilha: o mesmo lead nas duas conta uma vez.
      if (key) globalKeys.add(key);

      bump(byOrigin as Map<string, Bucket>, origem, key);
      bump(byTemp as Map<string, Bucket>, temperatura, key);
      bump(byOT, `${origem}|${temperatura}`, key);
      bump(byCanal as Map<string, Bucket>, classifyCanal(cell(row, idx.utmSource), cell(row, idx.utmMedium)), key);

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
  }

  // Todas as planilhas da etapa falharam na leitura: é ausência de dado, não
  // zero leads. Devolver o payload zerado faria "não consegui ler" parecer
  // "ninguém se cadastrou".
  if (fontes.length === 0) return null;

  return {
    range: { from: minDate, to: maxDate },
    fonte: source.kind,
    fontes,
    totalLeads: total,
    uniqueLeads: globalKeys.size,
    byOrigin: [...byOrigin.entries()].map(([origem, b]) => ({ origem, leads: b.leads, uniqueLeads: b.keys.size })),
    byTemperature: [...byTemp.entries()].map(([temperatura, b]) => ({ temperatura, leads: b.leads, uniqueLeads: b.keys.size })),
    byOriginTemp: [...byOT.entries()].map(([k, b]) => {
      const [origem, temperatura] = k.split("|") as [Origem, Temperatura];
      return { origem, temperatura, leads: b.leads, uniqueLeads: b.keys.size };
    }),
    byCanal: [...byCanal.entries()]
      .map(([canal, b]) => ({ canal, leads: b.leads, uniqueLeads: b.keys.size }))
      .sort((a, b) => b.leads - a.leads),
    identifiersFilled: { email: emailFilled, phone: phoneFilled },
    byUtm: {
      source: topCounts(utmCounts.source),
      medium: topCounts(utmCounts.medium),
      campaign: topCounts(utmCounts.campaign),
      content: topCounts(utmCounts.content),
      term: topCounts(utmCounts.term),
    },
    columnsResolved: { ...resolved },
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
  const scoringRows = await db
    .select({ stageId: stageLeadScoringSchemas.stageId, projectId: funnels.projectId })
    .from(stageLeadScoringSchemas)
    .innerJoin(funnelStages, eq(funnelStages.id, stageLeadScoringSchemas.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(
      opts.projectIds && opts.projectIds.length > 0
        ? and(baseWhere, inArray(funnels.projectId, opts.projectIds))
        : baseWhere,
    );

  // Resumão v4 #1: também elegíveis as etapas com pesquisa conectada (sem
  // exigir Lead Scoring) — antes 100% delas devolviam semDados.
  const surveyBase = isNotNull(funnelSurveys.stageId);
  const surveyRows = await db
    .selectDistinct({ stageId: funnelSurveys.stageId, projectId: funnels.projectId })
    .from(funnelSurveys)
    .innerJoin(funnelStages, eq(funnelStages.id, funnelSurveys.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(
      opts.projectIds && opts.projectIds.length > 0
        ? and(surveyBase, inArray(funnels.projectId, opts.projectIds))
        : surveyBase,
    );

  // Story 36.9 (AC1): terceira fonte — etapas com planilha de LEADS conectada.
  // Elas nunca entraram nesta lista, e por isso devolviam `semDados` sem erro
  // nenhum no log: a etapa simplesmente não aparecia. É por isso que "rodar o
  // sync" não resolvia o item 4 do chamado de 2026-08-14.
  const leadsBase = and(
    isNotNull(funnelSpreadsheets.stageId),
    eq(funnelSpreadsheets.type, "leads"),
  );
  const leadSheetRows = await db
    .selectDistinct({ stageId: funnelSpreadsheets.stageId, projectId: funnels.projectId })
    .from(funnelSpreadsheets)
    .innerJoin(funnelStages, eq(funnelStages.id, funnelSpreadsheets.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(
      opts.projectIds && opts.projectIds.length > 0
        ? and(leadsBase, inArray(funnels.projectId, opts.projectIds))
        : leadsBase,
    );

  const byStage = new Map<string, string>();
  for (const r of scoringRows) byStage.set(r.stageId, r.projectId);
  for (const r of surveyRows) if (r.stageId) byStage.set(r.stageId, r.projectId);
  for (const r of leadSheetRows) if (r.stageId) byStage.set(r.stageId, r.projectId);
  const rows = [...byStage.entries()].map(([stageId, projectId]) => ({ stageId, projectId }));

  for (const { stageId, projectId } of rows) {
    try {
      const payload = await computeLeadOriginForStage(db, stageId);
      if (!payload) {
        summary.stagesSkipped++;
        continue;
      }
      await upsertLeadOriginCache(db, projectId, stageId, payload);
      summary.stagesProcessed++;
      log(
        `[lead-origin] stage ${stageId}: ${payload.totalLeads} leads, ${payload.uniqueLeads} únicos ` +
          `(fonte: ${payload.fonte}${payload.fontes.length > 1 ? `, ${payload.fontes.length} planilhas` : ""})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ stageId, error: msg });
      log(`[lead-origin] ERRO stage ${stageId}: ${msg}`);
    }
  }
  return summary;
}
