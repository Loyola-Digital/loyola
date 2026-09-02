import { z } from "zod";
import fp from "fastify-plugin";
import { eq, and, desc, count, isNull } from "drizzle-orm";
import { delegatedTasks, conversations } from "../db/schema.js";

const createTaskBodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  mindId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  tags: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  status: z
    .enum(["pending", "open", "in_progress", "review", "done", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export default fp(async function taskRoutes(fastify) {
  /**
   * O painel de tarefas dos agentes é de administração, não do produto.
   *
   * O menu deixou de mostrá-lo para quem não é admin, mas esconder um item não
   * fecha a porta: quem digitar `/tasks` continuaria entrando, e a API
   * continuaria respondendo. O guard é aqui, que é onde ele resiste.
   */
  function soAdmin(request: { userRole?: string }): boolean {
    return request.userRole !== "admin";
  }

  // POST /api/tasks
  fastify.post("/api/tasks", async (request, reply) => {
    if (soAdmin(request)) return reply.code(403).send({ error: "Acesso negado" });
    const bodyResult = createTaskBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: bodyResult.error.flatten().fieldErrors,
      });
    }

    const userId = request.userId;

    // Ownership check
    const { conversationId, messageId, mindId, title, description, priority, tags } =
      bodyResult.data;

    const [conv] = await fastify.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
        ),
      )
      .limit(1);

    if (!conv) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    // Create in ClickUp first — if it fails, do NOT save locally (AC 6)
    let clickupResult: { id: string; url: string };
    try {
      clickupResult = await fastify.clickupService.createTask({
        name: title,
        description,
        priority,
        tags,
      });
    } catch (err) {
      return reply.code(502).send({
        error: "Failed to create task in ClickUp",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }

    // Insert with idempotency (AC 7)
    const [inserted] = await fastify.db
      .insert(delegatedTasks)
      .values({
        conversationId,
        messageId,
        userId,
        mindId,
        clickupTaskId: clickupResult.id,
        clickupUrl: clickupResult.url,
        title,
        description: description ?? null,
        priority,
        tags: tags ?? null,
      })
      .onConflictDoNothing({ target: delegatedTasks.clickupTaskId })
      .returning();

    // If conflict, return existing
    if (!inserted) {
      const [existing] = await fastify.db
        .select()
        .from(delegatedTasks)
        .where(eq(delegatedTasks.clickupTaskId, clickupResult.id))
        .limit(1);
      return reply.code(200).send(existing);
    }

    return reply.code(201).send(inserted);
  });

  // GET /api/tasks
  fastify.get("/api/tasks", async (request, reply) => {
    if (soAdmin(request)) return reply.code(403).send({ error: "Acesso negado" });
    const queryResult = listQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({
        error: "Invalid query parameters",
        details: queryResult.error.flatten().fieldErrors,
      });
    }

    const userId = request.userId;
    const { status, limit, offset } = queryResult.data;

    const conditions = [eq(delegatedTasks.userId, userId)];
    if (status) {
      conditions.push(eq(delegatedTasks.status, status));
    }
    const whereClause = and(...conditions);

    const [items, [totalResult]] = await Promise.all([
      fastify.db
        .select()
        .from(delegatedTasks)
        .where(whereClause)
        .orderBy(desc(delegatedTasks.createdAt))
        .limit(limit)
        .offset(offset),
      fastify.db
        .select({ total: count() })
        .from(delegatedTasks)
        .where(whereClause),
    ]);

    return { tasks: items, total: totalResult.total };
  });
});
