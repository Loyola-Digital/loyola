/**
 * Story 41.7 — CRUD da config do relatório de funil perpétuo (botão 3).
 *
 * Config por FUNIL: premissas (prefixo auxiliar, produto, order bumps, split de
 * formato, origens pagas), overrides de taxa e o flag `validado`, que é o gate
 * do §C.8.
 *
 * Guest é bloqueado em todos, pelo mesmo motivo da 41.1: marcar `validado` é
 * afirmar que alguém conferiu os números contra o painel.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { perpetualReportConfigs, funnels, users } from "../db/schema.js";
import {
  loadPerpetualReportConfigRaw,
  assertPerpetualScope,
  resolvePerpetualRates,
  ReportScopeError,
  PLATFORM_RATE_BREAKDOWN,
} from "../services/perpetual-report-config.js";

const funnelParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Taxa como fração (0.0499 = 4,99%). */
const rate = z.number().min(0).max(0.99).nullable().optional();

const configBodySchema = z.object({
  prefixoCampanha: z.string().trim().max(120).nullable().optional(),
  produto: z.string().trim().max(255).nullable().optional(),
  produtosOrderBump: z.array(z.string().trim().min(1)).optional(),
  temSplitFormato: z.boolean().optional(),
  origensPagas: z.array(z.string().trim().min(1)).optional(),
  inicioTrafego: isoDate.nullable().optional(),
  impostoPct: rate,
  taxaPlataformaPct: rate,
  taxaImpostoPct: rate,
  taxaOutrosPct: rate,
  // Story 29.35 — inputs do CAC alvo. `margemDesejadaPct` usa o mesmo
  // validador `rate` das demais taxas: fração, nunca pontos percentuais (U-01).
  margemDesejadaPct: rate,
  /** Valores em reais, não frações — por isso não usam `rate`. */
  cmv: z.number().min(0).nullable().optional(),
  gatewayFixo: z.number().min(0).nullable().optional(),
  // Story 29.36 — cadeia de conversão.
  funnelArchitecture: z.string().trim().max(40).nullable().optional(),
  chainDefectReading: z.string().trim().max(120).nullable().optional(),
  /**
   * Taxas digitadas. A janela é OBRIGATÓRIA em cada entrada: sem ela não dá
   * para verificar homogeneidade (AGG-01), e uma taxa velha multiplicada por
   * uma nova produz número plausível e sem significado.
   */
  manualRates: z
    .record(
      z.string(),
      z.object({
        value: z.number().gt(0).max(1),
        source: z.string().trim().min(1).max(200),
        windowStart: isoDate,
        windowEnd: isoDate,
        measuredAt: z.string(),
      }),
    )
    .optional(),
});

