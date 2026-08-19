/**
 * Story 44.8 — `GET .../stages/:stageId/cadeia-cac`, o payload da aba "Inácio"
 * para o agente Inácio (API key + escopo).
 *
 * ⚠️ **Story 44.9 (AC1): a composição saiu daqui** para
 * `services/cadeia-cac-payload.ts`. Este arquivo é o invólucro de
 * autenticação — nada mais.
 *
 * O motivo: a aba do painel **não consegue chamar esta rota**. O gate de
 * `/api/public/` exige `x-api-key` incondicionalmente (`api-key-auth.ts`, 401
 * antes de qualquer handler) e o web autentica com Clerk. A rota interna que
 * atende a aba (`stage-cadeia-cac.ts`) chama **o mesmo serviço** — duas rotas
 * compondo o payload cada uma do seu jeito seria a semente da divergência que o
 * Epic 44 existe para impedir.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
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
  /** QA-448-03: `?fresh=1` força o recompute, como na rota irmã de vendas. */
  fresh: z.string().optional(),
});

export default fp(async function publicCadeiaCacRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/public/meta/v1/projects/:projectId/stages/:stageId/cadeia-cac",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
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

      // O `innerJoin` contra `funnels.projectId` mora no serviço, e as duas
      // rotas dependem dele. Etapa de outro projeto -> 404, nunca 403.
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
