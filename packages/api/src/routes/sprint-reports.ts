/**
 * Sprint Reports — relatórios HTML gerados por IA (ex.: skill dashboard-campanhas
 * da gestora de projetos).
 *
 * Ingestão PÚBLICA via API key (scope "reports:write"): o Claude da gestora gera
 * o dashboard autocontido e POSTa aqui. Leitura/exclusão são internas (equipe,
 * guest bloqueado) — a aba Sprint lista e renderiza em iframe sandbox.
 */

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import { sprintReports } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";

export const REPORTS_WRITE_SCOPE = "reports:write";

/** HTML autocontido pode ser grande (SVG inline, dados embutidos) — 5MB de teto. */
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  html: z.string().min(1),
  author: z.string().trim().max(120).optional().nullable(),
  kind: z.string().trim().max(60).optional().nullable(),
});

export default fp(async function sprintReportsRoutes(fastify) {
  // ---- POST /api/public/v1/reports — ingestão via API key ----
  fastify.post(
    "/api/public/v1/reports",
    { preHandler: requireScope(REPORTS_WRITE_SCOPE), bodyLimit: MAX_HTML_BYTES + 64 * 1024 },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dados inválidos", code: "BAD_REQUEST", details: parsed.error.flatten().fieldErrors });
      }
      if (Buffer.byteLength(parsed.data.html, "utf8") > MAX_HTML_BYTES) {
        return reply.code(413).send({ error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" });
      }

      const [created] = await fastify.db
        .insert(sprintReports)
        .values({
          title: parsed.data.title,
          author: parsed.data.author ?? null,
          kind: parsed.data.kind ?? null,
          html: parsed.data.html,
        })
        .returning({ id: sprintReports.id, createdAt: sprintReports.createdAt });

      return reply.code(201).send({
        id: created.id,
        createdAt: created.createdAt,
        message: "Relatório publicado na aba Sprint do Loyola X.",
      });
    },
  );

  // ---- GET /api/sprint-reports — lista (equipe interna) ----
  fastify.get("/api/sprint-reports", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const rows = await fastify.db
      .select({
        id: sprintReports.id,
        title: sprintReports.title,
        author: sprintReports.author,
        kind: sprintReports.kind,
        createdAt: sprintReports.createdAt,
      })
      .from(sprintReports)
      .orderBy(desc(sprintReports.createdAt))
      .limit(200);
    return { reports: rows };
  });

  // ---- GET /api/sprint-reports/:id — HTML completo pro iframe ----
  fastify.get<{ Params: { id: string } }>("/api/sprint-reports/:id", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [row] = await fastify.db
      .select()
      .from(sprintReports)
      .where(eq(sprintReports.id, parsed.data.id))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Relatório não encontrado" });
    return row;
  });

  // ---- DELETE /api/sprint-reports/:id ----
  fastify.delete<{ Params: { id: string } }>("/api/sprint-reports/:id", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [deleted] = await fastify.db
      .delete(sprintReports)
      .where(eq(sprintReports.id, parsed.data.id))
      .returning({ id: sprintReports.id });
    if (!deleted) return reply.code(404).send({ error: "Relatório não encontrado" });
    return { ok: true };
  });
});
