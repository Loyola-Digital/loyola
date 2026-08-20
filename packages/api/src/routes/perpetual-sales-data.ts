import { chaveDeComprador } from "../utils/comprador.js";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket, isRevenueBucket } from "../services/sales-status.js";
import { saleDayKey, businessToday, shiftDayKey } from "../utils/sale-date.js";
import { PLATFORM_RATE_BREAKDOWN } from "../services/perpetual-report-config.js";

// ============================================================
// Epic 29 Story 29.3 — agregação de vendas do perpétuo
// porUtmSource é BRUTO (sem normalização Pago/Orgânico)
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Story 29.42 (AC8) — dimensão opcional do `sales-data-daily`.
   *
   * Ausente = comportamento de sempre (`byDay`/`salesByDay` totais), intacto
   * para todos os consumidores atuais. Presente, acrescenta `byEntity` sem
   * remover nada — campo aditivo.
   *
   * No perpétuo, o UTM carrega o ID da entidade Meta:
   *   campaign -> utm_campaign · adset -> utm_medium · ad -> utm_content
   */
  groupBy: z.enum(["campaign", "adset", "ad"]).optional(),
});

// ---- helpers (copiados de stage-sales-data — refactor DRY pode esperar) ----

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
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

function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

// Story 29.7: fee rates por plataforma (Kiwify=20.99% / Hotmart=26% / Other=0%).
//
// Story 41.8 (AC9): as taxas passaram a sair de UMA fonte —
// `PLATFORM_RATE_BREAKDOWN` em `services/perpetual-report-config.ts`, que é a
// mesma que o relatório perpétuo usa. Antes a composição vivia duplicada aqui
// (só a soma) e no `perpetual-dashboard.tsx` (só o detalhe), e nada garantia que
// as duas contassem a mesma coisa. O valor efetivo NÃO mudou: os testes
// comparam contra 20,99% / 26% / 0.
const PLATFORM_FEE_RATES: Record<string, number> = Object.fromEntries(
  Object.entries(PLATFORM_RATE_BREAKDOWN).map(([plat, b]) => [
    plat,
    roundRate(b.plataforma + b.imposto + b.outros + b.reembolso),
  ]),
);

/** Componente de reembolso ESTIMADO embutido nas taxas acima (Kiwify/Hotmart). */
const REFUND_FEE_ESTIMATE = PLATFORM_RATE_BREAKDOWN.kiwify.reembolso;

