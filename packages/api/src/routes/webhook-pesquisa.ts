/**
 * A pesquisa que chega por webhook: criar, ver a URL, conferir o que chegou.
 *
 * O que se cria aqui é uma linha de `funnel_surveys` cujo `spreadsheetId` é
 * `webhook-pesquisa:<id dela mesma>` — uma planilha que não existe no Google.
 * Por isso não há CRUD de edição nem de remoção: listar, renomear e apagar
 * continuam na rota de pesquisas (`routes/google-sheets.ts`), e o resto do
 * sistema não sabe (nem precisa saber) que a fonte não é planilha.
 *
 * A recepção da resposta em si é pública e mora em `routes/webhooks.ts`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, count, desc, eq, max } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnels,
  funnelSurveys,
  stageLeadScoringSchemas,
  webhookSurveyResponses,
} from "../db/schema.js";
import {
  COLUNA_DATA,
  achatarCorpo,
  inferirContentType,
  montarPrevia,
  motivoDeNaoLer,
  pesquisaComoPlanilhaId,
} from "../services/webhook-pesquisa.js";
import { campoDoApelido, parseCorpoDeWebhook } from "../services/webhook-leads.js";
import { findQuestionColumn, type LeadScoringSchema } from "./lead-scoring.js";

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const pesquisaParamSchema = funnelParamSchema.extend({
  surveyId: z.string().uuid(),
});

/**
 * O mapeamento que a tela monta a partir do exemplo colado: qual coluna
 * recebida é o e-mail, qual é o telefone, qual é a data da resposta.
 *
 * Vem na criação, e não depois, porque é o mapeamento que liga a resposta ao
 * lead — sem ele a pesquisa recebe tudo e casa com ninguém.
 */
const mapeamentoSchema = z
  .object({
    email: z.string().max(255).optional(),
    phone: z.string().max(255).optional(),
    timestamp: z.string().max(255).optional(),
    faixa: z.string().max(255).optional(),
    utm_source: z.string().max(255).optional(),
    utm_medium: z.string().max(255).optional(),
    utm_campaign: z.string().max(255).optional(),
    utm_content: z.string().max(255).optional(),
    questions: z
      .array(
        z.object({
          columnName: z.string().max(255),
          label: z.string().max(255),
          showInDashboard: z.boolean(),
        }),
      )
      .max(100)
      .optional(),
  })
  .optional();

const previaSchema = z.object({
  /** O corpo como a ferramenta manda: JSON ou `a=b&c=d`. */
  exemplo: z.string().min(1).max(100_000),
  contentType: z.string().max(200).optional(),
  /** A etapa cujo modelo de scoring deve casar as perguntas. */
  stageId: z.string().uuid().optional(),
});

const criarSchema = z.object({
  stageId: z.string().uuid().optional(),
  label: z.string().min(1).max(255),
  surveyType: z.enum(["paid", "organic"]).optional(),
  columnMapping: mapeamentoSchema,
});

/** O caminho que vai no n8n; a tela prefixa com a base da API. */
function caminho(surveyId: string): string {
  return `/api/webhooks/pesquisa/${surveyId}`;
}

function novoToken(): string {
  return randomBytes(24).toString("hex");
}

/** Quantas respostas a tela mostra como prévia do que está chegando. */
const PREVIA = 5;

