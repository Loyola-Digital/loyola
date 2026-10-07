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
 *
 * Story 49.11: a comparação vira LISTA ordenada (`lancamentosComparacao`, o 1º
 * é a principal) e a config ganha `pesquisaDeCaptacaoPorEtapa` (R6-7). O campo
 * antigo `lancamentoComparacaoFunnelId` continua aceito no PUT e devolvido no
 * GET (= o 1º item); o PUT grava as duas colunas coerentes (migration 0162).
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
  FASES_QUE_PODEM_NAO_TER_ACONTECIDO,
  MAX_LANCAMENTOS_COMPARACAO,
  SITUACOES_DO_LANCAMENTO,
  aindaNaoAconteceuDe,
  VALORES_VAZIOS,
  avaliarBloqueioDebriefing,
  avisosDebriefing,
  camposFaltantesDebriefing,
  comparacaoDoCorpo,
  comparacoesDe,
  comparacoesRemovidasDe,
  criarDebriefingConfigStore,
  dataExiste,
  erroTipoDeFunilNaoSuportado,
  etapasComChaveConfirmada,
  isCombinacaoLiberada,
  loadDebriefingConfigRaw,
  normalizarCloserMediums,
  premissaEfetiva,
  premissaMudou,
  problemasDaPesquisaDeCaptacao,
  problemasDasPerguntas,
  problemasDoCorpoLancamento,
  situacaoDe,
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
// 49.14 (REQ-002): `fim: null` passa no zod — "fim ainda não aconteceu", só com a
// resposta explícita (`fimReabertura`/`fimDownsell`) e no modo em andamento;
// `problemasDasDatasChave` decide (no encerrado, 400 como sempre).
const respostaEtapaExtra = z.discriminatedUnion("houve", [
  z.object({ houve: z.literal(false) }).strict(),
  z.object({ houve: z.literal(true), abertura: dataIso, fim: dataIso.nullable() }).strict(),
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
 *
 * Story 49.12 (AC1/AC2): `situacaoDoLancamento` ("O lançamento terminou?")
 * omitida = `encerrado` — o corpo do painel anterior à 49.12 (só existia o
 * encerrado, com as três datas). No modo `em-andamento`, abertura, fim do
 * carrinho, reabertura e downsell aceitam `null` + a fase em
 * `datasChave.aindaNaoAconteceu` ("ainda não aconteceu" ≠ "não houve"). O
 * `null` passa no zod e `problemasDasDatasChave` decide (no encerrado, a regra
 * de sempre: obrigatória).
 */
const corpoLancamentoSchema = z
  .object({
    situacaoDoLancamento: z.enum(SITUACOES_DO_LANCAMENTO).optional(),
    datasChave: z
      .object({
        inicioCaptacao: dataIso,
        aberturaCarrinho: dataIso.nullable(),
        fimCarrinho: dataIso.nullable(),
        reabertura: respostaEtapaExtra.nullable(),
        downsell: respostaEtapaExtra.nullable(),
        aindaNaoAconteceu: z.array(z.enum(FASES_QUE_PODEM_NAO_TER_ACONTECIDO)).max(FASES_QUE_PODEM_NAO_TER_ACONTECIDO.length).optional(),
      })
      .strict(),
    /** Forma da 49.1 (API antiga): continua aceito — sozinho vale `[id]` (49.11 AC3 c). */
    lancamentoComparacaoFunnelId: z.string().uuid().nullable().optional(),
    /** 49.11 — lista ORDENADA (o 1º é a principal, R6-5); `[]` = sem comparação. */
    lancamentosComparacao: z
      .array(z.string().uuid())
      .max(MAX_LANCAMENTOS_COMPARACAO, `no máximo ${MAX_LANCAMENTOS_COMPARACAO} lançamentos de comparação`)
      .optional(),
    /** 49.11 (R6-7) — `{ stageId: funnel_surveys.id }`; omitido = `{}`. */
    pesquisaDeCaptacaoPorEtapa: z.record(z.string().uuid(), z.string().uuid()).optional(),
    etapas: z
      .array(z.object({ stageId: z.string().uuid(), papel: z.enum(DEBRIEFING_PAPEIS) }).strict())
      .min(1, "ao menos 1 etapa compõe o lançamento"),
    perguntasConfirmadas: z.record(z.string().uuid(), perguntasDaEtapaSchema).optional(),
    closerMediums: z
      .array(z.string().trim().min(1, "item vazio não é um utm_medium"))
      .optional(),
    closerPorSellerName: z.boolean().optional(),
    /** R4-12 (49.2): como `closerMediums` — omitido = sem resposta (CONFIG_INCOMPLETA); `[]` vale. */
    ferramentasDeAtendimento: z
      .array(z.string().trim().min(1, "item vazio não é um utm_source"))
      .optional(),
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
  /**
   * Story 49.6 (PERF-001 da 49.1) — o GET memoiza por etapa, por este tempo, as
   * perguntas lidas da planilha da pesquisa (abrir o formulário não reabre todas
   * as planilhas a cada GET). Só o GET usa o cache: o PUT confere a chave sempre
   * na planilha. Falha de leitura NUNCA é memoizada, nem a ausência (`null` =
   * etapa sem pesquisa): pesquisa recém-conectada aparece no GET seguinte, não
   * 60 s depois (QA 49.6 PERF-496-1). Ausente/0 = sem cache.
   */
  cachePerguntasMs?: number;
}

export default fp<DebriefingConfigRoutesOptions>(async function debriefingConfigRoutes(fastify, opts) {
  const store = (): DebriefingConfigStore => (opts.criarStore ?? criarDebriefingConfigStore)(fastify.db);
  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/debriefing/config";
  const ttlPerguntas = opts.cachePerguntasMs ?? 0;
  const cachePerguntas = new Map<string, { ate: number; perguntas: PerguntaDaPesquisa[] }>();
  /** Perguntas da etapa, pelo cache do GET (PERF-001). Só sucesso COM pesquisa entra no cache. */
  async function perguntasDoGet(s: DebriefingConfigStore, stageId: string): Promise<PerguntaDaPesquisa[] | null> {
    if (ttlPerguntas <= 0) return s.perguntasDaEtapa(stageId);
    const agora = Date.now();
    const hit = cachePerguntas.get(stageId);
    if (hit && hit.ate > agora) return hit.perguntas;
    const perguntas = await s.perguntasDaEtapa(stageId);
    if (perguntas) cachePerguntas.set(stageId, { ate: agora + ttlPerguntas, perguntas });
    else cachePerguntas.delete(stageId);
    return perguntas;
  }

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
          const perguntas = await perguntasDoGet(s, e.id);
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

  async function pesquisasPorEtapa(s: DebriefingConfigStore, ctx: ContextoDaEtapa) {
    const etapas = (await s.etapasDoFunil(ctx.funnelId)).filter((e) => e.id !== ctx.stageId).map((e) => e.id);
    const lista = (await s.pesquisasComRotulo?.(etapas)) ?? [];
    const porEtapa: Record<string, { id: string; rotulo: string }[]> = {};
    for (const p of lista) (porEtapa[p.stageId] ??= []).push({ id: p.id, rotulo: p.rotulo });
    return porEtapa;
  }

  /** Falha ao listar vira estado próprio (`pesquisasPorEtapaFalha`), nunca "sem pesquisa". */
  async function pesquisasDoGet(
    s: DebriefingConfigStore,
    ctx: ContextoDaEtapa,
  ): Promise<{ pesquisasPorEtapa: Record<string, { id: string; rotulo: string }[]> } | { pesquisasPorEtapaFalha: string }> {
    try {
      return { pesquisasPorEtapa: await pesquisasPorEtapa(s, ctx) };
    } catch (err) {
      fastify.log.warn({ err, stageId: ctx.stageId }, "[debriefing-config] falha ao listar as pesquisas das etapas");
      return { pesquisasPorEtapaFalha: "não foi possível listar as pesquisas das etapas — tente de novo" };
    }
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
            /** 49.12 (AC1) — "O lançamento terminou?"; config de antes da 49.12 = encerrado. */
            situacaoDoLancamento: situacaoDe(raw),
            datasChave: {
              inicioCaptacao: raw.inicioCaptacao,
              aberturaCarrinho: raw.aberturaCarrinho,
              fimCarrinho: raw.fimCarrinho,
              reabertura: raw.reabertura,
              downsell: raw.downsell,
              /** 49.12 (AC2) — fases "ainda não aconteceu" (só no modo em andamento). */
              aindaNaoAconteceu: aindaNaoAconteceuDe(raw),
            },
            /** A principal GRAVADA (= `lancamentosComparacao[0]`), mesmo se removida — rastro. */
            lancamentoComparacaoFunnelId: raw.lancamentoComparacaoFunnelId,
            /**
             * 49.11 — a lista GRAVADA, na ordem, com os removidos (rastro: o
             * formulário os mostra riscados). A efetiva é esta menos `comparacoesRemovidas`.
             */
            lancamentosComparacao: comparacoesDe(raw),
            /** 49.11 (R6-7) — `{ stageId: funnel_surveys.id }`. */
            pesquisaDeCaptacaoPorEtapa: raw.pesquisaDeCaptacaoPorEtapa ?? {},
            etapas: raw.etapas,
            perguntasConfirmadas: raw.perguntasConfirmadas,
            closerMediums: raw.closerMediums,
            closerPorSellerName: raw.closerPorSellerName,
            ferramentasDeAtendimento: raw.ferramentasDeAtendimento,
            dimensaoDeCriativo: raw.dimensaoDeCriativo,
            /** Algum id da lista foi apagado/saiu do projeto (R4-14; 49.11: por item). */
            comparacaoRemovida: raw.comparacaoRemovida,
            /** 49.11 — quais ids da lista gravada foram removidos (um aviso por item). */
            comparacoesRemovidas: comparacoesRemovidasDe(raw),
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
      /** Não bloqueiam; o documento os declara (ex.: COMPARACAO_REMOVIDA → edição única). */
      avisos: raw ? avisosDebriefing(raw) : [],
      /** A combinação (projeto + funil) consta da lista liberada da decisão 2. */
      combinacaoLiberada: isCombinacaoLiberada(ctx),
      /** Alíquota efetiva + procedência (stage | project | default). */
      imposto,
      /** Por etapa do funil: `ok` | `sem-pesquisa` | `falha` (≠ sem pesquisa). Só lançamento. */
      perguntasDisponiveis: ctx.funnelType === "launch" ? await perguntasDisponiveis(s, ctx) : [],
      /**
       * Story 49.6 (49.11 AC7) — pesquisas de cada etapa do funil, com o nome da
       * aba, para o seletor "pesquisa de captação" (etapa com 2+). Omitido quando
       * o store não sabe listar (fixtures da 49.1).
       */
      ...(ctx.funnelType === "launch" && s.pesquisasComRotulo ? await pesquisasDoGet(s, ctx) : {}),
      /**
       * Story 49.12 (AC11) — a parcial gerada desta etapa (`null` = nenhuma): o
       * botão avisa que a próxima geração a substitui. Omitido quando o store
       * não sabe ler (fixtures).
       */
      ...(ctx.funnelType === "launch" && s.parcialDaEtapa ? { parcialAtual: await s.parcialDaEtapa(ctx.stageId) } : {}),
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
    let funisDoProjeto: string[] = [];

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
      // 49.11 AC3 (c): campo antigo, lista, ou os dois coerentes — divergência é 400.
      const comparacao = comparacaoDoCorpo(b.lancamentoComparacaoFunnelId, b.lancamentosComparacao);
      if ("erro" in comparacao) {
        return reply.code(400).send({ error: "Dados inválidos", erros: [comparacao.erro] });
      }
      valores = {
        // 49.12: omitida = encerrado (corpo do painel anterior à 49.12).
        situacaoDoLancamento: b.situacaoDoLancamento ?? "encerrado",
        aindaNaoAconteceu: aindaNaoAconteceuDe({ aindaNaoAconteceu: b.datasChave.aindaNaoAconteceu ?? [] }),
        inicioCaptacao: b.datasChave.inicioCaptacao,
        aberturaCarrinho: b.datasChave.aberturaCarrinho,
        fimCarrinho: b.datasChave.fimCarrinho,
        reabertura: b.datasChave.reabertura,
        downsell: b.datasChave.downsell,
        // A principal = o 1º item. Corpo na forma da 49.1 (só o campo antigo) segue
        // na forma da 49.1; o store grava as DUAS colunas coerentes (49.11 AC3 d).
        lancamentoComparacaoFunnelId: comparacao.lista[0] ?? null,
        ...(comparacao.peloCampoAntigo ? {} : { lancamentosComparacao: comparacao.lista }),
        ...(b.pesquisaDeCaptacaoPorEtapa === undefined
          ? {}
          : { pesquisaDeCaptacaoPorEtapa: { ...b.pesquisaDeCaptacaoPorEtapa } }),
        etapas: b.etapas.map((e) => ({ stageId: e.stageId, papel: e.papel })),
        perguntasConfirmadas: (b.perguntasConfirmadas ?? {}) as ValoresDaConfig["perguntasConfirmadas"],
        closerMediums: b.closerMediums === undefined ? null : normalizarCloserMediums(b.closerMediums),
        closerPorSellerName: b.closerPorSellerName ?? null,
        ferramentasDeAtendimento:
          b.ferramentasDeAtendimento === undefined ? null : normalizarCloserMediums(b.ferramentasDeAtendimento),
        dimensaoDeCriativo: b.dimensaoDeCriativo ?? null,
      };

      let etapasDoFunil: { id: string }[];
      [etapasDoFunil, funisDoProjeto] = await Promise.all([
        s.etapasDoFunil(ctx.funnelId),
        s.funisDoProjeto(ctx.projectId),
      ]);
      const problemas = problemasDoCorpoLancamento(valores, {
        stageId: ctx.stageId,
        funnelId: ctx.funnelId,
        etapasDoFunil: etapasDoFunil.map((e) => e.id),
        funisDoProjeto,
        comparacaoPeloCampoAntigo: comparacao.peloCampoAntigo,
      });
      // 49.11 (R6-7): a pesquisa marcada é uma pesquisa DAQUELA etapa do lançamento.
      const marcadas = valores.pesquisaDeCaptacaoPorEtapa ?? {};
      if (Object.keys(marcadas).length > 0) {
        const etapasDoLancamento = valores.etapas.map((e) => e.stageId);
        problemas.push(
          ...problemasDaPesquisaDeCaptacao(marcadas, etapasDoLancamento, await s.pesquisasDasEtapas(etapasDoLancamento)),
        );
      }
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
    // Comparação órfã gravada conta como "sem comparação" (R4-14): limpá-la não
    // muda o que o gerador faz (já era edição única), então não reseta.
    const resetar =
      !!existente && premissaMudou(premissaEfetiva(valoresDaLinha(existente), funisDoProjeto), valores);
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
