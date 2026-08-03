/**
 * Vendas agregadas de um FUNIL inteiro.
 *
 * Os endpoints de venda existentes são todos por ETAPA (`sales-daily`,
 * `sales-rows`). Para responder "quantas vendas teve no funil X" o consumidor
 * tinha que listar as etapas, chamar sales-daily em cada uma e somar na mão.
 * Aqui a soma é feita server-side, em cima do MESMO cache pré-computado — sem
 * ler Google Sheets, sem sync novo.
 *
 * ARMADILHA que este endpoint resolve: a planilha de vendas do PERPÉTUO vive no
 * FUNIL (`funnel_spreadsheets` type='perpetual_sales', stage_id NULL) e é
 * herdada por TODA etapa free/paid (ver `resolveSalesSheetsForStage`). Somar os
 * caches das etapas cegamente contaria as mesmas transações N vezes. Por isso
 * cada planilha física só entra uma vez, atribuída à primeira etapa (sortOrder)
 * que a usa.
 */

import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages, publicMetricsCache } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import {
  SALES_DAILY_SCOPE,
  resolveSalesSheetsForStage,
  type SalesDailyPayload,
} from "../services/sales-daily-sync.js";

const funnelIdParamSchema = z.object({ funnelId: z.string().uuid() });

type Bucket = { vendas: number; bruto: number; liquido: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Soma em `map[key]` mantendo o shape {vendas, bruto, liquido}. */
function addTo(map: Map<string, Bucket>, key: string, vendas: number, bruto: number, liquido: number) {
  const cur = map.get(key) ?? { vendas: 0, bruto: 0, liquido: 0 };
  cur.vendas += vendas;
  cur.bruto += bruto;
  cur.liquido += liquido;
  map.set(key, cur);
}

function bucketsToArray(map: Map<string, Bucket>, keyName: string) {
  return [...map.entries()]
    .map(([k, v]) => ({ [keyName]: k, vendas: v.vendas, bruto: round2(v.bruto), liquido: round2(v.liquido) }))
    .sort((a, b) => b.vendas - a.vendas);
}

export default fp(async function publicFunnelSalesRoutes(fastify) {
  // ---- GET /api/public/v1/funnels/:funnelId/sales ----
  fastify.get<{ Params: z.infer<typeof funnelIdParamSchema> }>(
    "/api/public/v1/funnels/:funnelId/sales",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = funnelIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "funnelId inválido", code: "BAD_REQUEST" });
      }
      const { funnelId } = parsed.data;

      const [funnel] = await fastify.db
        .select({ id: funnels.id, projectId: funnels.projectId, name: funnels.name, type: funnels.type })
        .from(funnels)
        .where(eq(funnels.id, funnelId))
        .limit(1);
      if (!funnel) {
        return reply.code(404).send({ error: "Funil não encontrado", code: "NOT_FOUND" });
      }

      const stages = await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          stageType: funnelStages.stageType,
          sortOrder: funnelStages.sortOrder,
        })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId))
        .orderBy(asc(funnelStages.sortOrder));

      if (stages.length === 0) {
        return {
          funnelId,
          projectId: funnel.projectId,
          funnelName: funnel.name,
          funnelType: funnel.type,
          semDados: true,
          message: "Funil sem etapas.",
        };
      }

      // Cache de vendas de todas as etapas, numa query só.
      const cacheRows = await fastify.db
        .select({
          key: publicMetricsCache.key,
          payload: publicMetricsCache.payload,
          computedAt: publicMetricsCache.computedAt,
        })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, funnel.projectId),
            eq(publicMetricsCache.scope, SALES_DAILY_SCOPE),
            inArray(
              publicMetricsCache.key,
              stages.map((s) => s.id),
            ),
          ),
        );
      const cacheByStage = new Map(cacheRows.map((r) => [r.key, r]));

      // Dedup de FONTE: uma planilha física (spreadsheetId|sheetName) só pode
      // ser contada uma vez no funil. Só consulta o banco — não lê Sheets.
      const seenSheets = new Set<string>();

      let totalVendas = 0;
      let totalBruto = 0;
      let totalLiquido = 0;
      let minDate: string | null = null;
      let maxDate: string | null = null;
      let oldestComputedAt: Date | null = null;

      const byDay = new Map<string, { bruto: number; liquido: number; pago: number; org: number; semTrack: number }>();
      const porOrigem = new Map<string, Bucket>();
      const porCanal = new Map<string, Bucket>();
      const porProduto = new Map<string, Bucket>();
      const porPlataforma = new Map<string, Bucket>();

      const byStage: Record<string, unknown>[] = [];
      const avisos: string[] = [];

      for (const stage of stages) {
        const cached = cacheByStage.get(stage.id);
        if (!cached) {
          byStage.push({
            stageId: stage.id,
            stageName: stage.name,
            stageType: stage.stageType,
            semDados: true,
            contabilizado: false,
            motivo: "Sem cache de vendas (etapa sem planilha de venda ou sync ainda não rodou).",
          });
          continue;
        }

        const payload = cached.payload as SalesDailyPayload;
        const { sheets } = await resolveSalesSheetsForStage(fastify.db, stage.id);
        const sheetKeys = sheets.map((s) => `${s.spreadsheetId}|${s.sheetName}`);
        const novas = sheetKeys.filter((k) => !seenSheets.has(k));
        const repetidas = sheetKeys.length - novas.length;

        // Toda fonte desta etapa já foi contada por uma etapa anterior — é o caso
        // do perpétuo herdado. Somar de novo dobraria o faturamento do funil.
        if (sheetKeys.length > 0 && novas.length === 0) {
          byStage.push({
            stageId: stage.id,
            stageName: stage.name,
            stageType: stage.stageType,
            totalVendas: payload.totalVendas,
            faturamentoBruto: payload.faturamentoBruto,
            faturamentoLiquido: payload.faturamentoLiquido,
            semDados: false,
            contabilizado: false,
            motivo:
              "Planilha(s) já contabilizada(s) em etapa anterior do funil (fonte compartilhada) — fora do total pra não duplicar.",
          });
          continue;
        }

        // Mistura de fonte nova + compartilhada: o cache é agregado, então não dá
        // pra separar o que veio de cada planilha. Soma (perder as vendas próprias
        // seria pior) e avisa que o total pode estar inflado.
        if (repetidas > 0) {
          avisos.push(
            `Etapa "${stage.name}" usa ${repetidas} planilha(s) já contabilizada(s) em etapa anterior, junto de fonte própria. O total do funil pode contar essas transações duas vezes.`,
          );
        }
        for (const k of sheetKeys) seenSheets.add(k);

        totalVendas += payload.totalVendas;
        totalBruto += payload.faturamentoBruto;
        totalLiquido += payload.faturamentoLiquido;

        if (payload.range?.from && (!minDate || payload.range.from < minDate)) minDate = payload.range.from;
        if (payload.range?.to && (!maxDate || payload.range.to > maxDate)) maxDate = payload.range.to;
        if (!oldestComputedAt || cached.computedAt < oldestComputedAt) oldestComputedAt = cached.computedAt;

        for (const d of payload.byDay ?? []) {
          const e = byDay.get(d.date) ?? { bruto: 0, liquido: 0, pago: 0, org: 0, semTrack: 0 };
          e.bruto += d.faturamentoBruto;
          e.liquido += d.faturamentoLiquido;
          e.pago += d.ingressos?.pago ?? 0;
          e.org += d.ingressos?.org ?? 0;
          e.semTrack += d.ingressos?.semTrack ?? 0;
          byDay.set(d.date, e);
        }
        for (const o of payload.porOrigem ?? []) addTo(porOrigem, o.origem, o.vendas, o.bruto, o.liquido);
        for (const c of payload.porCanal ?? []) addTo(porCanal, c.canal, c.vendas, c.bruto, c.liquido);
        for (const p of payload.porProduto ?? []) addTo(porProduto, p.produto, p.vendas, p.bruto, p.liquido);
        for (const p of payload.porPlataforma ?? []) addTo(porPlataforma, p.plataforma, p.vendas, p.bruto, p.liquido);

        byStage.push({
          stageId: stage.id,
          stageName: stage.name,
          stageType: stage.stageType,
          totalVendas: payload.totalVendas,
          faturamentoBruto: payload.faturamentoBruto,
          faturamentoLiquido: payload.faturamentoLiquido,
          semDados: false,
          contabilizado: true,
          computedAt: cached.computedAt,
        });
      }

      const contabilizadas = byStage.filter((s) => s.contabilizado).length;
      if (contabilizadas === 0) {
        return {
          funnelId,
          projectId: funnel.projectId,
          funnelName: funnel.name,
          funnelType: funnel.type,
          semDados: true,
          message:
            "Nenhuma etapa do funil tem vendas em cache (sem planilha de venda ou sync ainda não rodou).",
          byStage,
        };
      }

      return {
        funnelId,
        projectId: funnel.projectId,
        funnelName: funnel.name,
        funnelType: funnel.type,
        // computedAt mais ANTIGO entre as etapas somadas: é a frescura real do
        // total (o agregado só é tão novo quanto sua parte mais velha).
        computedAt: oldestComputedAt,
        range: { from: minDate, to: maxDate },
        totalVendas,
        faturamentoBruto: round2(totalBruto),
        faturamentoLiquido: round2(totalLiquido),
        stagesContabilizadas: contabilizadas,
        stagesTotal: stages.length,
        avisos,
        byDay: [...byDay.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, e]) => ({
            date,
            faturamentoBruto: round2(e.bruto),
            faturamentoLiquido: round2(e.liquido),
            ingressos: { pago: e.pago, org: e.org, semTrack: e.semTrack, total: e.pago + e.org + e.semTrack },
          })),
        porOrigem: bucketsToArray(porOrigem, "origem"),
        porCanal: bucketsToArray(porCanal, "canal"),
        porProduto: bucketsToArray(porProduto, "produto").slice(0, 30),
        porPlataforma: bucketsToArray(porPlataforma, "plataforma"),
        byStage,
      };
    },
  );
});