export default fp(async function webhookPesquisaRoutes(fastify) {
  async function funilDoProjeto(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  /** A pesquisa por webhook deste funil, ou null. */
  async function pesquisaDoFunil(funnelId: string, surveyId: string) {
    const [row] = await fastify.db
      .select({
        id: funnelSurveys.id,
        token: funnelSurveys.webhookToken,
        spreadsheetId: funnelSurveys.spreadsheetId,
      })
      .from(funnelSurveys)
      .where(and(eq(funnelSurveys.id, surveyId), eq(funnelSurveys.funnelId, funnelId)))
      .limit(1);
    return row?.token ? row : null;
  }

  // ---- POST previa: "é assim que vou mandar" → "é assim que vamos ler" ----
  //
  // Não cria nada e não grava nada: recebe um exemplo do corpo e devolve as
  // colunas que ele vira, já com o destino de cada uma. Serve para conferir o
  // envio ANTES de existir pesquisa, e para reconferir depois de mexer no
  // formulário.
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/webhook-pesquisa/previa",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = funnelParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = previaSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const tipo = body.data.contentType ?? inferirContentType(body.data.exemplo);
      const corpo = parseCorpoDeWebhook(body.data.exemplo, tipo);
      if (!corpo || Object.keys(corpo).length === 0) {
        // O motivo vai na própria mensagem porque é só ela que a tela mostra.
        return reply.code(422).send({
          error: `Não consegui ler esse exemplo: ${motivoDeNaoLer(body.data.exemplo)}`,
          dica: "Cole o corpo como ele sai da sua ferramenta: um JSON, ou os pares a=b&c=d do formulário.",
        });
      }

      const valores = achatarCorpo(corpo);
      const headers = [COLUNA_DATA, ...valores.keys()];

      // As perguntas do modelo de scoring da etapa, quando há etapa e modelo.
      // Sem elas a prévia ainda vale: mostra as colunas e o que é contato.
      const perguntasCasadas = new Map<string, { perguntaId: string; rotulo: string }>();
      if (body.data.stageId) {
        const [scoring] = await fastify.db
          .select({ schemaJson: stageLeadScoringSchemas.schemaJson })
          .from(stageLeadScoringSchemas)
          .where(eq(stageLeadScoringSchemas.stageId, body.data.stageId))
          .limit(1);
        const perguntas =
          (scoring?.schemaJson as LeadScoringSchema | undefined)?.scoring_model?.questions ?? [];
        for (const q of perguntas) {
          const { idx } = findQuestionColumn(headers, q);
          if (idx < 0) continue;
          const coluna = headers[idx];
          if (coluna === COLUNA_DATA || perguntasCasadas.has(coluna)) continue;
          perguntasCasadas.set(coluna, {
            perguntaId: q.id,
            rotulo: q.label ?? q.new_survey_column ?? q.id,
          });
        }
      }

      const colunas = montarPrevia(valores, perguntasCasadas, campoDoApelido);
      const perguntasDoModelo = perguntasCasadas.size;
      return {
        colunas,
        perguntasCasadas: perguntasDoModelo,
        semModelo: !body.data.stageId,
      };
    },
  );

  // ---- POST: cria a pesquisa por webhook ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/webhook-pesquisa",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = funnelParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = criarSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "Dados inválidos",
          details: body.error.flatten().fieldErrors,
        });
      }
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      // O id é sorteado aqui porque o `spreadsheetId` aponta para ele mesmo:
      // a fonte da pesquisa é a própria linha.
      const surveyId = randomUUID();
      const token = novoToken();

      const [criada] = await fastify.db
        .insert(funnelSurveys)
        .values({
          id: surveyId,
          funnelId: p.data.funnelId,
          stageId: body.data.stageId ?? null,
          spreadsheetId: pesquisaComoPlanilhaId(surveyId),
          spreadsheetName: body.data.label,
          sheetName: "respostas",
          surveyType: body.data.surveyType ?? "paid",
          columnMapping: body.data.columnMapping ?? {},
          webhookToken: token,
        })
        .returning();

      return reply.code(201).send({
        survey: criada,
        surveyId,
        path: caminho(surveyId),
        token,
        recebidos: 0,
        ultimoEm: null,
        colunas: [],
        ultimas: [],
      });
    },
  );

  // ---- GET: a URL para colar, mais a prévia do que já chegou ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/webhook-pesquisa/:surveyId",
    async (request, reply) => {
      const p = pesquisaParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const pesquisa = await pesquisaDoFunil(p.data.funnelId, p.data.surveyId);
      if (!pesquisa) return reply.code(404).send({ error: "Pesquisa por webhook não encontrada" });

      const [agregado] = await fastify.db
        .select({ recebidos: count(), ultimoEm: max(webhookSurveyResponses.recebidoEm) })
        .from(webhookSurveyResponses)
        .where(eq(webhookSurveyResponses.surveyId, p.data.surveyId));

      // As últimas, e não as primeiras: quem abre esta tela acabou de mexer no
      // envio e quer ver o que está saindo de lá AGORA.
      const recentes = await fastify.db
        .select({
          payload: webhookSurveyResponses.payload,
          recebidoEm: webhookSurveyResponses.recebidoEm,
        })
        .from(webhookSurveyResponses)
        .where(eq(webhookSurveyResponses.surveyId, p.data.surveyId))
        .orderBy(desc(webhookSurveyResponses.recebidoEm))
        .limit(PREVIA);

      const ultimas = recentes.map((r) => ({
        recebidoEm: r.recebidoEm,
        valores: Object.fromEntries(achatarCorpo(r.payload ?? {})),
      }));

      // As colunas da prévia saem das respostas recentes; a leitura de verdade
      // usa a união de TODAS (`respostasComoPlanilha`).
      const colunas: string[] = [];
      for (const r of ultimas) {
        for (const c of Object.keys(r.valores)) if (!colunas.includes(c)) colunas.push(c);
      }

      return {
        surveyId: p.data.surveyId,
        path: caminho(p.data.surveyId),
        // O token autoriza escrever resposta na pesquisa: convidado vê o que
        // chegou, não o segredo.
        token: request.userRole === "guest" ? null : pesquisa.token,
        recebidos: agregado?.recebidos ?? 0,
        ultimoEm: agregado?.ultimoEm ?? null,
        colunas,
        ultimas,
      };
    },
  );

  // ---- POST rotate: invalida o que já foi colado por aí ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/webhook-pesquisa/:surveyId/rotate",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = pesquisaParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await funilDoProjeto(p.data.projectId, p.data.funnelId))) {
        return reply.code(404).send({ error: "Funil não encontrado" });
      }

      const pesquisa = await pesquisaDoFunil(p.data.funnelId, p.data.surveyId);
      if (!pesquisa) return reply.code(404).send({ error: "Pesquisa por webhook não encontrada" });

      const token = novoToken();
      await fastify.db
        .update(funnelSurveys)
        .set({ webhookToken: token })
        .where(eq(funnelSurveys.id, p.data.surveyId));

      return { surveyId: p.data.surveyId, path: caminho(p.data.surveyId), token };
    },
  );
});
