/**
 * Story 49.1 — CRUD da config do gerador de debriefing + estado do gate.
 *
 *   GET  …/stages/:stageId/debriefing/config           config, gate, imposto, perguntas
 *   PUT  …/stages/:stageId/debriefing/config           upsert por etapa (AC2–AC5, AC10)
 *   POST …/stages/:stageId/debriefing/config/validate  marca a combinação como conferida
 *
 * Prefixo `…/debriefing/` alinhado com o `POST …/debriefing/generate` da 49.6.
 * Guest é bloqueado em todos (403): `validado` é a afirmação de que alguém do
 * time conferiu os números contra as fixtures do expert. A etapa precisa ser do
 * tipo Debriefing e pertencer ao funil/projeto da URL (senão 404 — IDOR).
 *
 * Padrão de `routes/launch-report-config.ts` (41.1); o gate do Resumão não muda.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SURVEY_CANONICAL_FIELDS, type SurveyCanonicalField } from "../db/schema.js";
import type { Database } from "../db/client.js";
import { resolveImpostoPct } from "../services/launch-report-config.js";
import {
  DEBRIEFING_PAPEIS,
  DIMENSOES_DE_CRIATIVO,
  VALORES_VAZIOS,
  avaliarBloqueioDebriefing,
  camposFaltantesDebriefing,
  criarDebriefingConfigStore,
  dataExiste,
  erroTipoDeFunilNaoSuportado,
  etapasComChaveConfirmada,
  isCombinacaoLiberada,
  loadDebriefingConfigRaw,
  normalizarCloserMediums,
  premissaMudou,
  problemasDasPerguntas,
  problemasDoCorpoLancamento,
  tipoAceitaConfig,
  valoresDaLinha,
  type ContextoDaEtapa,
  type DebriefingConfigStore,
  type PerguntaDaPesquisa,
  type ValoresDaConfig,
} from "../services/debriefing-config.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
  .refine(dataExiste, "data inexistente");

/** Resposta explícita: `{houve:false}` ou `{houve:true, abertura, fim}`. */
const respostaEtapaExtra = z.discriminatedUnion("houve", [
  z.object({ houve: z.literal(false) }).strict(),
  z.object({ houve: z.literal(true), abertura: dataIso, fim: dataIso }).strict(),
]);

/** Chave de pergunta real da pesquisa. */
const chaveDePergunta = z.string().trim().min(1);

/** Demais dimensões canônicas: opcionais (a não confirmada não existe para o gerador). */
const dimensoesOpcionais = Object.fromEntries(
  SURVEY_CANONICAL_FIELDS.filter((c) => c !== "faixa").map((c) => [c, chaveDePergunta.optional()]),
) as unknown as Record<Exclude<SurveyCanonicalField, "faixa">, z.ZodOptional<typeof chaveDePergunta>>;

/** `faixa`: chave ou `null` ("sem faixa A→D"); ausente = sem resposta (CONFIG_INCOMPLETA). */
const perguntasDaEtapaSchema = z
  .object({ faixa: chaveDePergunta.nullable().optional(), ...dimensoesOpcionais })
  .strict();

/**
 * Corpo do PUT para funil de lançamento. Datas-chave e etapas são obrigatórias
 * (400 se faltam); perguntas e config do classificador podem ficar sem resposta
 * (o gate devolve CONFIG_INCOMPLETA listando o que falta). PUT = substituição
 * inteira: campo omitido grava "sem resposta".
 */
