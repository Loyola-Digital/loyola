import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelBatchTurns } from "../db/schema.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const idParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve ser YYYY-MM-DD"),
  label: z.string().min(1).max(255),
});

const updateBodySchema = z.object({
  label: z.string().min(1).max(255),
});

interface BatchTurnDto {
  id: string;
  date: string;
  label: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: typeof funnelBatchTurns.$inferSelect): BatchTurnDto {
  return {
    id: row.id,
    date: typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10),
    label: row.label,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default fp(async function funnelBatchTurnsRoutes(fastify) {
  async function ensureFunnelInProject(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/batch-turns
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns",
    async (request, reply) => {
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const rows = await fastify.db
        .select()
        .from(funnelBatchTurns)
        .where(eq(funnelBatchTurns.funnelId, p.data.funnelId))
        .orderBy(asc(funnelBatchTurns.date));

      return rows.map(toDto);
    }
  );

  // POST /api/projects/:projectId/funnels/:funnelId/batch-turns
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten().fieldErrors });
      }

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      try {
        const [row] = await fastify.db
          .insert(funnelBatchTurns)
          .values({
            funnelId: p.data.funnelId,
            date: body.data.date,
            label: body.data.label,
            createdBy: request.userId ?? null,
          })
          .returning();

        return reply.code(201).send(toDto(row));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("uq_batch_turns_funnel_date")) {
          return reply.code(409).send({ error: "Já existe uma virada de lote nesta data" });
        }
        fastify.log.error({ err }, "[funnel-batch-turns] insert failed");
        return reply.code(500).send({ error: "Erro ao criar virada de lote" });
      }
    }
  );

  // PATCH /api/projects/:projectId/funnels/:funnelId/batch-turns/:id
  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns/:id",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = idParamsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = updateBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten().fieldErrors });
      }

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [row] = await fastify.db
        .update(funnelBatchTurns)
        .set({ label: body.data.label, updatedAt: new Date() })
        .where(and(eq(funnelBatchTurns.id, p.data.id), eq(funnelBatchTurns.funnelId, p.data.funnelId)))
        .returning();

      if (!row) return reply.code(404).send({ error: "Virada de lote não encontrada" });

      return toDto(row);
    }
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/batch-turns/:id
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns/:id",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = idParamsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const result = await fastify.db
        .delete(funnelBatchTurns)
        .where(and(eq(funnelBatchTurns.id, p.data.id), eq(funnelBatchTurns.funnelId, p.data.funnelId)))
        .returning({ id: funnelBatchTurns.id });

      if (result.length === 0) return reply.code(404).send({ error: "Virada de lote não encontrada" });

      return reply.code(204).send();
    }
  );
});
