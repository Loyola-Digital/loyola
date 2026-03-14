import { z } from "zod";
import fp from "fastify-plugin";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  mindId: z.string().optional(),
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export default fp(async function conversationRoutes(fastify) {
  // GET /api/conversations — list user's conversations
  fastify.get("/api/conversations", async (request, reply) => {
    const queryResult = listQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({
        error: "Invalid query parameters",
        details: queryResult.error.flatten().fieldErrors,
      });
    }

    const userId = request.userId;
    const { limit, offset, mindId } = queryResult.data;

    const result = await fastify.conversationService.list({
      userId,
      limit,
      offset,
      mindId,
    });

    return result;
  });

  // GET /api/conversations/:id/messages — conversation messages
  fastify.get("/api/conversations/:id/messages", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Invalid conversation ID" });
    }

    const queryResult = messagesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({
        error: "Invalid query parameters",
        details: queryResult.error.flatten().fieldErrors,
      });
    }

    const userId = request.userId;
    const { limit, before } = queryResult.data;

    const result = await fastify.conversationService.getMessages({
      conversationId: paramResult.data.id,
      userId,
      limit,
      before,
    });

    if (!result) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    return result;
  });

  // DELETE /api/conversations/:id — soft delete
  fastify.delete("/api/conversations/:id", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Invalid conversation ID" });
    }

    const userId = request.userId;

    const deleted = await fastify.conversationService.softDelete({
      conversationId: paramResult.data.id,
      userId,
    });

    if (!deleted) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    return { success: true };
  });
});
