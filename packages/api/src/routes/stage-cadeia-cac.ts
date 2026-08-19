/**
 * Story 44.9 (AC1) — a rota que a **aba** consome.
 *
 * `GET /api/projects/:projectId/stages/:stageId/cadeia-cac`
 *
 * ## Por que ela existe
 *
 * A rota pública da 44.8 é inalcançável pelo painel: o gate de `/api/public/`
 * exige `x-api-key` incondicionalmente (`api-key-auth.ts`, 401 antes de
 * qualquer handler) e o web autentica com Clerk. Nenhuma tela do repo chama uma
 * rota `/api/public/` — o padrão do web é rota interna por etapa
 * (`stage-creative-performance`, `stage-sales-data`, `stage-applications`…).
 *
 * ## Por que NÃO é um proxy no Next
 *
 * `[decisão @po 2026-08-19]` A alternativa avaliada era um route handler no
 * Next guardando a API key server-side. Foi recusada por segurança: `api_keys`
 * **não tem coluna `projectId`** e **nenhuma rota valida projeto contra a
 * chave** — ela lê qualquer projeto, por desenho (é a chave de máquina do
 * agente). Um proxy repassando o `projectId` vindo do browser com essa chave
 * deixaria qualquer usuário logado ler qualquer projeto.
 *
 * ## Por que o caminho é `/api/projects/:projectId/...`
 *
 * Não é enfeite: o `guest-guard` global só valida membership em
 * `/api/projects/:id/*` (`middleware/guest-guard.ts:113`). Uma rota
 * `/api/funnels/...` passaria batido para convidados — que é a lacuna que as
 * rotas irmãs têm hoje. Escopando por projeto na URL, a proteção vem de graça,
 * em vez de ser reimplementada aqui.
 *
 * ## Zero cálculo aqui
 *
 * A composição inteira mora em `services/cadeia-cac-payload.ts`, e a rota
 * pública chama exatamente a mesma função. Há teste provando que os dois
 * caminhos devolvem o MESMO payload.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import {
  montarPayloadCadeiaCac,
  resolverEtapaDoProjeto,
} from "../services/cadeia-cac-payload.js";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  from: z.string().regex(YMD).optional(),
  to: z.string().regex(YMD).optional(),
  fresh: z.string().optional(),
});

export default fp(async function stageCadeiaCacRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/projects/:projectId/stages/:stageId/cadeia-cac",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const query = querySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }

      const { projectId, stageId } = params.data;

      // Mesma prova de vínculo da rota pública, mesma função. Etapa de outro
      // projeto → 404, nunca 403.
      const stage = await resolverEtapaDoProjeto(fastify.db, projectId, stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });

      return montarPayloadCadeiaCac(fastify.db, fastify.config, stage, {
        projectId,
        stageId,
        from: query.data.from,
        to: query.data.to,
        fresh: query.data.fresh,
      });
    },
  );
});