/** Soma de frações produz 0.20990000000000003 — o arredondamento evita ruído. */
function roundRate(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Fee efetivo da plataforma. Se a planilha traz status real de reembolso
 * (hasStatusCol), remove o componente estimado de 4% — o reembolso real já
 * foi subtraído do bruto.
 */
function effectivePlatformFeeRate(platform: string | null, hasStatusCol: boolean): number {
  if (!platform) return 0;
  const rate = PLATFORM_FEE_RATES[platform] ?? 0;
  if (hasStatusCol && rate > 0) return roundRate(Math.max(0, rate - REFUND_FEE_ESTIMATE));
  return rate;
}

const EMPTY_SALES_DATA = {
  totalVendas: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  faturamentoLiquidoCalculado: 0,
  // Reembolsos (refunded + chargeback) — já descontados do faturamento acima.
  reembolsoBruto: 0,
  reembolsoLiquido: 0,
  vendasReembolsadas: 0,
  // true quando a planilha tem coluna de status → reembolso medido de verdade
  // (e o 4% estimado da plataforma é removido da Margem).
  reembolsoReal: false,
  platform: null as string | null,
  feeRate: 0,
  ticketMedioBruto: 0,
  ticketMedioLiquido: 0,
  porUtmSource: [] as { source: string; vendas: number; bruto: number; liquido: number }[],
  porUtmMedium: [] as { medium: string; vendas: number; bruto: number; liquido: number }[],
  porUtmContent: [] as { content: string; vendas: number; bruto: number; liquido: number }[],
  porUtmCampaign: [] as { campaign: string; vendas: number; bruto: number; liquido: number }[],
  porFormaPagamento: [] as { forma: string; vendas: number; bruto: number; liquido: number }[],
  semDados: true,
};

const SEM_ORIGEM_LABEL = "(sem origem)";

// ============================================================
// ROUTES
// ============================================================

export default fp(async function perpetualSalesDataRoutes(fastify) {
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

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  async function loadPerpetualSpreadsheet(funnelId: string) {
    const [row] = await fastify.db
      .select()
      .from(funnelSpreadsheets)
      .where(
        and(
          eq(funnelSpreadsheets.funnelId, funnelId),
          eq(funnelSpreadsheets.type, "perpetual_sales"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ---- GET /perpetual/sales-data ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const spreadsheet = await loadPerpetualSpreadsheet(params.data.funnelId);
      if (!spreadsheet) return EMPTY_SALES_DATA;

      const mapping = spreadsheet.columnMapping as {
        email: string;
        transactionId?: string;
        valorBruto?: string;
        valorLiquido?: string;
        formaPagamento?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_content?: string;
        utm_campaign?: string;
        dataVenda?: string;
        status?: string;
      };

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { ...EMPTY_SALES_DATA, semDados: true };
      }

      const { headers, rows } = sheetData;
      if (rows.length === 0) return { ...EMPTY_SALES_DATA, semDados: true };

      const colIdx = (fieldName: string | undefined): number =>
        fieldName ? headers.indexOf(fieldName) : -1;

      const emailIdx = colIdx(mapping.email);
      const txIdx = colIdx(mapping.transactionId);
      const brutoIdx = colIdx(mapping.valorBruto);
      const liquidoIdx = colIdx(mapping.valorLiquido);
      const formaIdx = colIdx(mapping.formaPagamento);
      const utmSourceIdx = colIdx(mapping.utm_source);
      const utmMediumIdx = colIdx(mapping.utm_medium);
      const utmContentIdx = colIdx(mapping.utm_content);
      const utmCampaignIdx = colIdx(mapping.utm_campaign);
      const dataIdx = colIdx(mapping.dataVenda);
      const statusIdx = colIdx(mapping.status);
      const hasStatusCol = statusIdx !== -1;

      if (emailIdx === -1) return { ...EMPTY_SALES_DATA, semDados: true };

      // Fix 1 (29.8): suporta startDate/endDate explicitos (custom range no passado)
      // OU days retroativos (presets). Sem nenhum dos dois = todos os dados.
      let cutoffStart: Date | null = null;
      let cutoffEnd: Date | null = null;
      if (query.data.startDate && query.data.endDate && dataIdx !== -1) {
        cutoffStart = new Date(query.data.startDate + "T00:00:00");
        cutoffEnd = new Date(query.data.endDate + "T23:59:59");
      } else if (query.data.days && dataIdx !== -1) {
        cutoffStart = new Date();
        cutoffStart.setDate(cutoffStart.getDate() - query.data.days);
      }

      // Dedup por transactionId quando mapeado, senão por email (Story 28.4 pattern).
      const dedupMap = new Map<
        string,
        {
          bruto: number;
          liquido: number;
          forma: string;
          utmSource: string;
          utmMedium: string;
          utmContent: string;
          utmCampaign: string;
          lastDate: Date | null;
        }
      >();

      // Reembolsos/chargebacks são contados por TRANSAÇÃO (txId) ou por LINHA
      // quando não há txId — NUNCA colapsados por email. Se caíssem na dedup por
      // email, vários reembolsos do mesmo cliente virariam um só (bug: 51 → 12).
      // Reembolso NÃO deduplica: a pessoa compra (linha paid, id X) e ao reembolsar
      // volta como uma NOVA linha refunded com o MESMO id X. Cada linha refunded/
      // chargeback é um reembolso real e deve ser contada 1:1 com as linhas.
      let reembolsoBruto = 0;
      let reembolsoLiquido = 0;
      let vendasReembolsadas = 0;
      // txIds reembolsados → remove a linha "paid" pareada (mesmo id) das vendas.
      const refundedTxIds = new Set<string>();

      for (const [idxDaLinha, row] of rows.entries()) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;

        if ((cutoffStart || cutoffEnd) && dataIdx !== -1) {
          const dt = parseDate(row[dataIdx]);
          if (!dt) continue;
          if (cutoffStart && dt < cutoffStart) continue;
          if (cutoffEnd && dt > cutoffEnd) continue;
        }

        const bruto = parseNumber(row[brutoIdx] ?? "");
        const liquido = parseNumber(row[liquidoIdx] ?? "");
        const forma = (row[formaIdx] ?? "").trim() || "Não informado";
        const utmSource = sanitizeUtmValue(row[utmSourceIdx]) ?? SEM_ORIGEM_LABEL;
        const utmMedium = sanitizeUtmValue(row[utmMediumIdx]) ?? SEM_ORIGEM_LABEL;
        const utmContent = sanitizeUtmValue(row[utmContentIdx]) ?? SEM_ORIGEM_LABEL;
        const utmCampaign = sanitizeUtmValue(row[utmCampaignIdx]) ?? SEM_ORIGEM_LABEL;
        const rowDate = dataIdx !== -1 ? parseDate(row[dataIdx]) : null;
        const status = hasStatusCol ? (row[statusIdx] ?? "").trim() : "";

        const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";

        const bucket = classifyRefundStatus(status, hasStatusCol);

        // Reembolso/chargeback: conta cada linha (sem dedup). Nunca entra na dedup
        // de vendas — senão a compra e o reembolso do mesmo id colapsariam num só.
        // Precisa vir ANTES do filtro de receita: tem efeito colateral (alimenta
        // reembolsoBruto e refundedTxIds) que se perderia num descarte genérico.
        if (isRefundBucket(bucket)) {
          reembolsoBruto += bruto;
          reembolsoLiquido += liquido;
          vendasReembolsadas += 1;
          if (txId) refundedTxIds.add(txId);
          continue;
        }

        // Story 29.26: recusada/pendente/aguardando pagamento não é receita.
        // Sai antes da dedup — não conta em vendas, faturamento, ticket médio
        // nem em nenhum corte por UTM.
        if (!isRevenueBucket(bucket)) continue;

        /**
         * Story 29.53 (AC2) — a unidade contada e o E-MAIL, nao a transacao.
         *
         * O order bump chega numa LINHA PROPRIA com a mesma transacao da compra
         * principal, e a chave `tx|` o colapsava — em tese. Medido na planilha
         * do Netao: o `transactionId` daquele funil aponta para a coluna `ID`,
         * que e unica nas 196 linhas, entao a dedup nao deduplicava NADA e cada
         * bump virava uma venda a mais. CAC de 08/08: R$ 101,85 exibido contra
         * R$ 162,95 real, 60% de diferenca no numero que decide escala.
         *
         * O e-mail nao depende de mapeamento certo de coluna: 17 dos 20 bumps
         * tem o mesmo e-mail da compra principal no mesmo dia, e as 129 linhas
         * aprovadas colapsam em 110 compradores.
         *
         * ⚠️ Isto NAO e regra nova — e o que o escopo do EPIC-29 pede desde
         * 2026-05-22: "API que agrega vendas por email (dedup 1 venda/email)".
         * Quem divergiu foi a implementacao.
         *
         * `tx|` fica como rede para a linha sem e-mail, e o indice da linha
         * como ultimo recurso: descartar em silencio some com a venda.
         */
        const dedupKey = chaveDeComprador(email, txId, idxDaLinha);

        const existing = dedupMap.get(dedupKey);
        if (existing) {
          existing.bruto += bruto;
          existing.liquido += liquido;
          if (rowDate && (!existing.lastDate || rowDate > existing.lastDate)) {
            existing.forma = forma;
            existing.utmSource = utmSource;
            existing.utmMedium = utmMedium;
            existing.utmContent = utmContent;
            existing.utmCampaign = utmCampaign;
            existing.lastDate = rowDate;
          }
        } else {
          dedupMap.set(dedupKey, { bruto, liquido, forma, utmSource, utmMedium, utmContent, utmCampaign, lastDate: rowDate });
        }
      }

      // Remove das vendas a linha "paid" cujo id foi reembolsado (a compra
      // reembolsada não é receita realizada).
      for (const txId of refundedTxIds) dedupMap.delete(`tx|${txId}`);

      if (dedupMap.size === 0 && vendasReembolsadas === 0) return { ...EMPTY_SALES_DATA, semDados: false };

      let totalBruto = 0;
      let totalLiquido = 0;
      let totalVendas = 0;
      const utmSourceMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmMediumMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmContentMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmCampaignMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const formaMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();

      const addToMap = (
        m: Map<string, { vendas: number; bruto: number; liquido: number }>,
        key: string,
        bruto: number,
        liquido: number,
      ) => {
        const e = m.get(key) ?? { vendas: 0, bruto: 0, liquido: 0 };
        e.vendas += 1;
        e.bruto += bruto;
        e.liquido += liquido;
        m.set(key, e);
      };

      for (const { bruto, liquido, forma, utmSource, utmMedium, utmContent, utmCampaign } of dedupMap.values()) {
        totalVendas += 1;
        totalBruto += bruto;
        totalLiquido += liquido;
        addToMap(utmSourceMap, utmSource, bruto, liquido);
        addToMap(utmMediumMap, utmMedium, bruto, liquido);
        addToMap(utmContentMap, utmContent, bruto, liquido);
        addToMap(utmCampaignMap, utmCampaign, bruto, liquido);
        addToMap(formaMap, forma, bruto, liquido);
      }

      const platform = spreadsheet.platform;
      const feeRate = effectivePlatformFeeRate(platform, hasStatusCol);
      const faturamentoLiquidoCalculado = totalBruto * (1 - feeRate);

      return {
        totalVendas,
        faturamentoBruto: totalBruto,
        faturamentoLiquido: totalLiquido,
        faturamentoLiquidoCalculado,
        reembolsoBruto,
        reembolsoLiquido,
        vendasReembolsadas,
        reembolsoReal: hasStatusCol,
        platform,
        feeRate,
        ticketMedioBruto: totalVendas > 0 ? totalBruto / totalVendas : 0,
        ticketMedioLiquido: totalVendas > 0 ? totalLiquido / totalVendas : 0,
        porUtmSource: Array.from(utmSourceMap.entries())
          .map(([source, v]) => ({ source, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmMedium: Array.from(utmMediumMap.entries())
          .map(([medium, v]) => ({ medium, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmContent: Array.from(utmContentMap.entries())
          .map(([content, v]) => ({ content, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmCampaign: Array.from(utmCampaignMap.entries())
          .map(([campaign, v]) => ({ campaign, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porFormaPagamento: Array.from(formaMap.entries())
          .map(([forma, v]) => ({ forma, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        semDados: false,
      };
    },
  );

  // ---- GET /perpetual/sales-data-daily ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data-daily",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const spreadsheet = await loadPerpetualSpreadsheet(params.data.funnelId);
      if (!spreadsheet) return { byDay: {} as Record<string, number>, semDados: true };

      const mapping = spreadsheet.columnMapping as {
        email: string;
        transactionId?: string;
        valorBruto?: string;
        dataVenda?: string;
        status?: string;
        // Story 29.42 (AC8): mesmos campos que o endpoint irmão já mapeia.
        utm_medium?: string;
        utm_content?: string;
        utm_campaign?: string;
      };

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { byDay: {} as Record<string, number>, semDados: true };
      }

      const { headers, rows } = sheetData;
      if (rows.length === 0) return { byDay: {} as Record<string, number>, semDados: true };

      const colIdx = (fieldName: string | undefined): number =>
        fieldName ? headers.indexOf(fieldName) : -1;

      const emailIdx = colIdx(mapping.email);
      const txIdx = colIdx(mapping.transactionId);
      const brutoIdx = colIdx(mapping.valorBruto);
      const dataIdx = colIdx(mapping.dataVenda);
      const statusIdx = colIdx(mapping.status);
      const hasStatusCol = statusIdx !== -1;

      // Story 29.42 (AC8): a coluna de UTM que corresponde à dimensão pedida.
      // `-1` quando a planilha não tem a coluna — as vendas caem todas em
      // "(sem origem)", que é honesto, em vez de sumirem.
      const groupBy = query.data.groupBy;
      const utmIdx =
        groupBy === "campaign" ? colIdx(mapping.utm_campaign)
        : groupBy === "adset" ? colIdx(mapping.utm_medium)
        : groupBy === "ad" ? colIdx(mapping.utm_content)
        : -1;

      if (dataIdx === -1) return { byDay: {} as Record<string, number>, semDados: true };

      // Pass 1: coleta ids reembolsados pra excluir tanto a linha refunded quanto
      // a compra "paid" pareada (mesmo id) da série de receita no tempo.
      const refundedTxIds = new Set<string>();
      if (hasStatusCol && txIdx !== -1) {
        for (const row of rows) {
          if (isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) {
            const txId = (row[txIdx] ?? "").trim();
            if (txId) refundedTxIds.add(txId);
          }
        }
      }

      // Fix 1 (29.8): suporta startDate/endDate ou days retroativos.
      // Story 41.7 (§C.7): o corte passou a ser por DIA CIVIL de São Paulo, em
      // vez de comparação de instantes no fuso do processo. Comparar strings
      // `YYYY-MM-DD` é determinístico e não depende de onde a API roda.
      let cutoffStartDay: string | null = null;
      let cutoffEndDay: string | null = null;
      if (query.data.startDate && query.data.endDate) {
        cutoffStartDay = query.data.startDate;
        cutoffEndDay = query.data.endDate;
      } else if (query.data.days) {
        cutoffStartDay = shiftDayKey(businessToday(), -query.data.days);
      }

      const byDay: Record<string, number> = {};
      // Story 29.23: contagem de vendas por dia (mesmo filtro/linhas de `byDay`,
      // contando transações em vez de somar faturamento) — base de Vendas/CPV/
      // Ticket Médio por dia no Quadro de Dados Diários.
      const salesByDay: Record<string, number> = {};
      /**
       * Story 29.42 (AC8): `chave da entidade -> série diária`. A chave é o
       * valor cru do UTM (ID da entidade Meta no perpétuo); resolver para nome
       * é do frontend, que já tem os mapas de nomes carregados.
       */
      const byEntity: Record<
        string,
        { revenueByDay: Record<string, number>; salesByDay: Record<string, number> }
      > = {};
      let counted = 0;

      /**
       * Story 29.53 (AC2) — a serie diaria deduplica por e-mail DENTRO do dia.
       *
       * ⚠️ A soma dos dias NAO bate com o total do periodo, e isso esta certo:
       * quem comprou em dois dias conta nos dois aqui e uma vez la. Medido na
       * planilha do Netao, a divergencia e de **1** em 110 — um comprador que
       * voltou em 28/07 e 04/08.
       *
       * Precedente identico e deliberado na Story 44.12 (Decisao 2 do @po), com
       * a mesma justificativa: sao perguntas diferentes. "Quantos compradores
       * neste dia?" e "quantos compradores no periodo?" nao somam.
       */
      const vistosPorDia = new Set<string>();
      for (const [idxDaLinha, row] of rows.entries()) {
        const rowDay = saleDayKey(row[dataIdx]);
        if (!rowDay) continue;
        if (cutoffStartDay && rowDay < cutoffStartDay) continue;
        if (cutoffEndDay && rowDay > cutoffEndDay) continue;

        if (emailIdx !== -1) {
          const email = (row[emailIdx] ?? "").trim();
          if (!email) continue;
        }

        // Reembolso/chargeback não entram na série de receita no tempo — nem a
        // linha refunded, nem a compra "paid" pareada (mesmo id).
        // Story 29.26: recusada/pendente também sai — a série diária conta as
        // MESMAS linhas que o agregado, senão o gráfico contradiz os cards.
        if (hasStatusCol) {
          if (!isRevenueBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) continue;
          if (txIdx !== -1) {
            const txId = (row[txIdx] ?? "").trim();
            if (txId && refundedTxIds.has(txId)) continue;
          }
        }

        const bruto = parseNumber(row[brutoIdx] ?? "");
        if (bruto <= 0) continue;

        // Story 41.7 (§C.7): `rowDay` já é o dia civil de São Paulo. Antes daqui
        // saía `getFullYear/getMonth/getDate`, que usava o fuso do processo.
        // O FATURAMENTO soma todas as linhas — o order bump E receita (AC4).
        byDay[rowDay] = (byDay[rowDay] ?? 0) + bruto;

        // A CONTAGEM conta compradores. A segunda linha do mesmo e-mail no
        // mesmo dia (o bump) soma no faturamento e nao cria venda.
        const chaveDoDia = chaveDeComprador(
          emailIdx === -1 ? null : row[emailIdx],
          txIdx === -1 ? null : row[txIdx],
          idxDaLinha,
          rowDay,
        );
        if (!vistosPorDia.has(chaveDoDia)) {
          vistosPorDia.add(chaveDoDia);
          salesByDay[rowDay] = (salesByDay[rowDay] ?? 0) + 1;
        }

        // Story 29.42 (AC8): a MESMA linha que entrou no total entra aqui.
        // Derivar a dimensão dentro do mesmo laço é o que garante que a soma
        // de `byEntity` feche com `byDay` — se fossem dois laços com filtros
        // separados, divergiriam na primeira mudança de regra.
        if (groupBy) {
          const chave = sanitizeUtmValue(utmIdx === -1 ? undefined : row[utmIdx]) ?? SEM_ORIGEM_LABEL;
          const e = (byEntity[chave] ??= { revenueByDay: {}, salesByDay: {} });
          e.revenueByDay[rowDay] = (e.revenueByDay[rowDay] ?? 0) + bruto;
          e.salesByDay[rowDay] = (e.salesByDay[rowDay] ?? 0) + 1;
        }
        counted++;
      }

      if (counted === 0) {
        return {
          byDay: {} as Record<string, number>,
          salesByDay: {} as Record<string, number>,
          ...(groupBy ? { byEntity: {} as typeof byEntity, groupBy } : {}),
          semDados: false,
        };
      }
      return {
        byDay,
        salesByDay,
        ...(groupBy ? { byEntity, groupBy } : {}),
        semDados: false,
      };
    },
  );
});
