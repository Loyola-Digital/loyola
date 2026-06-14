// Story 18.32: Refactor Medium (Adset) + Content (Ad) matching
// TODO AC2: Implement Medium (Adset) matching - fetch adsets from Meta API, match utm_medium IDs with adset_id, group by adset_name
// TODO AC3: Implement Content (Ad) matching - fetch ads from Meta API, match utm_content IDs with ad_id, group by ad_name
// Pattern reference: /packages/api/src/routes/stage-creative-performance.ts lines 321-385 (grouping by name, not ID)
// Current implementation: porUtmMedium and porUtmTerm are basic aggregates - need refactor to fetch Meta entities and group by name

import { z } from "zod";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageSalesSpreadsheets,
  funnelStages,
  funnels,
  projects,
  projectMembers,
  metaAdsAccountProjects,
  metaAdsAccounts,
  metaEntityNamesCache,
  manualSales,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import {
  decryptAccountToken,
  resolveEntityNames,
  type MetaEntityType,
  type ResolveEntityNamesCacheAdapter,
} from "../services/meta-ads.js";

// Story 28.7 / 18.37: TTL do cache de nomes Meta (ad/adset/campaign). Names são
// MUITO estáveis (criativo raramente muda de nome após criado). TTL longo (30d)
// evita re-consultar a Meta a cada 24h e estourar o rate limit no tier
// development — o refresh de nomes vem do backfill (scripts/backfill-meta-names.mjs),
// que puxa a conta inteira em ~17 chamadas em vez de ID-por-ID.
const META_NAMES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  // Story 18.38: aceita um subtype único OU CSV (ex.: "main_product,tmb") pro
  // endpoint principal agregar Produto Principal + TMB numa resposta só. Os
  // endpoints single-subtype (sales-conversion) seguem mandando valor único.
  subtype: z.string().default("capture"),
  days: z.coerce.number().int().positive().optional(),
  // Story 28.4: quando `1`, response inclui campo `debug` com counters de instrumentação
  debug: z.coerce.boolean().optional(),
});

const VALID_SUBTYPES = new Set(["capture", "main_product", "sales", "tmb"]);
/** Parseia `subtype` (único ou CSV) em lista validada. Fallback ["capture"]. */
function parseSubtypes(raw: string): string[] {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_SUBTYPES.has(s));
  return list.length > 0 ? list : ["capture"];
}

// ============================================================
// HELPERS
// ============================================================

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  // Remove R$, espaços e qualquer coisa que não seja dígito, ponto ou vírgula
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  // Detecta formato pt-BR (vírgula como decimal): "6.000,00" → 6000.00
  // Formato US (ponto como decimal): "6000.00" → 6000.00
  // Heurística: se tem vírgula, ela é o separador decimal; pontos são milhares.
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".") // pt-BR: remove pontos, vírgula → ponto
    : cleaned; // sem vírgula: assume já tá em formato US
  return parseFloat(normalized) || 0;
}

/**
 * Story 28.7 hotfix (19/05): planilhas as vezes carregam UTMs com strings
 * literais "null", "undefined", "-", "n/a" — vindas de bugs de tracking ou
 * sync ETL. Trata como ausente (null) pra evitar bucket vazio no agregado.
 */
function sanitizeUtmValue(val: string | undefined | null): string | null {
  if (val == null) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "-" || lower === "n/a" || lower === "na") return null;
  return trimmed;
}

/**
 * utm_source que identificam tráfego PAGO (Meta Ads / Google Ads). O tracking
 * da Loyola grava valores variados conforme a integração: o n8n→Kiwify usa
 * "meta", enquanto UTMs gerados direto pela plataforma usam "meta-ads". Cobrimos
 * os dois + variações (facebook/fb/google) pra não zerar o ROAS. Comparação é
 * case-insensitive e sobre o valor sanitizado (trim/lower aplicados no caller).
 */
const PAID_UTM_SOURCES = new Set([
  "meta",
  "meta-ads",
  "facebook",
  "fb",
  "google",
  "google-ads",
]);

/**
 * Classifica a origem da venda pela utm_source pra separar tráfego PAGO do
 * orgânico no cálculo de ROAS/CPV (que devem refletir só o que o spend gerou):
 *   - utm_source em PAID_UTM_SOURCES (meta/google/etc) → Pago
 *   - utm_source preenchida com qualquer outro valor → Orgânico
 *   - utm_source vazia (null após sanitize) → Sem Track
 * `utmSource` já vem sanitizado (sanitizeUtmValue), então null = ausente.
 */
