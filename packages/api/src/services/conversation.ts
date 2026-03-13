import fp from "fastify-plugin";
import { eq, and, desc, isNull, lt, count } from "drizzle-orm";
import { users, conversations, messages } from "../db/schema.js";

interface ConversationService {
  resolveUserId(clerkId: string): Promise<string | null>;
  list(options: {
    userId: string;
    limit: number;
    offset: number;
    mindId?: string;
  }): Promise<{
    conversations: (typeof conversations.$inferSelect)[];
    total: number;
  }>;
  getMessages(options: {
    conversationId: string;
    userId: string;
    limit: number;
    before?: string;
  }): Promise<{ messages: (typeof messages.$inferSelect)[] } | null>;
  softDelete(options: {
    conversationId: string;
    userId: string;
  }): Promise<boolean>;
}

declare module "fastify" {
  interface FastifyInstance {
    conversationService: ConversationService;
  }
}

export default fp(async function conversationService(fastify) {
  // AC 6: Resolve Clerk ID → users.id (UUID)
  async function resolveUserId(clerkId: string): Promise<string | null> {
    const [user] = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    return user?.id ?? null;
  }

  // AC 2: List conversations for authenticated user
  async function list(options: {
    userId: string;
    limit: number;
    offset: number;
    mindId?: string;
  }) {
    const conditions = [
      eq(conversations.userId, options.userId),
      isNull(conversations.deletedAt),
    ];

    if (options.mindId) {
      conditions.push(eq(conversations.mindId, options.mindId));
    }

    const whereClause = and(...conditions);

    const [items, [totalResult]] = await Promise.all([
      fastify.db
        .select()
        .from(conversations)
        .where(whereClause)
        .orderBy(desc(conversations.updatedAt))
        .limit(options.limit)
        .offset(options.offset),
      fastify.db
        .select({ total: count() })
        .from(conversations)
        .where(whereClause),
    ]);

    return { conversations: items, total: totalResult.total };
  }

  // AC 3: Get messages for a conversation with cursor pagination
  async function getMessages(options: {
    conversationId: string;
    userId: string;
    limit: number;
    before?: string;
  }) {
    // Ownership check
    const [conv] = await fastify.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, options.conversationId),
          eq(conversations.userId, options.userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1);

    if (!conv) {
      return null;
    }

    const conditions = [eq(messages.conversationId, options.conversationId)];

    // Cursor pagination
    if (options.before) {
      const [cursorMsg] = await fastify.db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, options.before))
        .limit(1);

      if (cursorMsg) {
        conditions.push(lt(messages.createdAt, cursorMsg.createdAt));
      }
    }

    const items = await fastify.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options.limit);

    // Return in chronological order
    items.reverse();

    return { messages: items };
  }

  // AC 4: Soft delete conversation
  async function softDelete(options: {
    conversationId: string;
    userId: string;
  }) {
    // Ownership check
    const [conv] = await fastify.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, options.conversationId),
          eq(conversations.userId, options.userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1);

    if (!conv) {
      return false;
    }

    await fastify.db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, options.conversationId));

    return true;
  }

  fastify.decorate("conversationService", {
    resolveUserId,
    list,
    getMessages,
    softDelete,
  });
});
