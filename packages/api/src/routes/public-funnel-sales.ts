/**
 * Consultas ENXUTAS de venda: um FUNIL inteiro ou UMA etapa.
 *
 * Duas queixas do consumo real resolvidas aqui:
 *
 * 1. **Atrito de ID.** O `sales-daily` legado exige `projectId` + `stageId`, mas
 *    quem está olhando o app só tem o stageId à mão — e precisava de 2 chamadas
 *    de discovery só pra descobrir o projectId. As rotas daqui pedem só o ID do
 *    recurso e resolvem o resto server-side.
 * 2. **Payload gigante.** O cache traz 7 blocos de quebra (byDay, porOrigem,
 *    porCanal, porProduto, porPlataforma, porProdutoPlataforma,
 *    porOrigemTemperatura). Quem só quer "quantas vendas" recebia tudo. Aqui o
 *    default é o RESUMO e os blocos entram sob demanda via `?include=`.
 *
 * ARMADILHA que o endpoint de funil resolve: a planilha de vendas do PERPÉTUO
 * vive no FUNIL (`funnel_spreadsheets` type='perpetual_sales', stage_id NULL) e
 * é herdada por TODA etapa free/paid (ver `resolveSalesSheetsForStage`). Somar
 * os caches das etapas cegamente contaria as mesmas transações N vezes. Por
 * isso cada planilha física só entra uma vez, atribuída à primeira etapa
 * (sortOrder) que a usa.
 */

import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import {
  getFreshSalesDaily,
  resolveSalesSheetsForStage,
  type SalesDailyPayload,
} from "../services/sales-daily-sync.js";

const funnelIdParamSchema = z.object({ funnelId: z.string().uuid() });
const stageIdParamSchema = z.object({ stageId: z.string().uuid() });

/** Blocos pesados — só saem quando pedidos em `?include=`. */
const INCLUDABLE = [
  "byDay",
  "porOrigem",
  "porCanal",
  "porProduto",
  "porPlataforma",
  "porProdutoPlataforma",
  "porOrigemTemperatura",
  "byStage",
] as const;
type Includable = (typeof INCLUDABLE)[number];

const querySchema = z.object({
  /** CSV dos blocos desejados, ou "all". Vazio/ausente = só o resumo. */
  include: z.string().optional(),
  /** `fresh=1` força recálculo ao vivo, ignorando a idade do cache. */
  fresh: z.string().optional(),
});

/** `?fresh=1` → maxAge 0 (recalcula sempre). Senão, o default do serviço. */
function maxAgeFrom(fresh: string | undefined, configured: number | undefined): number | undefined {
  if (fresh === "1" || fresh === "true") return 0;
  return configured != null ? configured * 1000 : undefined;
}

/**
 * Parseia `?include=`. Retorna um Set — nomes desconhecidos são ignorados em
 * silêncio de propósito: é query string escrita à mão, e derrubar a chamada
 * inteira por um typo num bloco opcional seria pior que devolver o resumo.
 */