function classifyFonte(utmSource: string | null): "Pago" | "Orgânico" | "Sem Track" {
  if (!utmSource) return "Sem Track";
  const normalized = utmSource.trim().toLowerCase();
  if (PAID_UTM_SOURCES.has(normalized)) return "Pago";
  return "Orgânico";
}

function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const dd = parseInt(d, 10);
    const mm = parseInt(m, 10);
    const yy = parseInt(y, 10);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

const EMPTY_RESPONSE = {
  totalVendas: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  ticketMedioBruto: 0,
  ticketMedioLiquido: 0,
  ticketMedioPago: 0,
  ticketMedioOrganico: 0,
  ticketMedioSemTrack: 0,
  porCanal: [] as { canal: string; vendas: number; bruto: number; liquido: number }[],
  porFormaPagamento: [] as { forma: string; vendas: number; bruto: number; liquido: number }[],
  porUtmSource: [] as { fonte: string; vendas: number; bruto: number; liquido: number }[],
  porUtmMedium: [] as { medium: string; vendas: number; bruto: number; liquido: number }[],
  porUtmTerm: [] as { term: string; vendas: number; bruto: number; liquido: number }[],
  porUtmContent: [] as { content: string; vendas: number; bruto: number; liquido: number }[],
  semDados: true,
};

// ============================================================
// ROUTE
// ============================================================

