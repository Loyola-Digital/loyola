/**
 * Story 44.20 (AC6) — a rota que a **aba** consome.
 *
 * `GET /api/projects/:projectId/panorama-cac`
 *
 * ## Zero cálculo aqui
 *
 * A composição inteira mora em `services/panorama-do-projeto.ts`, e a rota
 * pública (`public-panorama.ts`) chama exatamente a mesma função. Há teste
 * provando que os dois caminhos devolvem o MESMO payload — sem ele a extração
 * seria promessa, e duas rotas compondo cada uma do seu jeito é a semente da
 * divergência que o Epic 44 existe para impedir.
 *
 * ## Por que o caminho é `/api/projects/:projectId/...`
 *
 * O `guest-guard` global só valida membership em `/api/projects/:id/*`
 * (`middleware/guest-guard.ts:113`). Escapando desse prefixo, a proteção teria
 * que ser reimplementada aqui — e o panorama lista TODAS as etapas do projeto,
 * que é exatamente o payload que não pode vazar para um convidado sem vínculo.
 * É também a razão de o panorama ser por projeto e nunca cross-projeto:
 * decisão do dono do produto em 2026-08-27.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import { montarPanoramaDoProjeto } from "../services/panorama-do-projeto.js";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const panoramaParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const panoramaQuerySchema = z.object({
  to: z.string().regex(YMD).optional(),
  curta: z.coerce.number().int().min(1).max(365).optional(),
  longa: z.coerce.number().int().min(1).max(365).optional(),
  /**
   * ⚠️ Sem `fresh` (QA-4420-01). O panorama é a varredura; `?fresh=1` custava
   * 15,1 s no maior projeto porque forçava recompute de venda em CADA etapa.
   * Dado de venda recomputado se pede na etapa: `/stages/{id}/cadeia-cac?fresh=1`.
   */
});

export default fp(async function projectPanoramaRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof panoramaParamsSchema>;
    Querystring: z.infer<typeof panoramaQuerySchema>;
  }>("/api/projects/:projectId/panorama-cac", async (request, reply) => {
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
    // Projeto inexistente → 404, nunca 403: 403 confirmaria que ele existe.
    if (!panorama) {
      return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });
    }
    return panorama;
  });
});