const corpoLancamentoSchema = z
  .object({
    datasChave: z
      .object({
        inicioCaptacao: dataIso,
        aberturaCarrinho: dataIso,
        fimCarrinho: dataIso,
        reabertura: respostaEtapaExtra,
        downsell: respostaEtapaExtra,
      })
      .strict(),
    lancamentoComparacaoFunnelId: z.string().uuid().nullable().optional(),
    etapas: z
      .array(z.object({ stageId: z.string().uuid(), papel: z.enum(DEBRIEFING_PAPEIS) }).strict())
      .min(1, "ao menos 1 etapa compõe o lançamento"),
    perguntasConfirmadas: z.record(z.string().uuid(), perguntasDaEtapaSchema).optional(),
    closerMediums: z
      .array(z.string().trim().min(1, "item vazio não é um utm_medium"))
      .optional(),
    closerPorSellerName: z.boolean().optional(),
    dimensaoDeCriativo: z.enum(DIMENSOES_DE_CRIATIVO).optional(),
  })
  .strict();

/** Cada problema do zod vira "caminho: mensagem" — o 400 indica o campo. */
function errosDoZod(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(corpo)"}: ${i.message}`);
}

export interface DebriefingConfigRoutesOptions {
  /** Testes injetam um store em memória; produção usa o do Drizzle. */
  criarStore?: (db: Database) => DebriefingConfigStore;
}

