/**
 * Etapa de Vendas — comparação D1/D2/D3, origem dos compradores e jornada do lead.
 *
 * Três perguntas que a etapa não respondia:
 *
 * 1. "Estamos vendendo mais que o lançamento passado NESTA altura?" — comparar
 *    por data não responde, porque dois lançamentos abrem carrinho em dias
 *    diferentes. A série é indexada em D1/D2/D3 (dia relativo à primeira venda),
 *    mesma convenção do gráfico de aplicações da Captação Paga.
 *
 * 2. "De onde veio quem comprou?" — cruza o e-mail do comprador com a pesquisa
 *    de aplicação, que é onde moram as UTMs do lead.
 *
 * 3. "O que esse e-mail fez no funil inteiro?" — a jornada, do primeiro registro
 *    na captação até a compra.
 *
 * Custo: tudo aqui lê Google Sheets ao vivo. `readSheetData` tem cache de 30s,
 * que é o que impede as três rotas de multiplicarem chamadas quando a aba monta.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnelStages,
  funnelSurveys,
  funnels,
  manualSales,
  stageCrmCards,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "../services/sales-status.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

// ============================================================
// Helpers
// ============================================================

/** dd/mm/aaaa, aaaa-mm-dd e ISO → aaaa-mm-dd local. */
function parseDay(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeEmail(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Valor "R$ 1.234,56" / "1234.56" → number. */
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const limpo = String(val).replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  // Formato BR quando a vírgula vem depois do último ponto.
  const temVirgulaDecimal = limpo.lastIndexOf(",") > limpo.lastIndexOf(".");
  const n = Number(temVirgulaDecimal ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface SalesDailyPoint {
  /** 1 = primeiro dia com venda daquele funil. */
  dia: number;
  date: string;
  vendas: number;
  acumulado: number;
}

/** Todos os dias entre o primeiro e o último, inclusive os zerados. */
function fillGaps(counts: Map<string, number>): SalesDailyPoint[] {
  const dias = [...counts.keys()].sort();
  if (!dias.length) return [];

  const inicio = new Date(`${dias[0]}T00:00:00Z`);
  const fim = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  const out: SalesDailyPoint[] = [];
  let acumulado = 0;
  let i = 1;

  for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    // Dia sem venda vira 0 e permanece na série: o buraco é informação, e
    // omitir deslocaria o D-day de todos os dias seguintes.
    const n = counts.get(key) ?? 0;
    acumulado += n;
    out.push({ dia: i, date: key, vendas: n, acumulado });
    i++;
  }
  return out;
}

interface VendaLida {
  email: string;
  produto: string;
  day: string | null;
  bruto: number;
  origem: string;
}

export default fp(async function stageSalesJourneyRoutes(fastify) {
  /**
   * Lê as planilhas de venda de uma etapa e devolve as vendas já deduplicadas
   * e sem reembolso. Mesmas regras do dashboard de vendas, para os números não
   * divergirem entre um card e outro:
   *  - reembolso/chargeback excluem TAMBÉM a linha "paid" pareada (mesmo txId);
   *  - dedup por (planilha, txId, produto): order bump compartilha o txId da
   *    compra principal, então sem o produto na chave ele sumiria.
   */
  async function lerVendas(stageId: string, subtype: string): Promise<VendaLida[]> {
    const planilhas = await fastify.db
      .select()
      .from(stageSalesSpreadsheets)
      .where(
        and(eq(stageSalesSpreadsheets.stageId, stageId), eq(stageSalesSpreadsheets.subtype, subtype)),
      );

    const out: VendaLida[] = [];

    for (const sp of planilhas) {
      const mapping = (sp.columnMapping ?? {}) as {
        email?: string;
        productName?: string;
        valorBruto?: string;
        dataVenda?: string;
        transactionId?: string;
        status?: string;
      };

      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(sp.spreadsheetId, sp.sheetName);
      } catch {
        continue;
      }
      const col = (n: string | undefined) => (n ? data.headers.indexOf(n) : -1);
      const emailIdx = col(mapping.email);
      const dataIdx = col(mapping.dataVenda);
      const produtoIdx = col(mapping.productName);
      const brutoIdx = col(mapping.valorBruto);
      const txIdx = col(mapping.transactionId);
      const statusIdx = col(mapping.status);

      // Pass 1: transações reembolsadas.
      const reembolsados = new Set<string>();
      if (statusIdx !== -1 && txIdx !== -1) {
        for (const row of data.rows) {
          if (isRefundBucket(classifyRefundStatus(row[statusIdx], true))) {
            const tx = (row[txIdx] ?? "").trim();
            if (tx) reembolsados.add(tx);
          }
        }
      }

      const vistos = new Set<string>();
      for (const row of data.rows) {
        if (statusIdx !== -1) {
          if (isRefundBucket(classifyRefundStatus(row[statusIdx], true))) continue;
          const tx = txIdx !== -1 ? (row[txIdx] ?? "").trim() : "";
          if (tx && reembolsados.has(tx)) continue;
        }

        const email = emailIdx !== -1 ? normalizeEmail(row[emailIdx]) : "";
        const produto = produtoIdx !== -1 ? (row[produtoIdx] ?? "").trim() : "";
        const tx = txIdx !== -1 ? (row[txIdx] ?? "").trim() : "";

        if (tx) {
          const chave = `${sp.spreadsheetId}|${tx}|${produto.toLowerCase()}`;
          if (vistos.has(chave)) continue;
          vistos.add(chave);
        }

        const day = dataIdx !== -1 ? parseDay(row[dataIdx]) : null;
        out.push({
          email,
          produto,
          day,
          bruto: brutoIdx !== -1 ? parseNumber(row[brutoIdx]) : 0,
          origem: `${sp.spreadsheetName} / ${sp.sheetName}`,
        });
      }
    }

    return out;
  }

  /** Série diária de VENDAS (unidades) do produto principal, indexada em D-day. */
  async function serieDeVendas(stageId: string) {
    const vendas = await lerVendas(stageId, "main_product");
    const counts = new Map<string, number>();
    let semData = 0;
    for (const v of vendas) {
      // Linha sem data válida não entra: entraria como "hoje" e inflaria o
      // último dia, que é exatamente o dia que o time olha.
      if (!v.day) {
        semData++;
        continue;
      }
      counts.set(v.day, (counts.get(v.day) ?? 0) + 1);
    }
    return { points: fillGaps(counts), total: vendas.length - semData, semData, temPlanilha: vendas.length > 0 };
  }

  // ============================================================
  // 1) Comparação D1/D2/D3 com o funil anterior
  // ============================================================

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-daily-comparison",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [ctx] = await fastify.db
        .select({
          funnelName: funnels.name,
          compareFunnelId: funnels.compareFunnelId,
          stageType: funnelStages.stageType,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const atual = await serieDeVendas(p.data.stageId);

      let comparacao: {
        funnelName: string;
        points: SalesDailyPoint[];
        total: number;
        semPlanilha: boolean;
      } | null = null;

      if (ctx.compareFunnelId) {
        const [cmpFunnel] = await fastify.db
          .select({ id: funnels.id, name: funnels.name })
          .from(funnels)
          .where(eq(funnels.id, ctx.compareFunnelId))
          .limit(1);
        const [cmpStage] = await fastify.db
          .select({ id: funnelStages.id })
          .from(funnelStages)
          .where(
            and(
              eq(funnelStages.funnelId, ctx.compareFunnelId),
              eq(funnelStages.stageType, ctx.stageType),
            ),
          )
          .limit(1);

        if (cmpFunnel && cmpStage) {
          const s = await serieDeVendas(cmpStage.id);
          comparacao = {
            funnelName: cmpFunnel.name,
            points: s.points,
            total: s.total,
            semPlanilha: !s.temPlanilha,
          };
        }
      }

      // Delta na MESMA altura: acumulado de hoje contra o acumulado do anterior
      // no mesmo D-day. Comparar com o total final do anterior diria que estamos
      // sempre perdendo até o último dia — leitura inútil.
      let deltaPercent: number | null = null;
      const ultimoDia = atual.points.length;
      if (ultimoDia > 0 && comparacao?.points.length) {
        const base = comparacao.points.find((x) => x.dia === ultimoDia)?.acumulado;
        const meu = atual.points[ultimoDia - 1].acumulado;
        if (base && base > 0) deltaPercent = +(((meu - base) / base) * 100).toFixed(1);
      }

      return {
        funnelName: ctx.funnelName,
        semPlanilha: !atual.temPlanilha,
        total: atual.total,
        semData: atual.semData,
        points: atual.points,
        comparacao,
        deltaPercent,
      };
    },
  );

  // ============================================================
  // 2) Origem dos compradores (cruzamento com a pesquisa de aplicação)
  // ============================================================

  /**
   * Fontes de origem do lead: as pesquisas (`funnel_surveys`) e as planilhas de
   * aplicação/lead do funil. As UTMs vivem nelas — a planilha de venda costuma
   * ter UTM do checkout, que diz o último clique, não de onde o lead nasceu.
   */
  async function fontesDeOrigem(funnelId: string, stageIds: string[]) {
    const surveys = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(eq(funnelSurveys.funnelId, funnelId));

    const sheets = await fastify.db
      .select()
      .from(funnelSpreadsheets)
      .where(
        and(
          eq(funnelSpreadsheets.funnelId, funnelId),
          inArray(funnelSpreadsheets.type, ["applications", "leads", "custom"]),
        ),
      );

    void stageIds;

    return [
      ...surveys.map((s) => ({
        label: `${s.spreadsheetName} / ${s.sheetName}`,
        tipo: "pesquisa" as const,
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
      })),
      ...sheets.map((s) => ({
        label: s.label ?? `${s.spreadsheetName} / ${s.sheetName}`,
        tipo: (s.type === "applications" ? "aplicacao" : "captacao") as "aplicacao" | "captacao",
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
      })),
    ];
  }

  /** Índice de coluna por mapeamento explícito, com fallback por apelido. */
  function acharCol(headers: string[], mapeado: unknown, apelidos: RegExp): number {
    if (typeof mapeado === "string" && mapeado) {
      const i = headers.indexOf(mapeado);
      if (i !== -1) return i;
    }
    return headers.findIndex((h) => apelidos.test(h.trim()));
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/buyers-origin",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const vendas = await lerVendas(p.data.stageId, "main_product");
      // Um comprador = um e-mail. Quem compra duas vezes não conta como duas
      // origens, senão o maior comprador enviesaria o gráfico.
      const compradores = new Set(vendas.map((v) => v.email).filter(Boolean));
      if (compradores.size === 0) {
        return { semDados: true, totalCompradores: 0, casados: 0, semOrigem: 0, porFonte: [], porCampanha: [], fontes: [] };
      }

      const fontes = await fontesDeOrigem(p.data.funnelId, [p.data.stageId]);
      const origemPorEmail = new Map<string, { source: string; medium: string; campaign: string; fonteLabel: string }>();

      for (const f of fontes) {
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(f.spreadsheetId, f.sheetName);
        } catch {
          continue;
        }
        const emailIdx = acharCol(data.headers, f.mapping.email, /e-?mail/i);
        if (emailIdx === -1) continue;
        const srcIdx = acharCol(data.headers, f.mapping.utm_source, /^utm_?source$/i);
        const medIdx = acharCol(data.headers, f.mapping.utm_medium, /^utm_?medium$/i);
        const cmpIdx = acharCol(data.headers, f.mapping.utm_campaign, /^utm_?campaign$/i);

        for (const row of data.rows) {
          const email = normalizeEmail(row[emailIdx]);
          if (!email || !compradores.has(email)) continue;
          // Primeira fonte que casar vence: as fontes vêm de pesquisa primeiro,
          // que é a origem declarada do lead, não o último clique do checkout.
          if (origemPorEmail.has(email)) continue;
          origemPorEmail.set(email, {
            source: (srcIdx !== -1 ? row[srcIdx] : "")?.trim() || "(sem utm)",
            medium: (medIdx !== -1 ? row[medIdx] : "")?.trim() || "",
            campaign: (cmpIdx !== -1 ? row[cmpIdx] : "")?.trim() || "(sem campanha)",
            fonteLabel: f.label,
          });
        }
      }

      const contar = (chave: (o: { source: string; medium: string; campaign: string }) => string) => {
        const m = new Map<string, number>();
        for (const o of origemPorEmail.values()) m.set(chave(o), (m.get(chave(o)) ?? 0) + 1);
        return [...m.entries()]
          .map(([nome, compradores]) => ({ nome, compradores }))
          .sort((a, b) => b.compradores - a.compradores);
      };

      return {
        semDados: false,
        totalCompradores: compradores.size,
        casados: origemPorEmail.size,
        // Comprador que não aparece em nenhuma pesquisa/planilha de lead: comprou
        // sem passar pela aplicação, ou usou outro e-mail no checkout.
        semOrigem: compradores.size - origemPorEmail.size,
        porFonte: contar((o) => (o.medium ? `${o.source} / ${o.medium}` : o.source)),
        porCampanha: contar((o) => o.campaign),
        fontes: fontes.map((f) => ({ label: f.label, tipo: f.tipo })),
      };
    },
  );

  // ============================================================
  // 3) Jornada do lead
  // ============================================================

  const journeyQuery = z.object({
    email: z.string().trim().min(3).max(200),
    /** "funnel" (padrão, barato) ou "project" — varre todos os funis. */
    scope: z.enum(["funnel", "project"]).optional(),
  });

  interface EventoJornada {
    kind: "captacao" | "aplicacao" | "pesquisa" | "compra" | "venda_manual" | "comercial";
    date: string | null;
    titulo: string;
    detalhe: string | null;
    funnelName: string;
    stageName: string | null;
    campos: { label: string; valor: string }[];
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-journey",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      const q = journeyQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const alvo = normalizeEmail(q.data.email);
      const scope = q.data.scope ?? "funnel";

      // Escopo: por padrão só este funil. "project" varre todos os funis do
      // projeto — é o que responde "esse lead já apareceu em lançamento
      // anterior?", mas custa uma leitura de Sheets por planilha de cada funil.
      const funisAlvo = await fastify.db
        .select({ id: funnels.id, name: funnels.name })
        .from(funnels)
        .where(
          scope === "project"
            ? eq(funnels.projectId, p.data.projectId)
            : and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)),
        );
      if (funisAlvo.length === 0) return reply.code(404).send({ error: "Funil não encontrado" });

      const funnelIds = funisAlvo.map((f) => f.id);
      const nomeFunil = new Map(funisAlvo.map((f) => [f.id, f.name]));

      const etapas = await fastify.db
        .select({ id: funnelStages.id, name: funnelStages.name, funnelId: funnelStages.funnelId })
        .from(funnelStages)
        .where(inArray(funnelStages.funnelId, funnelIds));
      const nomeEtapa = new Map(etapas.map((s) => [s.id, s.name]));
      const funilDaEtapa = new Map(etapas.map((s) => [s.id, s.funnelId]));

      const eventos: EventoJornada[] = [];

      /** Colunas que não viram "campo" no detalhe do evento. */
      const ignorar = /^(submission|respondent|submitted|carimbo)/i;

      // --- Planilhas de lead / aplicação e pesquisas ---
      const sheets = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(inArray(funnelSpreadsheets.funnelId, funnelIds));
      const surveys = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(inArray(funnelSurveys.funnelId, funnelIds));

      const leitura: {
        kind: EventoJornada["kind"];
        label: string;
        funnelId: string;
        stageId: string | null;
        spreadsheetId: string;
        sheetName: string;
        mapping: Record<string, unknown>;
      }[] = [
        ...sheets.map((s) => ({
          kind: (s.type === "applications" ? "aplicacao" : "captacao") as EventoJornada["kind"],
          label: s.label ?? `${s.spreadsheetName} / ${s.sheetName}`,
          funnelId: s.funnelId,
          stageId: s.stageId,
          spreadsheetId: s.spreadsheetId,
          sheetName: s.sheetName,
          mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
        })),
        ...surveys.map((s) => ({
          kind: "pesquisa" as EventoJornada["kind"],
          label: `${s.spreadsheetName} / ${s.sheetName}`,
          funnelId: s.funnelId,
          stageId: s.stageId,
          spreadsheetId: s.spreadsheetId,
          sheetName: s.sheetName,
          mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
        })),
      ];

      for (const src of leitura) {
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(src.spreadsheetId, src.sheetName);
        } catch {
          continue;
        }
        const emailIdx = acharCol(data.headers, src.mapping.email, /e-?mail/i);
        if (emailIdx === -1) continue;
        const dataIdx = acharCol(
          data.headers,
          src.mapping.timestamp ?? src.mapping.date,
          /timestamp|carimbo|submitted|^data/i,
        );

        for (const row of data.rows) {
          if (normalizeEmail(row[emailIdx]) !== alvo) continue;
          const campos = data.headers
            .map((h, i) => ({ label: h.trim(), valor: (row[i] ?? "").trim() }))
            .filter((c) => c.label && c.valor && !ignorar.test(c.label));
          eventos.push({
            kind: src.kind,
            date: dataIdx !== -1 ? parseDay(row[dataIdx]) : null,
            titulo: src.label,
            detalhe: null,
            funnelName: nomeFunil.get(src.funnelId) ?? "—",
            stageName: src.stageId ? (nomeEtapa.get(src.stageId) ?? null) : null,
            campos: campos.slice(0, 30),
          });
        }
      }

      // --- Compras (todas as etapas, todos os subtypes) ---
      const etapaIds = etapas.map((s) => s.id);
      if (etapaIds.length > 0) {
        const vendaSheets = await fastify.db
          .select()
          .from(stageSalesSpreadsheets)
          .where(inArray(stageSalesSpreadsheets.stageId, etapaIds));

        for (const sp of vendaSheets) {
          const mapping = (sp.columnMapping ?? {}) as Record<string, unknown>;
          let data: { headers: string[]; rows: string[][] };
          try {
            data = await readSheetData(sp.spreadsheetId, sp.sheetName);
          } catch {
            continue;
          }
          const emailIdx = acharCol(data.headers, mapping.email, /e-?mail/i);
          if (emailIdx === -1) continue;
          const dataIdx = acharCol(data.headers, mapping.dataVenda, /data|timestamp/i);
          const prodIdx = acharCol(data.headers, mapping.productName, /produto|product/i);
          const brutoIdx = acharCol(data.headers, mapping.valorBruto, /bruto|valor|amount/i);
          const statusIdx = acharCol(data.headers, mapping.status, /status/i);

          for (const row of data.rows) {
            if (normalizeEmail(row[emailIdx]) !== alvo) continue;
            const status = statusIdx !== -1 ? (row[statusIdx] ?? "").trim() : "";
            const reembolso = statusIdx !== -1 && isRefundBucket(classifyRefundStatus(status, true));
            const valor = brutoIdx !== -1 ? parseNumber(row[brutoIdx]) : 0;
            eventos.push({
              kind: "compra",
              date: dataIdx !== -1 ? parseDay(row[dataIdx]) : null,
              titulo: prodIdx !== -1 && row[prodIdx] ? row[prodIdx].trim() : sp.spreadsheetName,
              // Reembolso aparece na jornada em vez de sumir: some do faturamento,
              // mas continua sendo um fato da relação com o lead.
              detalhe: reembolso ? `reembolsado (${status})` : status || null,
              funnelName: nomeFunil.get(funilDaEtapa.get(sp.stageId) ?? "") ?? "—",
              stageName: nomeEtapa.get(sp.stageId) ?? null,
              campos: [
                { label: "Planilha", valor: `${sp.spreadsheetName} / ${sp.sheetName}` },
                { label: "Tipo", valor: sp.subtype },
                ...(valor > 0 ? [{ label: "Valor", valor: valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }] : []),
              ],
            });
          }
        }

        // --- Vendas manuais ---
        const manuais = await fastify.db
          .select()
          .from(manualSales)
          .where(inArray(manualSales.stageId, etapaIds));
        for (const m of manuais) {
          if (normalizeEmail(m.customerEmail) !== alvo) continue;
          const valorManual = Number(m.value);
          eventos.push({
            kind: "venda_manual",
            date: m.saleDate ? parseDay(m.saleDate.toISOString()) : null,
            titulo: m.product ?? "Venda manual",
            detalhe: m.sellerName ? `vendedor: ${m.sellerName}` : null,
            funnelName: nomeFunil.get(funilDaEtapa.get(m.stageId) ?? "") ?? "—",
            stageName: nomeEtapa.get(m.stageId) ?? null,
            campos: [
              ...(m.customerName ? [{ label: "Nome", valor: m.customerName }] : []),
              ...(Number.isFinite(valorManual) && valorManual > 0
                ? [{ label: "Valor", valor: valorManual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }]
                : []),
            ],
          });
        }

        // --- Card no comercial ---
        const cards = await fastify.db
          .select()
          .from(stageCrmCards)
          .where(inArray(stageCrmCards.stageId, etapaIds));
        for (const c of cards) {
          if (normalizeEmail(c.customerEmail) !== alvo) continue;
          eventos.push({
            kind: "comercial",
            date: c.createdAt ? parseDay(c.createdAt.toISOString()) : null,
            titulo: c.customerName || "Card no comercial",
            detalhe: c.callStatus ?? null,
            funnelName: nomeFunil.get(funilDaEtapa.get(c.stageId) ?? "") ?? "—",
            stageName: nomeEtapa.get(c.stageId) ?? null,
            campos: [
              ...(c.customerPhone ? [{ label: "Telefone", valor: c.customerPhone }] : []),
              ...((c.callCount ?? 0) > 0 ? [{ label: "Ligações", valor: String(c.callCount) }] : []),
            ],
          });
        }
      }

      // Sem data vai para o fim: é registro real, só não dá pra posicionar no
      // tempo — esconder seria mentir sobre o que existe.
      eventos.sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return 0;
      });

      return {
        email: alvo,
        scope,
        encontrado: eventos.length > 0,
        eventos,
        resumo: {
          total: eventos.length,
          compras: eventos.filter((e) => e.kind === "compra" || e.kind === "venda_manual").length,
          primeiroContato: eventos.find((e) => e.date)?.date ?? null,
          funis: [...new Set(eventos.map((e) => e.funnelName))],
        },
      };
    },
  );
});