function parseInclude(raw: string | undefined): Set<Includable> {
  if (!raw) return new Set();
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === "all")) return new Set(INCLUDABLE);
  const wanted = new Set<Includable>();
  for (const p of parts) {
    const hit = INCLUDABLE.find((k) => k.toLowerCase() === p.toLowerCase());
    if (hit) wanted.add(hit);
  }
  return wanted;
}

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
  // ---- GET /api/public/v1/stages/:stageId/sales ----
  // Vendas de UMA etapa, só com o stageId e só o resumo por padrão.
  // Equivale ao sales-daily legado, sem exigir projectId e sem despejar os 7
  // blocos de quebra. `?include=byDay,porProduto` (ou `all`) traz o resto.
  fastify.get<{ Params: z.infer<typeof stageIdParamSchema>; Querystring: z.infer<typeof querySchema> }>(
    "/api/public/v1/stages/:stageId/sales",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = stageIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "stageId inválido", code: "BAD_REQUEST" });
      }
      const { stageId } = parsed.data;
      const q = querySchema.safeParse(request.query).data;
      const include = parseInclude(q?.include);
      const maxAgeMs = maxAgeFrom(q?.fresh, fastify.config.SALES_PUBLIC_MAX_AGE_SEC);

      // projectId/funnelId resolvidos aqui — é o atrito que o consumidor tinha.
      const [stage] = await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          stageType: funnelStages.stageType,
          funnelId: funnelStages.funnelId,
          funnelName: funnels.name,
          projectId: funnels.projectId,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(eq(funnelStages.id, stageId))
        .limit(1);
      if (!stage) {
        return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });
      }

      // Recalcula ao vivo quando o cache está velho/ausente — a API nunca
      // devolve venda desatualizada por causa da cadência do job.
      let fresh: Awaited<ReturnType<typeof getFreshSalesDaily>>;
      try {
        fresh = await getFreshSalesDaily(fastify.db, stage.projectId, stageId, { maxAgeMs });
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : "Falha ao calcular vendas",
          code: "SALES_COMPUTE_FAILED",
        });
      }

      const base = {
        stageId,
        stageName: stage.name,
        stageType: stage.stageType,
        funnelId: stage.funnelId,
        funnelName: stage.funnelName,
        projectId: stage.projectId,
      };

      if (!fresh.payload) {
        return {
          ...base,
          semDados: true,
          message: "Etapa sem nenhuma fonte de vendas (nenhuma planilha de venda vinculada e nenhuma venda manual).",
        };
      }

      const p = fresh.payload;
      const out: Record<string, unknown> = {
        ...base,
        computedAt: fresh.computedAt,
        dataSource: fresh.source,
        range: p.range,
        totalVendas: p.totalVendas,
        faturamentoBruto: p.faturamentoBruto,
        faturamentoLiquido: p.faturamentoLiquido,
        // Leves e necessários pra interpretar o número: de quais planilhas veio
        // e quantas vendas manuais entraram. Ficam sempre.
        subtypesConsidered: p.subtypesConsidered,
        manualSalesIncluded: p.manualSalesIncluded,
      };
      if (include.has("byDay")) out.byDay = p.byDay;
      if (include.has("porOrigem")) out.porOrigem = p.porOrigem;
      if (include.has("porCanal")) out.porCanal = p.porCanal;
      if (include.has("porProduto")) out.porProduto = p.porProduto;
      if (include.has("porPlataforma")) out.porPlataforma = p.porPlataforma;
      if (include.has("porProdutoPlataforma")) out.porProdutoPlataforma = p.porProdutoPlataforma;
      if (include.has("porOrigemTemperatura")) out.porOrigemTemperatura = p.porOrigemTemperatura;
      return out;
    },
  );

  // ---- GET /api/public/v1/funnels/:funnelId/sales ----
  fastify.get<{ Params: z.infer<typeof funnelIdParamSchema>; Querystring: z.infer<typeof querySchema> }>(
    "/api/public/v1/funnels/:funnelId/sales",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = funnelIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "funnelId inválido", code: "BAD_REQUEST" });
      }
      const { funnelId } = parsed.data;
      const q = querySchema.safeParse(request.query).data;
      const include = parseInclude(q?.include);
      const maxAgeMs = maxAgeFrom(q?.fresh, fastify.config.SALES_PUBLIC_MAX_AGE_SEC);

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

      // Vendas frescas de cada etapa (recalcula ao vivo o que estiver velho).
      // Sequencial de propósito: o `readSheetData` tem cache de 30s por planilha
      // e etapas do mesmo funil costumam repetir a fonte — em paralelo a rajada
      // sairia antes do primeiro resultado povoar esse cache.
      const cacheByStage = new Map<string, { payload: SalesDailyPayload; computedAt: Date | null }>();
      const falhas: string[] = [];
      for (const s of stages) {
        try {
          const fresh = await getFreshSalesDaily(fastify.db, funnel.projectId, s.id, { maxAgeMs });
          if (fresh.payload) cacheByStage.set(s.id, { payload: fresh.payload, computedAt: fresh.computedAt });
        } catch {
          // Etapa que falhou fica fora do total e é reportada em `avisos` —
          // melhor um total explicitamente incompleto que a chamada inteira 502.
          falhas.push(s.name);
        }
      }

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
      if (falhas.length > 0) {
        avisos.push(
          `Falha ao ler a planilha de ${falhas.length} etapa(s) (${falhas.join(", ")}) — ficaram FORA do total.`,
        );
      }

      for (const stage of stages) {
        const cached = cacheByStage.get(stage.id);
        if (!cached) {
          byStage.push({
            stageId: stage.id,
            stageName: stage.name,
            stageType: stage.stageType,
            semDados: true,
            contabilizado: false,
            motivo: falhas.includes(stage.name)
              ? "Falha ao ler a planilha de vendas desta etapa."
              : "Etapa sem fonte de vendas (nenhuma planilha de venda vinculada e nenhuma venda manual).",
          });
          continue;
        }

        const payload = cached.payload;
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
        if (cached.computedAt && (!oldestComputedAt || cached.computedAt < oldestComputedAt)) {
          oldestComputedAt = cached.computedAt;
        }

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

      const out: Record<string, unknown> = {
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
      };
      // `avisos` só aparece quando há o que avisar — num resumo enxuto, chave
      // vazia é ruído. Quando existe, é importante e vem sempre.
      if (avisos.length > 0) out.avisos = avisos;
      if (include.has("byDay")) {
        out.byDay = [...byDay.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, e]) => ({
            date,
            faturamentoBruto: round2(e.bruto),
            faturamentoLiquido: round2(e.liquido),
            ingressos: { pago: e.pago, org: e.org, semTrack: e.semTrack, total: e.pago + e.org + e.semTrack },
          }));
      }
      if (include.has("porOrigem")) out.porOrigem = bucketsToArray(porOrigem, "origem");
      if (include.has("porCanal")) out.porCanal = bucketsToArray(porCanal, "canal");
      if (include.has("porProduto")) out.porProduto = bucketsToArray(porProduto, "produto").slice(0, 30);
      if (include.has("porPlataforma")) out.porPlataforma = bucketsToArray(porPlataforma, "plataforma");
      if (include.has("byStage")) out.byStage = byStage;
      return out;
    },
  );
});
