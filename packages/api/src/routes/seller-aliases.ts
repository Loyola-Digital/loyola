/**
 * Merge de Vendedor — CRUD de aliases de vendedor (escopo por projeto).
 *
 * Permite unificar variações do nome do vendedor que vêm de fontes distintas
 * (ex: `utm_source` "isabela" na planilha de vendas × `sellerName` "ISABELA
 * COMERCIAL" na venda manual PIX) num único nome canônico exibido no
 * sellers-breakdown. Os aliases são guardados já normalizados (lowercase+trim).
 *
 * Endpoints (todos sob /api/projects/:projectId/seller-aliases):
 *   GET    /            → lista aliases do projeto
 *   POST   /            → cria um vendedor canônico + suas variações
 *   PUT    /:id         → atualiza nome canônico e/ou variações
 *   DELETE /:id         → remove
 *
 * Gating binário (project_permission_model): leitura liberada; escrita só pra
 * não-guest.
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import { sellerAliases, projects, projectMembers } from "../db/schema.js";

// ============================================================
// HELPERS
// ============================================================

/** Normaliza alias pra match case-insensitive: lowercase + trim. */
function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

/** Sanitiza lista de aliases: normaliza, remove vazios e duplicatas. */
function sanitizeAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const norm = normalizeAlias(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

// ============================================================
// SCHEMAS
// ============================================================

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const aliasParamsSchema = projectParamsSchema.extend({
  id: z.string().uuid(),
});

const createSchema = z.object({
  canonicalName: z.string().trim().min(1).max(255),
  aliases: z.array(z.string().trim().min(1).max(255)).default([]),
});

const updateSchema = z.object({
  canonicalName: z.string().trim().min(1).max(255).optional(),
  aliases: z.array(z.string().trim().min(1).max(255)).optional(),
});

// ============================================================
// ROUTE
// ============================================================

export default fp(async function sellerAliasesRoutes(fastify) {
  /** Confirma acesso ao projeto (guest precisa ser membro). */
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
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
    return project ?? null;
  }

  // ---------------------------------------------------------------
  // GET — lista aliases do projeto
  // ---------------------------------------------------------------
  fastify.get("/api/projects/:projectId/seller-aliases", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const rows = await fastify.db
      .select()
      .from(sellerAliases)
      .where(eq(sellerAliases.projectId, params.data.projectId))
      .orderBy(asc(sellerAliases.canonicalName));

    return rows;
  });

  // ---------------------------------------------------------------
  // POST — cria vendedor canônico + variações
  // ---------------------------------------------------------------
  fastify.post("/api/projects/:projectId/seller-aliases", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Sem permissão para editar" });
    }

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [created] = await fastify.db
      .insert(sellerAliases)
      .values({
        projectId: params.data.projectId,
        canonicalName: body.data.canonicalName,
        aliases: sanitizeAliases(body.data.aliases),
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ---------------------------------------------------------------
  // PUT — atualiza nome canônico e/ou variações
  // ---------------------------------------------------------------
  fastify.put("/api/projects/:projectId/seller-aliases/:id", async (request, reply) => {
    const params = aliasParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Sem permissão para editar" });
    }

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const body = updateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const patch: Partial<typeof sellerAliases.$inferInsert> = { updatedAt: new Date() };
    if (body.data.canonicalName !== undefined) patch.canonicalName = body.data.canonicalName;
    if (body.data.aliases !== undefined) patch.aliases = sanitizeAliases(body.data.aliases);

    const [updated] = await fastify.db
      .update(sellerAliases)
      .set(patch)
      .where(
        and(
          eq(sellerAliases.id, params.data.id),
          eq(sellerAliases.projectId, params.data.projectId),
        ),
      )
      .returning();

    if (!updated) return reply.code(404).send({ error: "Alias não encontrado" });
    return updated;
  });

  // ---------------------------------------------------------------
  // DELETE — remove
  // ---------------------------------------------------------------
  fastify.delete("/api/projects/:projectId/seller-aliases/:id", async (request, reply) => {
    const params = aliasParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Sem permissão para editar" });
    }

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [deleted] = await fastify.db
      .delete(sellerAliases)
      .where(
        and(
          eq(sellerAliases.id, params.data.id),
          eq(sellerAliases.projectId, params.data.projectId),
        ),
      )
      .returning({ id: sellerAliases.id });

    if (!deleted) return reply.code(404).send({ error: "Alias não encontrado" });
    return { success: true };
  });
});
