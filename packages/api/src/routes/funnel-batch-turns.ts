import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelBatchTurns } from "../db/schema.js";
import { resolverMarcaDoDia } from "../services/marca-do-dia.js";

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
  /** Observação de texto livre do dia. `null` = sem observação. */
  nota: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: typeof funnelBatchTurns.$inferSelect): BatchTurnDto {
  return {
    id: row.id,
    date:
      typeof row.date === "string"
        ? row.date
        : new Date(row.date).toISOString().slice(0, 10),
    label: row.label,
    nota: row.nota ?? null,
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
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(
        p.data.projectId,
        p.data.funnelId,
      );
      if (!funnel)
        return reply.code(404).send({ error: "Funil não encontrado" });

      const rows = await fastify.db
        .select()
        .from(funnelBatchTurns)
        .where(eq(funnelBatchTurns.funnelId, p.data.funnelId))
        .orderBy(asc(funnelBatchTurns.date));

      return rows.map(toDto);
    },
  );

  // POST /api/projects/:projectId/funnels/:funnelId/batch-turns
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = createBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply
          .code(400)
          .send({
            error: "Dados inválidos",
            details: body.error.flatten().fieldErrors,
          });
      }

      const funnel = await ensureFunnelInProject(
        p.data.projectId,
        p.data.funnelId,
      );
      if (!funnel)
        return reply.code(404).send({ error: "Funil não encontrado" });

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
          return reply
            .code(409)
            .send({ error: "Já existe uma virada de lote nesta data" });
        }
        fastify.log.error({ err }, "[funnel-batch-turns] insert failed");
        return reply.code(500).send({ error: "Erro ao criar virada de lote" });
      }
    },
  );

  // PATCH /api/projects/:projectId/funnels/:funnelId/batch-turns/:id
  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns/:id",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = idParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = updateBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply
          .code(400)
          .send({
            error: "Dados inválidos",
            details: body.error.flatten().fieldErrors,
          });
      }

      const funnel = await ensureFunnelInProject(
        p.data.projectId,
        p.data.funnelId,
      );
      if (!funnel)
        return reply.code(404).send({ error: "Funil não encontrado" });

      const [row] = await fastify.db
        .update(funnelBatchTurns)
        .set({ label: body.data.label, updatedAt: new Date() })
        .where(
          and(
            eq(funnelBatchTurns.id, p.data.id),
            eq(funnelBatchTurns.funnelId, p.data.funnelId),
          ),
        )
        .returning();

      if (!row)
        return reply.code(404).send({ error: "Virada de lote não encontrada" });

      return toDto(row);
    },
  );

  /**
   * Grava a marca do dia — virada de lote e/ou observação — por DATA.
   *
   * ## Por que por data, e não por id
   *
   * Quem clica numa linha da tabela sabe a data, não o id: a linha pode não ter
   * marca nenhuma ainda. Fazer o cliente descobrir se existe, e então escolher
   * entre POST e PATCH, é lógica de servidor vazando para a tela — e três
   * chamadas onde uma resolve.
   *
   * ## Os dois vazios apagam a linha
   *
   * Sem isso, remover a observação deixaria uma linha fantasma que a tabela
   * desenha como marco sem texto. O CHECK da migration recusaria o UPDATE de
   * qualquer forma; apagar é o que a pessoa quis dizer.
   *
   * Campo ausente no corpo NÃO é mexido: mandar só `nota` preserva a virada de
   * lote que já estava lá.
   */
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns/por-data/:date",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = z
        .object({
          projectId: z.string().uuid(),
          funnelId: z.string().uuid(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .safeParse(request.params);
      const body = z
        .object({
          label: z.string().max(255).optional(),
          nota: z.string().max(2000).nullable().optional(),
        })
        .safeParse(request.body);
      if (!p.success || !body.success) {
        return reply.code(400).send({ error: "Dados inválidos" });
      }

      const funnel = await ensureFunnelInProject(
        p.data.projectId,
        p.data.funnelId,
      );
      if (!funnel)
        return reply.code(404).send({ error: "Funil não encontrado" });

      const [atual] = await fastify.db
        .select()
        .from(funnelBatchTurns)
        .where(
          and(
            eq(funnelBatchTurns.funnelId, p.data.funnelId),
            eq(funnelBatchTurns.date, p.data.date),
          ),
        )
        .limit(1);

      // A regra vive em `resolverMarcaDoDia`, testada: campo ausente não é
      // mexido, e os dois vazios significam apagar.
      const decisao = resolverMarcaDoDia(
        atual ? { label: atual.label, nota: atual.nota } : null,
        body.data,
      );

      if (decisao.acao === "remover") {
        if (atual) {
          await fastify.db
            .delete(funnelBatchTurns)
            .where(eq(funnelBatchTurns.id, atual.id));
        }
        return { removido: true };
      }
      const { label, nota } = decisao.marca;

      if (atual) {
        const [row] = await fastify.db
          .update(funnelBatchTurns)
          .set({ label, nota, updatedAt: new Date() })
          .where(eq(funnelBatchTurns.id, atual.id))
          .returning();
        return toDto(row!);
      }

      const [row] = await fastify.db
        .insert(funnelBatchTurns)
        .values({
          funnelId: p.data.funnelId,
          date: p.data.date,
          label,
          nota,
          createdBy: request.userId ?? null,
        })
        .returning();
      return reply.code(201).send(toDto(row!));
    },
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/batch-turns/:id
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/batch-turns/:id",
    async (request, reply) => {
      if (request.userRole === "guest")
        return reply.code(403).send({ error: "Acesso negado" });
      const p = idParamsSchema.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(
        p.data.projectId,
        p.data.funnelId,
      );
      if (!funnel)
        return reply.code(404).send({ error: "Funil não encontrado" });

      const result = await fastify.db
        .delete(funnelBatchTurns)
        .where(
          and(
            eq(funnelBatchTurns.id, p.data.id),
            eq(funnelBatchTurns.funnelId, p.data.funnelId),
          ),
        )
        .returning({ id: funnelBatchTurns.id });

      if (result.length === 0)
        return reply.code(404).send({ error: "Virada de lote não encontrada" });

      return reply.code(204).send();
    },
  );
});