export default fp(async function perpetualReportConfigRoutes(fastify) {
  /**
   * Valida a cadeia project→funnel e que o funil é MESMO perpétuo. Config de
   * perpétuo em funil de lançamento produziria relatório com métricas que não
   * existem naquele domínio — melhor 400 explícito que número sem sentido.
   */
  async function resolveFunnel(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id, type: funnels.type, name: funnels.name })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/perpetual-report-config";

  // ---- GET — config + taxas resolvidas + estado do gate ----
  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = funnelParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId } = parsed.data;

    const funnel = await resolveFunnel(projectId, funnelId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const cfg = await loadPerpetualReportConfigRaw(fastify.db, funnelId);

    let bloqueio: { erro: string; detalhe: string; acao: string } | null = null;
    if (!cfg) {
      bloqueio = new ReportScopeError(
        `funil=${funnelId} não tem configuração de relatório perpétuo cadastrada — ` +
          `sem config não há como afirmar origens pagas, taxas nem split de formato`,
      ).toResponse();
    } else {
      try {
        assertPerpetualScope(cfg);
      } catch (err) {
        if (!(err instanceof ReportScopeError)) throw err;
        bloqueio = err.toResponse();
      }
    }

    let validadoPorNome: string | null = null;
    if (cfg?.validadoPor) {
      const [u] = await fastify.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, cfg.validadoPor))
        .limit(1);
      validadoPorNome = u?.name ?? null;
    }

    // Taxas dos dois ramos: a UI mostra qual vale conforme a planilha tenha ou
    // não coluna de status (§C.3.4) — sem isso o usuário não entende por que o
    // relatório dele usa 79,01% e o do vizinho usa 83,01%.
    const ratesComStatus = resolvePerpetualRates(cfg, "kiwify", true);
    const ratesSemStatus = resolvePerpetualRates(cfg, "kiwify", false);

    return {
      funnel: { id: funnel.id, name: funnel.name, type: funnel.type },
      config: cfg
        ? {
            prefixoCampanha: cfg.prefixoCampanha,
            produto: cfg.produto,
            produtosOrderBump: cfg.produtosOrderBump,
            temSplitFormato: cfg.temSplitFormato,
            origensPagas: cfg.origensPagas,
            inicioTrafego: cfg.inicioTrafego,
            impostoPct: cfg.impostoPct,
            impostoOrigem: cfg.impostoOrigem,
            taxaPlataformaPct: cfg.taxaPlataformaPct,
            taxaImpostoPct: cfg.taxaImpostoPct,
            taxaOutrosPct: cfg.taxaOutrosPct,
            // Story 29.35 — inputs do CAC alvo.
            margemDesejadaPct: cfg.margemDesejadaPct,
            cmv: cfg.cmv,
            gatewayFixo: cfg.gatewayFixo,
            // Story 29.36 — cadeia.
            funnelArchitecture: cfg.funnelArchitecture,
            chainDefectReading: cfg.chainDefectReading,
            manualRates: cfg.manualRates,
            validado: cfg.validado,
            validadoEm: cfg.validadoEm,
            validadoPor: cfg.validadoPor,
            validadoPorNome,
          }
        : null,
      /** Vêm do funil, não da config — a UI mostra em modo leitura. */
      herdado: {
        metaAccountId: cfg?.metaAccountId ?? null,
        campanhasVinculadas: cfg?.campanhas.length ?? 0,
      },
      resolvido: { comStatusReal: ratesComStatus, semStatusReal: ratesSemStatus },
      defaults: PLATFORM_RATE_BREAKDOWN,
      /** null = relatório liberado. Preenchido = motivo do bloqueio (§C.8). */
      bloqueio,
    };
  });

  // ---- PUT — grava/atualiza (upsert por funnel_id) ----
  fastify.put(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = funnelParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = configBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const { projectId, funnelId } = parsed.data;

    const funnel = await resolveFunnel(projectId, funnelId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });
    if (funnel.type !== "perpetual") {
      return reply.code(400).send({
        error:
          "Este funil é de lançamento, não perpétuo — a config do botão 3 só se " +
          "aplica a funis perpétuos. Use a config de relatório da etapa (Story 41.1).",
        code: "FUNNEL_NOT_PERPETUAL",
      });
    }

    const [existing] = await fastify.db
      .select()
      .from(perpetualReportConfigs)
      .where(eq(perpetualReportConfigs.funnelId, funnelId))
      .limit(1);

    const d = body.data;
    const asNumeric = (v: number | null | undefined) =>
      v === null || v === undefined ? null : String(v);

    // Mudou premissa → a conferência anterior não vale mais. Mesma regra da 41.1:
    // `validado` é afirmação sobre um conjunto específico de premissas; trocar
    // qualquer uma delas sem resetar deixaria o gate mentindo.
    const premissaMudou =
      existing != null &&
      (fieldChanged(d.prefixoCampanha, existing.prefixoCampanha) ||
        (d.temSplitFormato !== undefined && d.temSplitFormato !== existing.temSplitFormato) ||
        (d.origensPagas !== undefined &&
          !sameStringSet(d.origensPagas, existing.origensPagas ?? [])) ||
        numericChanged(d.taxaPlataformaPct, existing.taxaPlataformaPct) ||
        numericChanged(d.taxaImpostoPct, existing.taxaImpostoPct) ||
        numericChanged(d.taxaOutrosPct, existing.taxaOutrosPct) ||
        numericChanged(d.impostoPct, existing.impostoPct));
    // Story 29.35: `margemDesejadaPct`, `cmv` e `gatewayFixo` NÃO entram aqui,
    // de propósito. `validado` afirma que as premissas do RELATÓRIO foram
    // conferidas — faturamento, investimento, taxas de plataforma. Os três
    // campos novos não alteram nenhum número do relatório: alimentam só o CAC
    // alvo, que é leitura à parte. Resetar a validação por causa deles
    // invalidaria uma conferência que continua verdadeira.

    const values = {
      funnelId,
      prefixoCampanha: d.prefixoCampanha ?? null,
      produto: d.produto ?? null,
      produtosOrderBump: d.produtosOrderBump ?? [],
      temSplitFormato: d.temSplitFormato ?? false,
      origensPagas: d.origensPagas ?? ["meta"],
      inicioTrafego: d.inicioTrafego ?? null,
      impostoPct: asNumeric(d.impostoPct),
      taxaPlataformaPct: asNumeric(d.taxaPlataformaPct),
      taxaImpostoPct: asNumeric(d.taxaImpostoPct),
      taxaOutrosPct: asNumeric(d.taxaOutrosPct),
      // Story 29.35 — inputs do CAC alvo.
      margemDesejadaPct: asNumeric(d.margemDesejadaPct),
      cmv: asNumeric(d.cmv),
      gatewayFixo: asNumeric(d.gatewayFixo),
      // Story 29.36 — preserva o que já existe quando o PUT não manda o campo:
      // a aba MVP salva só o que ela edita, e um `?? {}` apagaria as taxas.
      funnelArchitecture: d.funnelArchitecture !== undefined ? d.funnelArchitecture : (existing?.funnelArchitecture ?? null),
      chainDefectReading: d.chainDefectReading !== undefined ? d.chainDefectReading : (existing?.chainDefectReading ?? null),
      manualRates: d.manualRates !== undefined ? d.manualRates : (existing?.manualRates ?? {}),
      updatedAt: new Date(),
    };

    if (!existing) {
      await fastify.db.insert(perpetualReportConfigs).values(values);
    } else {
      await fastify.db
        .update(perpetualReportConfigs)
        .set(
          premissaMudou
            ? { ...values, validado: false, validadoEm: null, validadoPor: null }
            : values,
        )
        .where(eq(perpetualReportConfigs.funnelId, funnelId));
    }

    return { ok: true, validadoResetado: premissaMudou };
  });

  // ---- POST /validate — libera o gate ----
  fastify.post(`${base}/validate`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = funnelParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId } = parsed.data;

    const funnel = await resolveFunnel(projectId, funnelId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const [existing] = await fastify.db
      .select({ id: perpetualReportConfigs.id })
      .from(perpetualReportConfigs)
      .where(eq(perpetualReportConfigs.funnelId, funnelId))
      .limit(1);
    if (!existing) {
      return reply.code(404).send({
        error: "Configure o funil antes de validar — não há premissas para conferir",
      });
    }

    await fastify.db
      .update(perpetualReportConfigs)
      .set({
        validado: true,
        validadoEm: new Date(),
        validadoPor: request.userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(perpetualReportConfigs.funnelId, funnelId));

    return { ok: true, validado: true };
  });
});

/** `null` e `undefined` são coisas diferentes no PUT: undefined = não mexeu. */
function fieldChanged(next: string | null | undefined, prev: string | null): boolean {
  if (next === undefined) return false;
  return (next ?? null) !== prev;
}

/** `numeric` volta como string do driver — comparar como número evita falso positivo. */
function numericChanged(
  next: number | null | undefined,
  prev: string | number | null,
): boolean {
  if (next === undefined) return false;
  const prevNum = prev === null || prev === "" ? null : Number(prev);
  return (next ?? null) !== prevNum;
}

/** Origens pagas é conjunto, não lista ordenada — reordenar não é mudança de premissa. */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}