export default fp(async function stageSalesDataRoutes(fastify) {
  /**
   * Story 28.7: Adapter de cache de nomes Meta. Encapsula leitura/escrita do
   * `meta_entity_names_cache` com TTL aplicado. Retornado pra cada `(projectId,
   * entityType)` — o `resolveEntityNames` chama load/save sem saber de Drizzle.
   */
  function makeMetaNamesCacheAdapter(
    projectId: string,
    entityType: MetaEntityType,
  ): ResolveEntityNamesCacheAdapter {
    return {
      async loadCached(ids: string[]) {
        if (ids.length === 0) return [];
        const cutoff = new Date(Date.now() - META_NAMES_CACHE_TTL_MS);
        const rows = await fastify.db
          .select({
            entityId: metaEntityNamesCache.entityId,
            entityName: metaEntityNamesCache.entityName,
          })
          .from(metaEntityNamesCache)
          .where(
            and(
              eq(metaEntityNamesCache.projectId, projectId),
              eq(metaEntityNamesCache.entityType, entityType),
              inArray(metaEntityNamesCache.entityId, ids),
              gte(metaEntityNamesCache.lastSyncedAt, cutoff),
            ),
          );
        return rows;
      },
      async saveToCache(entries) {
        if (entries.length === 0) return;
        await fastify.db
          .insert(metaEntityNamesCache)
          .values(
            entries.map((e) => ({
              projectId,
              entityType,
              entityId: e.entityId,
              entityName: e.entityName,
              lastSyncedAt: new Date(),
            })),
          )
          .onConflictDoUpdate({
            target: [
              metaEntityNamesCache.projectId,
              metaEntityNamesCache.entityType,
              metaEntityNamesCache.entityId,
            ],
            set: {
              entityName: sql`EXCLUDED.entity_name`,
              lastSyncedAt: sql`EXCLUDED.last_synced_at`,
            },
          });
      },
    };
  }

  /**
   * Story 28.7: pega o access token Meta do projeto. Retorna null se projeto
   * não tem conta Meta vinculada — caller deve degradar gracefully (sem
   * resolver names, fallback id puro).
   */
  async function getProjectMetaToken(projectId: string): Promise<string | null> {
    const [link] = await fastify.db
      .select({ accountId: metaAdsAccountProjects.accountId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.projectId, projectId))
      .limit(1);
    if (!link) return null;
    const [account] = await fastify.db
      .select()
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, link.accountId))
      .limit(1);
    if (!account) return null;
    try {
      return decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);
    } catch {
      return null;
    }
  }

  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id, stageType: funnelStages.stageType })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      if (stage.stageType !== "paid" && stage.stageType !== "sales") {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      // Para subtype 'sales' uma stage pode ter N planilhas; busca todas e
      // agrega. Pra capture/main_product há no máximo 1 planilha. Story 18.38:
      // subtype pode ser CSV ("main_product,tmb") → agrega múltiplos subtypes.
      const requestedSubtypes = parseSubtypes(query.data.subtype);
      const spreadsheets = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            inArray(stageSalesSpreadsheets.subtype, requestedSubtypes)
          )
        );

      if (spreadsheets.length === 0) {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      let cutoffDate: Date | null = null;
      if (query.data.days) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - query.data.days);
      }

      // emailMap usa chave composta (spreadsheetId|<email|tx>|<value>) — mesma
      // pessoa em planilhas diferentes vira 2 vendas separadas; quando
      // `transactionId` está mapeado (Story 28.4) deduplicamos por transação
      // (resolve recompras Kiwify), senão fallback pra email (legacy behavior).
      const emailMap = new Map<
        string,
        { bruto: number; liquido: number; forma: string; canal: string; utmSource: string | null; utmMedium: string | null; utmTerm: string | null; utmContent: string | null; lastDate: Date | null }
      >();

      let anyHasDateFilter = false;

      // Story 28.4: counters de instrumentação (sempre coletados; só retornados se ?debug=1)
      const debugCounters = {
        spreadsheetsLoaded: [] as { id: string; name: string; totalRows: number; validRows: number }[],
        totalRowsRead: 0,
        skippedEmailEmpty: 0,
        skippedDateInvalid: 0,
        skippedDateOutOfRange: 0,
      };
      let anyUsedTxId = false;
      let anyUsedEmail = false;

      for (const spreadsheet of spreadsheets) {
        const mapping = spreadsheet.columnMapping as {
          email: string;
          transactionId?: string;
          valorBruto?: string;
          valorLiquido?: string;
          formaPagamento?: string;
          canalOrigem?: string;
          utm_source?: string;
          utm_medium?: string;
          utm_term?: string;
          utm_content?: string;
          dataVenda?: string;
        };

        let sheetData;
        try {
          sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
        } catch {
          continue; // se uma planilha falha, pula e segue agregando as outras
        }

        const { headers, rows } = sheetData;
        if (rows.length === 0) continue;

        function colIdx(fieldName: string | undefined): number {
          if (!fieldName) return -1;
          return headers.indexOf(fieldName);
        }

        const emailIdx = colIdx(mapping.email);
        const txIdx = colIdx(mapping.transactionId);
        const brutoIdx = colIdx(mapping.valorBruto);
        const liquidoIdx = colIdx(mapping.valorLiquido);
        const formaIdx = colIdx(mapping.formaPagamento);
        const canalIdx = colIdx(mapping.canalOrigem);
        const utmSourceIdx = colIdx(mapping.utm_source);
        const utmMediumIdx = colIdx(mapping.utm_medium);
        const utmTermIdx = colIdx(mapping.utm_term);
        const utmContentIdx = colIdx(mapping.utm_content);
        const dataIdx = colIdx(mapping.dataVenda);

        if (emailIdx === -1) continue;
        if (dataIdx !== -1) anyHasDateFilter = true;

        let validRowsForSheet = 0;

        for (const row of rows) {
          debugCounters.totalRowsRead += 1;
          const email = (row[emailIdx] ?? "").trim().toLowerCase();
          if (!email) { debugCounters.skippedEmailEmpty += 1; continue; }

          if (cutoffDate && dataIdx !== -1) {
            const dt = parseDate(row[dataIdx]);
            if (!dt) { debugCounters.skippedDateInvalid += 1; continue; }
            if (dt < cutoffDate) { debugCounters.skippedDateOutOfRange += 1; continue; }
          }

          const bruto = parseNumber(row[brutoIdx] ?? "");
          const liquido = parseNumber(row[liquidoIdx] ?? "");
          const forma = (row[formaIdx] ?? "Não informado").trim() || "Não informado";
          const canal = (row[canalIdx] ?? "Não informado").trim() || "Não informado";
          const utmSource = sanitizeUtmValue(row[utmSourceIdx]);
          const utmMedium = utmMediumIdx !== -1 ? sanitizeUtmValue(row[utmMediumIdx]) : null;
          const utmTerm = utmTermIdx !== -1 ? sanitizeUtmValue(row[utmTermIdx]) : null;
          const utmContent = utmContentIdx !== -1 ? sanitizeUtmValue(row[utmContentIdx]) : null;
          const rowDate = dataIdx !== -1 ? parseDate(row[dataIdx]) : null;

          // Story 28.4: dedup por transactionId quando mapeado e preenchido,
          // senão fallback pra email (comportamento legacy)
          const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
          const dedupKey = txId
            ? `${spreadsheet.id}|tx|${txId}`
            : `${spreadsheet.id}|email|${email}`;
          if (txId) anyUsedTxId = true; else anyUsedEmail = true;

          validRowsForSheet += 1;

          const existing = emailMap.get(dedupKey);
          if (existing) {
            existing.bruto += bruto;
            existing.liquido += liquido;
            if (rowDate && (!existing.lastDate || rowDate > existing.lastDate)) {
              existing.forma = forma;
              existing.canal = canal;
              existing.utmSource = utmSource;
              existing.utmMedium = utmMedium;
              existing.utmTerm = utmTerm;
              existing.utmContent = utmContent;
              existing.lastDate = rowDate;
            }
          } else {
            emailMap.set(dedupKey, { bruto, liquido, forma, canal, utmSource, utmMedium, utmTerm, utmContent, lastDate: rowDate });
          }
        }

        debugCounters.spreadsheetsLoaded.push({
          id: spreadsheet.id,
          name: spreadsheet.spreadsheetName,
          totalRows: rows.length,
          validRows: validRowsForSheet,
        });
      }

      // Suprime warning se nenhuma planilha tinha mapping de data (var é
      // declarada pra documentar a intenção, mesmo se não usada hoje).
      void anyHasDateFilter;

      if (emailMap.size === 0) {
        return { ...EMPTY_RESPONSE, semDados: false };
      }

      let totalBruto = 0;
      let totalLiquido = 0;
      const canalMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const formaMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmSourceMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmMediumMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmTermMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmContentMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      // Story 18.48: ingressos (vendas dedup) por dia × origem. Mesma dedup do
      // total (emailMap) → soma bate com totalVendas da planilha. Origem por
      // classifyFonte(utm_source); dia pela lastDate da entrada deduplicada.
      const ingressosByDay: Record<string, { pago: number; org: number; semTrack: number }> = {};
      const addIngresso = (date: Date | null, fonte: "Pago" | "Orgânico" | "Sem Track") => {
        if (!date) return;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${d}`;
        const e = ingressosByDay[key] ?? { pago: 0, org: 0, semTrack: 0 };
        if (fonte === "Pago") e.pago += 1;
        else if (fonte === "Sem Track") e.semTrack += 1;
        else e.org += 1;
        ingressosByDay[key] = e;
      };

      for (const { bruto, liquido, forma, canal, utmSource, utmMedium, utmTerm, utmContent, lastDate } of emailMap.values()) {
        totalBruto += bruto;
        totalLiquido += liquido;
        addIngresso(lastDate, classifyFonte(utmSource)); // Story 18.48

        const canalEntry = canalMap.get(canal) ?? { vendas: 0, bruto: 0, liquido: 0 };
        canalEntry.vendas += 1;
        canalEntry.bruto += bruto;
        canalEntry.liquido += liquido;
        canalMap.set(canal, canalEntry);

        const formaEntry = formaMap.get(forma) ?? { vendas: 0, bruto: 0, liquido: 0 };
        formaEntry.vendas += 1;
        formaEntry.bruto += bruto;
        formaEntry.liquido += liquido;
        formaMap.set(forma, formaEntry);

        const fonte = classifyFonte(utmSource);
        const utmEntry = utmSourceMap.get(fonte) ?? { vendas: 0, bruto: 0, liquido: 0 };
        utmEntry.vendas += 1;
        utmEntry.bruto += bruto;
        utmEntry.liquido += liquido;
        utmSourceMap.set(fonte, utmEntry);

        const mediumKey = utmMedium ?? "Não informado";
        const mediumEntry = utmMediumMap.get(mediumKey) ?? { vendas: 0, bruto: 0, liquido: 0 };
        mediumEntry.vendas += 1;
        mediumEntry.bruto += bruto;
        mediumEntry.liquido += liquido;
        utmMediumMap.set(mediumKey, mediumEntry);

        const termKey = utmTerm ?? "Não informado";
        const termEntry = utmTermMap.get(termKey) ?? { vendas: 0, bruto: 0, liquido: 0 };
        termEntry.vendas += 1;
        termEntry.bruto += bruto;
        termEntry.liquido += liquido;
        utmTermMap.set(termKey, termEntry);

        const contentKey = utmContent ?? "Não informado";
        const contentEntry = utmContentMap.get(contentKey) ?? { vendas: 0, bruto: 0, liquido: 0 };
        contentEntry.vendas += 1;
        contentEntry.bruto += bruto;
        contentEntry.liquido += liquido;
        utmContentMap.set(contentKey, contentEntry);
      }

      const totalVendasPlanilha = emailMap.size;
      const totalBrutoPlanilha = totalBruto;
      const totalLiquidoPlanilha = totalLiquido;

      // Story 19.9 ext: soma vendas manuais (PIX direto) no agregado total.
      // Período = mesmo cutoff usado pra planilha (days param). Sem days =
      // sem filtro temporal (pega todas).
      const manualCutoff = query.data.days
        ? new Date(Date.now() - query.data.days * 24 * 60 * 60 * 1000)
        : null;
      const manualRows = await fastify.db
        .select({
          value: manualSales.value,
          saleDate: manualSales.saleDate,
        })
        .from(manualSales)
        .where(
          manualCutoff
            ? and(
                eq(manualSales.stageId, params.data.stageId),
                gte(manualSales.saleDate, manualCutoff),
              )
            : eq(manualSales.stageId, params.data.stageId),
        );
      const manualVendas = manualRows.length;
      const manualBruto = manualRows.reduce((s, r) => s + (Number(r.value) || 0), 0);
      // Story 18.48: vendas manuais (PIX direto) entram como ingresso "sem track".
      for (const mr of manualRows) {
        addIngresso(mr.saleDate ? new Date(mr.saleDate) : null, "Sem Track");
      }

      const totalVendas = totalVendasPlanilha + manualVendas;
      const totalBrutoCombined = totalBrutoPlanilha + manualBruto;
      const totalLiquidoCombined = totalLiquidoPlanilha + manualBruto; // PIX direto sem fee
      totalBruto = totalBrutoCombined;
      totalLiquido = totalLiquidoCombined;

      // Calcular ticket médio por origem (Pago/Orgânico/Sem Track)
      const utmSourceArray = Array.from(utmSourceMap.entries());
      const pagoData = utmSourceArray.find(([fonte]) => fonte === "Pago")?.[1];
      const organicoData = utmSourceArray.find(([fonte]) => fonte === "Orgânico")?.[1];
      const semTrackData = utmSourceArray.find(([fonte]) => fonte === "Sem Track")?.[1];

      const ticketMedioPago = pagoData && pagoData.vendas > 0 ? pagoData.bruto / pagoData.vendas : 0;
      const ticketMedioOrganico = organicoData && organicoData.vendas > 0 ? organicoData.bruto / organicoData.vendas : 0;
      const ticketMedioSemTrack = semTrackData && semTrackData.vendas > 0 ? semTrackData.bruto / semTrackData.vendas : 0;

      // ROAS/CPV devem refletir SÓ o tráfego pago (meta-ads/google-ads) — vendas
      // orgânicas e sem-track não foram geradas pelo spend e inflavam o ROAS.
      // Vendas manuais (PIX) não têm utm_source → ficam fora do bucket Pago.
      const faturamentoPago = pagoData?.bruto ?? 0;
      const vendasPago = pagoData?.vendas ?? 0;

      // Story 28.7: resolve utm_medium + utm_term (ambos carregam adset_id no
      // padrão Loyola) e utm_content (ad_id) em nomes via cache persistente +
      // batch Meta API. Graceful: sem conta Meta vinculada OU resolve falha,
      // ids viram fallback no name (caller detecta via `id === name`).
      //
      // Otimização: utm_medium e utm_term costumam ter overlap (mesmo adset_id),
      // mas chamamos separado por clareza — o cache deduplica entre keys da
      // tabela, então não há request Meta duplicado.
      const mediumIds = Array.from(utmMediumMap.keys()).filter((k) => k !== "Não informado");
      const termIds = Array.from(utmTermMap.keys()).filter((k) => k !== "Não informado");
      const contentIds = Array.from(utmContentMap.keys()).filter((k) => k !== "Não informado");
      const metaToken = await getProjectMetaToken(params.data.projectId);
      let mediumNames = new Map<string, string>();
      let termNames = new Map<string, string>();
      let contentNames = new Map<string, string>();
      if (metaToken && (mediumIds.length > 0 || termIds.length > 0 || contentIds.length > 0)) {
        const adsetAdapter = makeMetaNamesCacheAdapter(params.data.projectId, "adset");
        const adAdapter = makeMetaNamesCacheAdapter(params.data.projectId, "ad");
        const [resolvedMedium, resolvedTerm, resolvedContent] = await Promise.all([
          mediumIds.length > 0
            ? resolveEntityNames(mediumIds, metaToken, adsetAdapter)
            : Promise.resolve(new Map<string, string>()),
          termIds.length > 0
            ? resolveEntityNames(termIds, metaToken, adsetAdapter)
            : Promise.resolve(new Map<string, string>()),
          contentIds.length > 0
            ? resolveEntityNames(contentIds, metaToken, adAdapter)
            : Promise.resolve(new Map<string, string>()),
        ]);
        mediumNames = resolvedMedium;
        termNames = resolvedTerm;
        contentNames = resolvedContent;
      }

      // Story 18.32 AC2 + Story 18.35: Group by adset_name with smart fallback for unresolved IDs
      // Same pattern as stage-creative-performance.ts: aggregate by name, not ID
      type MediumGroup = { name: string; ids: string[]; vendas: number; bruto: number; liquido: number };
      const mediumByName = new Map<string, MediumGroup>();

      // Helper: detect Meta numeric IDs (15+ digits) vs. textual UTMs
      const isMetaNumericId = (value: string): boolean => /^\d{15,}$/.test(value.trim());

      for (const [mediumId, metrics] of utmMediumMap.entries()) {
        // Story 18.35 AC2: Smart fallback - "[Unresolved] ID" for numeric Meta IDs that failed to resolve
        let adsetName = mediumNames.get(mediumId);
        if (!adsetName) {
          if (isMetaNumericId(mediumId)) {
            adsetName = `[Unresolved] ${mediumId}`;
          } else {
            adsetName = mediumId;
          }
        }
        adsetName = adsetName.trim() || "(sem nome)";

        let group = mediumByName.get(adsetName);
        if (!group) {
          group = { name: adsetName, ids: [], vendas: 0, bruto: 0, liquido: 0 };
          mediumByName.set(adsetName, group);
        }
        group.ids.push(mediumId);
        group.vendas += metrics.vendas;
        group.bruto += metrics.bruto;
        group.liquido += metrics.liquido;
      }
      const porUtmMediumGrouped = Array.from(mediumByName.values())
        .map(({ name, vendas, bruto, liquido }) => ({ medium: name, name, vendas, bruto, liquido }))
        .sort((a, b) => b.vendas - a.vendas);

      // Story 18.32 AC3 + Story 18.35: Group by ad_name with smart fallback for unresolved IDs
      type ContentGroup = { name: string; ids: string[]; vendas: number; bruto: number; liquido: number };
      const contentByName = new Map<string, ContentGroup>();

      for (const [contentId, metrics] of utmContentMap.entries()) {
        // Story 18.35 AC2: Smart fallback - "[Unresolved] ID" for numeric Meta IDs that failed to resolve
        let adName = contentNames.get(contentId);
        if (!adName) {
          if (isMetaNumericId(contentId)) {
            adName = `[Unresolved] ${contentId}`;
          } else {
            adName = contentId;
          }
        }
        adName = adName.trim() || "(sem nome)";

        let group = contentByName.get(adName);
        if (!group) {
          group = { name: adName, ids: [], vendas: 0, bruto: 0, liquido: 0 };
          contentByName.set(adName, group);
        }
        group.ids.push(contentId);
        group.vendas += metrics.vendas;
        group.bruto += metrics.bruto;
        group.liquido += metrics.liquido;
      }
      const porUtmContentGrouped = Array.from(contentByName.values())
        .map(({ name, vendas, bruto, liquido }) => ({ content: name, name, vendas, bruto, liquido }))
        .sort((a, b) => b.vendas - a.vendas);

      return {
        totalVendas,
        faturamentoBruto: totalBruto,
        faturamentoLiquido: totalLiquido,
        ticketMedioBruto: totalVendas > 0 ? totalBruto / totalVendas : 0,
        ticketMedioLiquido: totalVendas > 0 ? totalLiquido / totalVendas : 0,
        // Story 19.9 ext: breakdown pro tooltip — quanto veio da planilha vs manual
        breakdown: {
          spreadsheet: {
            vendas: totalVendasPlanilha,
            bruto: totalBrutoPlanilha,
            liquido: totalLiquidoPlanilha,
          },
          manual: {
            vendas: manualVendas,
            bruto: manualBruto,
            liquido: manualBruto,
          },
        },
        ticketMedioPago,
        ticketMedioOrganico,
        ticketMedioSemTrack,
        faturamentoPago,
        vendasPago,
        ingressosByDay, // Story 18.48: contagem de vendas (dedup) por dia × origem

        porCanal: Array.from(canalMap.entries())
          .map(([canal, v]) => ({ canal, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        porFormaPagamento: Array.from(formaMap.entries())
          .map(([forma, v]) => ({ forma, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        porUtmSource: Array.from(utmSourceMap.entries())
          .map(([fonte, v]) => ({ fonte, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        porUtmMedium: porUtmMediumGrouped,
        porUtmTerm: Array.from(utmTermMap.entries())
          .map(([term, v]) => ({ term, name: termNames.get(term) ?? term, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        porUtmContent: porUtmContentGrouped,
        semDados: false,
        // Story 28.4: debug counters só quando ?debug=1
        ...(query.data.debug
          ? {
              debug: {
                ...debugCounters,
                uniqueDedupeKeys: emailMap.size,
                dedupeStrategy: (anyUsedTxId && anyUsedEmail
                  ? "mixed"
                  : anyUsedTxId
                  ? "transactionId"
                  : "email") as "email" | "transactionId" | "mixed",
              },
            }
          : {}),
      };
    }
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-conversion
  // Cruza compradores entre planilhas capture e main_product da mesma etapa.
  // Retorna: count por categoria, cross (intersecção de emails) e taxa.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-conversion",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const empty = {
        captureBuyers: 0,
        mainBuyers: 0,
        crossBuyers: 0,
        captureRevenue: 0,
        mainRevenue: 0,
        crossRevenue: 0,
        conversionRate: 0,
        hasCapture: false,
        hasMain: false,
      };

      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const sheets = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(eq(stageSalesSpreadsheets.stageId, params.data.stageId));

      const captureSheets = sheets.filter((s) => s.subtype === "capture");
      const mainSheets = sheets.filter((s) => s.subtype === "main_product");

      if (captureSheets.length === 0 && mainSheets.length === 0) {
        return empty;
      }

      async function buildBuyers(
        list: typeof sheets,
      ): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        for (const sheet of list) {
          const mapping = sheet.columnMapping as { email: string; valorBruto?: string };
          let sheetData;
          try {
            sheetData = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
          } catch {
            continue;
          }
          const { headers, rows } = sheetData;
          const emailIdx = headers.indexOf(mapping.email);
          const brutoIdx = mapping.valorBruto ? headers.indexOf(mapping.valorBruto) : -1;
          if (emailIdx === -1) continue;
          for (const row of rows) {
            const email = (row[emailIdx] ?? "").trim().toLowerCase();
            if (!email) continue;
            const valor = brutoIdx !== -1 ? parseNumber(row[brutoIdx] ?? "") : 0;
            result.set(email, (result.get(email) ?? 0) + valor);
          }
        }
        return result;
      }

      const captureBuyers = await buildBuyers(captureSheets);
      const mainBuyers = await buildBuyers(mainSheets);

      let crossBuyers = 0;
      let crossRevenue = 0;
      for (const email of captureBuyers.keys()) {
        if (mainBuyers.has(email)) {
          crossBuyers++;
          crossRevenue += mainBuyers.get(email) ?? 0;
        }
      }

      const captureRevenue = Array.from(captureBuyers.values()).reduce((a, b) => a + b, 0);
      const mainRevenue = Array.from(mainBuyers.values()).reduce((a, b) => a + b, 0);
      const conversionRate = captureBuyers.size > 0 ? (crossBuyers / captureBuyers.size) * 100 : 0;

      return {
        captureBuyers: captureBuyers.size,
        mainBuyers: mainBuyers.size,
        crossBuyers,
        captureRevenue,
        mainRevenue,
        crossRevenue,
        conversionRate,
        hasCapture: captureSheets.length > 0,
        hasMain: mainSheets.length > 0,
      };
    }
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/hot-cold-buyers
  // Retorna distribuição Hot/Cold/Outros dos compradores agrupando pelo utm_term
  // da planilha de stage-sales (subtype capture ou main_product). Dedupe por email
  // (1 comprador, mesmo que apareça em múltiplas linhas).
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/hot-cold-buyers",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id, stageType: funnelStages.stageType })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      const empty = {
        hot: 0,
        cold: 0,
        outros: 0,
        total: 0,
        items: { hot: [] as string[], cold: [] as string[], outros: [] as string[] },
        hasMapping: false as const,
        semDados: true as const,
      };

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });
      if (stage.stageType !== "paid" && stage.stageType !== "sales") return empty;

      const [spreadsheet] = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, query.data.subtype)
          )
        )
        .limit(1);

      if (!spreadsheet) return empty;

      const mapping = spreadsheet.columnMapping as {
        email: string;
        dataVenda?: string;
        utm_term?: string;
      };

      if (!mapping.utm_term) {
        return { ...empty, hasMapping: false as const };
      }

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { ...empty, hasMapping: true as const };
      }

      const { headers, rows } = sheetData;
      if (rows.length === 0) {
        return { ...empty, hasMapping: true as const, semDados: false as const };
      }

      function colIdx(fieldName: string | undefined): number {
        if (!fieldName) return -1;
        return headers.indexOf(fieldName);
      }

      const emailIdx = colIdx(mapping.email);
      const dataIdx = colIdx(mapping.dataVenda);
      const utmTermIdx = colIdx(mapping.utm_term);

      if (emailIdx === -1 || utmTermIdx === -1) {
        return { ...empty, hasMapping: true as const, semDados: false as const };
      }

      let cutoffDate: Date | null = null;
      if (query.data.days && dataIdx !== -1) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - query.data.days);
      }

      // Dedup por email — 1 comprador único, mesmo que comprou várias vezes.
      // Usa a última utm_term observada (ordem natural do array de rows).
      const emailToTerm = new Map<string, string>();
      for (const row of rows) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;

        if (cutoffDate && dataIdx !== -1) {
          const dt = parseDate(row[dataIdx]);
          if (!dt || dt < cutoffDate) continue;
        }

        const term = (row[utmTermIdx] ?? "").trim();
        emailToTerm.set(email, term);
      }

      const result = {
        hot: 0,
        cold: 0,
        outros: 0,
        total: 0,
        items: { hot: [] as string[], cold: [] as string[], outros: [] as string[] },
        hasMapping: true as const,
        semDados: false as const,
      };

      for (const term of emailToTerm.values()) {
        const normalized = term.toLowerCase();
        let category: "hot" | "cold" | "outros";
        if (normalized.includes("hot")) category = "hot";
        else if (normalized.includes("cold")) category = "cold";
        else category = "outros";

        result[category]++;
        result.total++;

        if (term.length > 0 && result.items[category].length < 50) {
          if (!result.items[category].includes(term)) {
            result.items[category].push(term);
          }
        }
      }

      return result;
    }
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data-daily
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data-daily",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id, stageType: funnelStages.stageType })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      if (stage.stageType !== "paid" && stage.stageType !== "sales") return { byDay: {} as Record<string, number>, semDados: true };

      const spreadsheets = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, query.data.subtype)
          )
        );

      if (spreadsheets.length === 0) return { byDay: {} as Record<string, number>, semDados: true };

      let cutoffDate: Date | null = null;
      if (query.data.days) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - query.data.days);
      }

      // Faturamento por dia = soma do bruto de TODAS as linhas na data da própria
      // linha (de TODAS as planilhas conectadas). Sem dedup por email — cada
      // linha é uma transação distinta. Local date (não UTC) pra evitar shift
      // de vendas BRT pós-21h pro dia seguinte.
      const byDay: Record<string, number> = {};
      let counted = 0;

      for (const spreadsheet of spreadsheets) {
        const mapping = spreadsheet.columnMapping as {
          email: string;
          valorBruto?: string;
          dataVenda?: string;
        };

        let sheetData;
        try {
          sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
        } catch {
          continue;
        }

        const { headers, rows } = sheetData;
        if (rows.length === 0) continue;

        function colIdx(fieldName: string | undefined): number {
          if (!fieldName) return -1;
          return headers.indexOf(fieldName);
        }

        const emailIdx = colIdx(mapping.email);
        const brutoIdx = colIdx(mapping.valorBruto);
        const dataIdx = colIdx(mapping.dataVenda);

        if (dataIdx === -1) continue;

      for (const row of rows) {
        const rowDate = parseDate(row[dataIdx]);
        if (!rowDate) continue;
        if (cutoffDate && rowDate < cutoffDate) continue;

        // Mantém filtro de email vazio: linhas sem email são geralmente eventos
        // não-venda (boleto gerado, carrinho, etc) e poluiriam o faturamento.
        // Se o cliente quiser incluí-las, removemos o guard depois.
        if (emailIdx !== -1) {
          const email = (row[emailIdx] ?? "").trim();
          if (!email) continue;
        }

        const bruto = parseNumber(row[brutoIdx] ?? "");
        if (bruto <= 0) continue;

        const y = rowDate.getFullYear();
        const m = String(rowDate.getMonth() + 1).padStart(2, "0");
        const d = String(rowDate.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${d}`;
        byDay[key] = (byDay[key] ?? 0) + bruto;
        counted++;
      }
      }

      if (counted === 0) return { byDay: {} as Record<string, number>, semDados: false };

      return { byDay, semDados: false };
    }
  );
});
