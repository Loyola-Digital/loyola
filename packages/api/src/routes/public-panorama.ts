/**
 * Story 44.20 (AC6) — `GET .../projects/:projectId/panorama-cac` para o agente
 * Inácio (API key + escopo).
 *
 * Este arquivo é o invólucro de autenticação — nada mais. A composição mora em
 * `services/panorama-do-projeto.ts`, a mesma função que a rota interna
 * (`project-panorama.ts`) chama.
 *
 * O motivo de existirem duas: o gate de `/api/public/` exige `x-api-key`
 * incondicionalmente (`api-key-auth.ts`, 401 antes de qualquer handler) e o web
 * autentica com Clerk. Cada rota prova o acesso do seu jeito; o payload é um só.
 */

import fp from "fastify-plugin";
import type { z } from "zod";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { montarPanoramaDoProjeto } from "../services/panorama-do-projeto.js";
import { panoramaParamsSchema, panoramaQuerySchema } from "./project-panorama.js";

export default fp(async function publicPanoramaRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof panoramaParamsSchema>;
    Querystring: z.infer<typeof panoramaQuerySchema>;
  }>(
    "/api/public/meta/v1/projects/:projectId/panorama-cac",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = panoramaParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const query = panoramaQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }

      const panorama = await montarPanoramaDoProjeto(
        fastify.db,
        fastify.config,
        params.data.projectId,
        {
          to: query.data.to,
          janelaCurtaDias: query.data.curta,
          janelaLongaDias: query.data.longa,
        },
      );
      if (!panorama) {
        return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });
      }
      return panorama;
    },
  );
});