export default fp<DebriefingConfigRoutesOptions>(async function debriefingConfigRoutes(fastify, opts) {
  const store = (): DebriefingConfigStore => (opts.criarStore ?? criarDebriefingConfigStore)(fastify.db);
  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/debriefing/config";

  /**
   * Guest → 403; params → 400; etapa inexistente, de outro funil/projeto ou que
   * não é Debriefing → 404. Devolve o contexto ou `null` (resposta já enviada).
   */
  async function resolver(
    request: FastifyRequest,
    reply: FastifyReply,
    s: DebriefingConfigStore,
  ): Promise<ContextoDaEtapa | null> {
    if (request.userRole === "guest") {
      reply.code(403).send({ error: "Acesso negado" });
      return null;
    }
    const parsed = stageParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send({ error: "Parâmetros inválidos" });
      return null;
    }
    const { projectId, funnelId, stageId } = parsed.data;
    const ctx = await s.contextoDaEtapa(stageId);
    if (
      !ctx ||
      ctx.funnelId !== funnelId ||
      ctx.projectId !== projectId ||
      ctx.stageType !== "debriefing"
    ) {
      reply.code(404).send({ error: "Etapa de debriefing não encontrada" });
      return null;
    }
    return ctx;
  }

  /**
   * Perguntas reais por etapa do funil que tem pesquisa. "Falha ao ler" é um
   * estado próprio — NUNCA aparece como "sem pesquisa" (lição: erro virando
   * ausência na tela).
   */
  async function perguntasDisponiveis(s: DebriefingConfigStore, ctx: ContextoDaEtapa) {
    const etapas = (await s.etapasDoFunil(ctx.funnelId)).filter((e) => e.id !== ctx.stageId);
    const com = new Set(await s.etapasComPesquisa(etapas.map((e) => e.id)));
    return Promise.all(
      etapas.map(async (e) => {
        if (!com.has(e.id)) {
          return { stageId: e.id, stageName: e.name, status: "sem-pesquisa" as const, perguntas: [] };
        }
        try {
          const perguntas = await s.perguntasDaEtapa(e.id);
          if (!perguntas) {
            return { stageId: e.id, stageName: e.name, status: "sem-pesquisa" as const, perguntas: [] };
          }
          return { stageId: e.id, stageName: e.name, status: "ok" as const, perguntas };
        } catch (err) {
          fastify.log.warn({ err, stageId: e.id }, "[debriefing-config] falha ao ler perguntas da pesquisa");
          return {
            stageId: e.id,
            stageName: e.name,
            status: "falha" as const,
            perguntas: [],
            motivo: "não foi possível ler a planilha da pesquisa desta etapa — tente de novo",
          };
        }
      }),
    );
  }

  // ---- GET — config, estado do gate, imposto com procedência e perguntas ----
  fastify.get(base, async (request, reply) => {
    const s = store();
    const ctx = await resolver(request, reply, s);
    if (!ctx) return reply;

    // A porta crua oficial (só UI). `resolver` já garantiu etapa, funil e
    // projeto da URL; mobile nem tem config (o PUT recusa).
    const raw = tipoAceitaConfig(ctx.funnelType)
      ? ((await loadDebriefingConfigRaw(fastify.db, ctx.stageId, s))?.config ?? null)
      : null;
    const bloqueio = avaliarBloqueioDebriefing(ctx, raw);
    const imposto = raw?.imposto ?? resolveImpostoPct(null, await s.impostoDoProjeto(ctx.projectId));
    const validadoPorNome = raw?.validadoPor ? await s.nomeDoUsuario(raw.validadoPor) : null;

    return {
      tipoDeFunil: ctx.funnelType,
      config: raw
        ? {
            datasChave: {
              inicioCaptacao: raw.inicioCaptacao,
              aberturaCarrinho: raw.aberturaCarrinho,
              fimCarrinho: raw.fimCarrinho,
              reabertura: raw.reabertura,
              downsell: raw.downsell,
            },
            lancamentoComparacaoFunnelId: raw.lancamentoComparacaoFunnelId,
            etapas: raw.etapas,
            perguntasConfirmadas: raw.perguntasConfirmadas,
            closerMediums: raw.closerMediums,
            closerPorSellerName: raw.closerPorSellerName,
            dimensaoDeCriativo: raw.dimensaoDeCriativo,
            validado: raw.validado,
            validadoEm: raw.validadoEm,
            validadoPor: raw.validadoPor,
            validadoPorNome,
          }
        : null,
      /** null = gerador liberado. Preenchido = motivo (mesma sequência do carregador). */
      bloqueio,
      /** O que falta preencher (lançamento). Vazio também quando não há config. */
      camposFaltantes: raw ? camposFaltantesDebriefing(raw) : [],
      /** A combinação (projeto + funil) consta da lista liberada da decisão 2. */
      combinacaoLiberada: isCombinacaoLiberada(ctx),
      /** Alíquota efetiva + procedência (stage | project | default). */
      imposto,
      /** Por etapa do funil: `ok` | `sem-pesquisa` | `falha` (≠ sem pesquisa). Só lançamento. */
      perguntasDisponiveis: ctx.funnelType === "launch" ? await perguntasDisponiveis(s, ctx) : [],
    };
  });

  // ---- PUT — upsert por etapa ----
  fastify.put(base, async (request, reply) => {
    const s = store();
    const ctx = await resolver(request, reply, s);
    if (!ctx) return reply;

    if (!tipoAceitaConfig(ctx.funnelType)) {
      return reply.code(422).send(erroTipoDeFunilNaoSuportado(ctx.funnelType).toResponse());
    }

    const existente = await s.linhaDaConfig(ctx.stageId);
    let valores: ValoresDaConfig;

    if (ctx.funnelType === "perpetual") {
      // AC11: perpétuo não tem campo nenhum — a linha só ancora a etapa e
      // `validado`. Campo de lançamento no corpo é erro explícito, não descarte
      // silencioso.
      const corpo = (request.body ?? {}) as Record<string, unknown>;
      const extras = typeof corpo === "object" && corpo !== null ? Object.keys(corpo) : ["(corpo)"];
      if (extras.length > 0) {
        return reply.code(400).send({
          error: "Dados inválidos",
          erros: extras.map((k) => `${k}: não se aplica a funil perpétuo (a config do perpétuo não tem campos)`),
        });
      }
      valores = { ...VALORES_VAZIOS, etapas: [], perguntasConfirmadas: {} };
    } else {
      const body = corpoLancamentoSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", erros: errosDoZod(body.error) });
      }
      const b = body.data;
      valores = {
        inicioCaptacao: b.datasChave.inicioCaptacao,
        aberturaCarrinho: b.datasChave.aberturaCarrinho,
        fimCarrinho: b.datasChave.fimCarrinho,
        reabertura: b.datasChave.reabertura,
        downsell: b.datasChave.downsell,
        lancamentoComparacaoFunnelId: b.lancamentoComparacaoFunnelId ?? null,
        etapas: b.etapas.map((e) => ({ stageId: e.stageId, papel: e.papel })),
        perguntasConfirmadas: (b.perguntasConfirmadas ?? {}) as ValoresDaConfig["perguntasConfirmadas"],
        closerMediums: b.closerMediums === undefined ? null : normalizarCloserMediums(b.closerMediums),
        closerPorSellerName: b.closerPorSellerName ?? null,
        dimensaoDeCriativo: b.dimensaoDeCriativo ?? null,
      };

      const [etapasDoFunil, funisDoProjeto] = await Promise.all([
        s.etapasDoFunil(ctx.funnelId),
        s.funisDoProjeto(ctx.projectId),
      ]);
      const problemas = problemasDoCorpoLancamento(valores, {
        stageId: ctx.stageId,
        funnelId: ctx.funnelId,
        etapasDoFunil: etapasDoFunil.map((e) => e.id),
        funisDoProjeto,
      });
      if (problemas.length > 0) {
        return reply.code(400).send({ error: "Dados inválidos", erros: problemas });
      }

      // AC5 — etapa sem pesquisa não entra; chave confirmada tem de existir nas
      // perguntas reais. Só abre planilha das etapas que apontam alguma chave.
      const confirmadas = Object.keys(valores.perguntasConfirmadas);
      const comPesquisa = new Set(await s.etapasComPesquisa(confirmadas));
      const precisamPlanilha = new Set(etapasComChaveConfirmada(valores.perguntasConfirmadas));
      const disponiveis = new Map<string, PerguntaDaPesquisa[] | null>();
      for (const stageId of confirmadas) {
        if (!comPesquisa.has(stageId)) {
          disponiveis.set(stageId, null);
          continue;
        }
        if (!precisamPlanilha.has(stageId)) {
          disponiveis.set(stageId, []); // só `faixa: null` — nada a conferir na planilha
          continue;
        }
        try {
          disponiveis.set(stageId, await s.perguntasDaEtapa(stageId));
        } catch (err) {
          request.log.warn({ err, stageId }, "[debriefing-config] falha ao ler perguntas no PUT");
          // Não dá para conferir a chave → não grava (nunca aceitar sem conferir).
          return reply.code(503).send({
            error: `Não foi possível ler a pesquisa da etapa ${stageId} para conferir as perguntas confirmadas — tente de novo`,
          });
        }
      }
      const problemasPerguntas = problemasDasPerguntas(valores.perguntasConfirmadas, disponiveis);
      if (problemasPerguntas.length > 0) {
        return reply.code(400).send({ error: "Dados inválidos", erros: problemasPerguntas });
      }
    }

    // Mudou qualquer premissa → a conferência anterior não vale mais. Sem linha
    // lida, o upsert reseta por precaução: se outra requisição criou a linha no
    // meio (corrida do primeiro "salvar"), não há premissa para comparar.
    const resetar = !!existente && premissaMudou(valoresDaLinha(existente), valores);
    await s.gravar(ctx.stageId, valores, { resetarValidado: !existente || resetar });
    return { ok: true, validacaoResetada: resetar };
  });

  // ---- POST /validate — marca a combinação como conferida ----
  fastify.post(`${base}/validate`, async (request, reply) => {
    const s = store();
    const ctx = await resolver(request, reply, s);
    if (!ctx) return reply;

    if (!tipoAceitaConfig(ctx.funnelType)) {
      return reply.code(422).send(erroTipoDeFunilNaoSuportado(ctx.funnelType).toResponse());
    }
    const validadoEm = await s.marcarValidado(ctx.stageId, request.userId);
    if (!validadoEm) {
      return reply
        .code(404)
        .send({ error: "Configuração não encontrada — salve a config do debriefing antes de validar" });
    }
    return { ok: true, validadoEm };
  });
});
