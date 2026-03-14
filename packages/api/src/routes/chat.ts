import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import type { FastifyReply } from "fastify";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import { conversations, messages } from "../db/schema.js";
import { getChatTools, executeChatTool } from "../services/chat-tools.js";

const chatRequestSchema = z.object({
  mindId: z.string().min(1),
  conversationId: z.string().uuid().nullable(),
  message: z.string().min(1).max(10000),
});

export const TASK_BLOCK_REGEX = /```json:task\s*\n([\s\S]*?)```/;
const MAX_HISTORY_MESSAGES = 20;

function sendSSE(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default fp(async function chatRoutes(fastify) {
  fastify.post(
    "/api/chat",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      // Validate request body
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.code(400);
        return {
          error: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors,
        };
      }

      const { mindId, conversationId: requestConvId, message } =
        parseResult.data;
      const userId = request.userId;

      // Resolve mind
      const mind = fastify.mindRegistry.getById(mindId);
      if (!mind) {
        reply.code(404);
        return { error: `Mind not found: ${mindId}` };
      }

      // Set up SSE response — use raw to bypass Fastify serialization
      const origin = request.headers.origin;
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...(origin
          ? {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Credentials": "true",
            }
          : {}),
      });
      // Mark reply as sent so Fastify doesn't try to serialize
      reply.hijack();

      try {
        // Resolve or create conversation
        let conversationId: string;
        let isNew = false;

        if (requestConvId) {
          // Verify conversation exists and belongs to user
          const existing = await fastify.db
            .select({
              id: conversations.id,
              userId: conversations.userId,
            })
            .from(conversations)
            .where(eq(conversations.id, requestConvId))
            .limit(1);

          if (existing.length === 0) {
            sendSSE(reply, "error", { message: "Conversation not found" });
            reply.raw.end();
            return;
          }

          if (existing[0].userId !== userId) {
            sendSSE(reply, "error", { message: "Access denied" });
            reply.raw.end();
            return;
          }

          conversationId = requestConvId;
        } else {
          // Create new conversation
          const [newConv] = await fastify.db
            .insert(conversations)
            .values({
              userId,
              mindId,
              mindName: mind.name,
              squadId: mind.squad,
            })
            .returning({ id: conversations.id });
          conversationId = newConv.id;
          isNew = true;
        }

        // Emit conversation event
        sendSSE(reply, "conversation", { conversationId, isNew });

        // Persist user message
        await fastify.db.insert(messages).values({
          conversationId,
          role: "user",
          content: message,
        });

        // Load message history (last 20)
        const history = await fastify.db
          .select({
            role: messages.role,
            content: messages.content,
          })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(MAX_HISTORY_MESSAGES);

        // Reverse to chronological order (oldest first)
        history.reverse();

        // Build system prompt via MindEngine (tier 2)
        const systemPrompt = await fastify.mindEngine.buildPrompt(mindId, 2);

        // Build messages array for Claude API
        const claudeMessages: MessageParam[] = history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Get available tools for this chat
        const tools = getChatTools(fastify);

        // Run agentic loop — Claude decides when to use tools
        const { fullText, finalMessage, toolCallCount } =
          await fastify.claude.agentLoop({
            systemPrompt,
            messages: claudeMessages,
            tools,
            onText: (text: string) => {
              sendSSE(reply, "text_delta", { text });
            },
            onToolUse: (name: string, input: Record<string, unknown>) => {
              sendSSE(reply, "tool_use", { tool: name, input });
            },
            executeToolCall: (
              name: string,
              input: Record<string, unknown>,
            ) => {
              return executeChatTool(fastify, userId, name, input);
            },
          });

        // Detect task block
        const taskMatch = fullText.match(TASK_BLOCK_REGEX);
        const hasTaskBlock = taskMatch !== null;

        if (taskMatch) {
          try {
            const taskData = JSON.parse(taskMatch[1]);
            sendSSE(reply, "task_detected", {
              title: taskData.title ?? "",
              description: taskData.description ?? "",
              priority: taskData.priority ?? 3,
            });
          } catch {
            // Invalid JSON in task block — ignore silently
          }
        }

        // Get usage from final message
        const usage = finalMessage.usage;

        // Persist assistant message
        const [assistantMsg] = await fastify.db
          .insert(messages)
          .values({
            conversationId,
            role: "assistant",
            content: fullText,
            tokensUsed: usage.input_tokens + usage.output_tokens,
            metadata: {
              model: finalMessage.model,
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              taskDetected: hasTaskBlock,
              finishReason: finalMessage.stop_reason,
              toolCallCount,
            },
          })
          .returning({ id: messages.id });

        // Update conversation updated_at
        await fastify.db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));

        // Emit final events
        sendSSE(reply, "usage", {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        });

        sendSSE(reply, "done", { messageId: assistantMsg.id });

        reply.raw.end();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unexpected error occurred";
        fastify.log.error(err, "Chat stream error");

        try {
          sendSSE(reply, "error", { message: errorMessage });
          reply.raw.end();
        } catch {
          // Response may already be closed
        }
      }
    },
  );
});
