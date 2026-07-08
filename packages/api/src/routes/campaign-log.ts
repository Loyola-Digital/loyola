/**
 * Epic 38 / Story 38.1 — Log de Campanha
 *
 * Registro fixo por funil das ações executadas na campanha (disparo de
 * e-mail/WhatsApp/SMS, publicações, ações no gerenciador de anúncios, etc.).
 * Substitui a planilha manual. Acesso segue as regras das rotas de funil:
 * guest precisa de membership no projeto, e pode ler E escrever (o time de
 * tráfego lança ações).
 */

import { z } from "zod";
import { and, desc, eq, gte, ilike } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  campaignLogEntries,
  funnels,
  projects,
  projectMembers,
  users,
} from "../db/schema.js";

const funnelParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const entryParamsSchema = funnelParamsSchema.extend({
  entryId: z.string().uuid(),
});

const listQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(3650).default(90),
  evento: z.string().trim().max(80).optional(),
  aplicativo: z.string().trim().max(80).optional(),
  categoria: z.string().trim().max(80).optional(),
  /** Busca textual nas observações. */
  q: z.string().trim().max(200).optional(),
});

// Aceita ISO completo ou o formato do <input type="datetime-local"> (sem tz —
// interpretado como horário local do servidor, mesmo racional do saleDate).
const occurredAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "occurredAt inválido");

const baseEntryObject = z.object({
  occurredAt: occurredAtSchema,
  evento: z.string().trim().min(1).max(80),
  aplicativo: z.string().trim().max(80).nullable().optional().or(z.literal("").transform(() => null)),
  categoria: z.string().trim().max(80).nullable().optional().or(z.literal("").transform(() => null)),
  notes: z.string().trim().max(2000).nullable().optional().or(z.literal("").transform(() => null)),
  responsavel: z.string().trim().max(255).nullable().optional().or(z.literal("").transform(() => null)),
});

const createEntrySchema = baseEntryObject;
const updateEntrySchema = baseEntryObject.partial();

function shapeEntry(
  r: typeof campaignLogEntries.$inferSelect,
  author?: { name: string | null; avatarUrl: string | null } | null,
) {
  return {
    id: r.id,
    funnelId: r.funnelId,
    occurredAt: r.occurredAt.toISOString(),
    evento: r.evento,
    aplicativo: r.aplicativo,
    categoria: r.categoria,
    notes: r.notes,
    responsavel: r.responsavel,
    createdBy: r.createdBy,
    authorName: author?.name ?? null,
    authorAvatarUrl: author?.avatarUrl ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export default fp(async function campaignLogRoutes(fastify) {
  /** Valida projeto + funil (+ membership quando guest). null = sem acesso. */
  async function getFunnelContext(
    projectId: string,
    funnelId: string,
    userId: string,
    userRole: string,
  ) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return null;

    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---------------------------------------------------------------
  // GET — lista entradas do log (filtros opcionais)
  // ---------------------------------------------------------------
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const since = new Date(Date.now() - query.data.days * 24 * 60 * 60 * 1000);
      const conditions = [
        eq(campaignLogEntries.funnelId, params.data.funnelId),
        gte(campaignLogEntries.occurredAt, since),
      ];
      if (query.data.evento) conditions.push(eq(campaignLogEntries.evento, query.data.evento));
      if (query.data.aplicativo) conditions.push(eq(campaignLogEntries.aplicativo, query.data.aplicativo));
      if (query.data.categoria) conditions.push(eq(campaignLogEntries.categoria, query.data.categoria));
      if (query.data.q) conditions.push(ilike(campaignLogEntries.notes, `%${query.data.q}%`));

      const rows = await fastify.db
        .select({
          entry: campaignLogEntries,
          authorName: users.name,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(campaignLogEntries)
        .innerJoin(users, eq(campaignLogEntries.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(campaignLogEntries.occurredAt));

      return {
        entries: rows.map((r) =>
          shapeEntry(r.entry, { name: r.authorName, avatarUrl: r.authorAvatarUrl }),
        ),
      };
    },
  );

  // ---------------------------------------------------------------
  // POST — cria entrada
  // ---------------------------------------------------------------
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = createEntrySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const occurredAt = new Date(body.data.occurredAt);
      if (isNaN(occurredAt.getTime())) {
        return reply.code(400).send({ error: "Data/hora da ação inválida" });
      }

      const [created] = await fastify.db
        .insert(campaignLogEntries)
        .values({
          funnelId: params.data.funnelId,
          occurredAt,
          evento: body.data.evento,
          aplicativo: body.data.aplicativo ?? null,
          categoria: body.data.categoria ?? null,
          notes: body.data.notes ?? null,
          responsavel: body.data.responsavel ?? null,
          createdBy: request.userId,
        })
        .returning();

      return reply.code(201).send(shapeEntry(created));
    },
  );

  // ---------------------------------------------------------------
  // PATCH — edita entrada (parcial)
  // ---------------------------------------------------------------
  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log/:entryId",
    async (request, reply) => {
      const params = entryParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = updateEntrySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const updates: Partial<typeof campaignLogEntries.$inferInsert> = {};
      if (body.data.occurredAt !== undefined) {
        const occurredAt = new Date(body.data.occurredAt);
        if (isNaN(occurredAt.getTime())) {
          return reply.code(400).send({ error: "Data/hora da ação inválida" });
        }
        updates.occurredAt = occurredAt;
      }
      if (body.data.evento !== undefined) updates.evento = body.data.evento;
      if (body.data.aplicativo !== undefined) updates.aplicativo = body.data.aplicativo ?? null;
      if (body.data.categoria !== undefined) updates.categoria = body.data.categoria ?? null;
      if (body.data.notes !== undefined) updates.notes = body.data.notes ?? null;
      if (body.data.responsavel !== undefined) updates.responsavel = body.data.responsavel ?? null;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "Nenhum campo pra atualizar" });
      }
      updates.updatedAt = new Date();

      const [updated] = await fastify.db
        .update(campaignLogEntries)
        .set(updates)
        .where(
          and(
            eq(campaignLogEntries.id, params.data.entryId),
            eq(campaignLogEntries.funnelId, params.data.funnelId),
          ),
        )
        .returning();

      if (!updated) return reply.code(404).send({ error: "Entrada não encontrada" });
      return shapeEntry(updated);
    },
  );

  // ---------------------------------------------------------------
  // DELETE — remove entrada
  // ---------------------------------------------------------------
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/campaign-log/:entryId",
    async (request, reply) => {
      const params = entryParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await getFunnelContext(
        params.data.projectId,
        params.data.funnelId,
        request.userId,
        request.userRole,
      );
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const deleted = await fastify.db
        .delete(campaignLogEntries)
        .where(
          and(
            eq(campaignLogEntries.id, params.data.entryId),
            eq(campaignLogEntries.funnelId, params.data.funnelId),
          ),
        )
        .returning({ id: campaignLogEntries.id });

      if (deleted.length === 0) return reply.code(404).send({ error: "Entrada não encontrada" });
      return { ok: true };
    },
  );
});
