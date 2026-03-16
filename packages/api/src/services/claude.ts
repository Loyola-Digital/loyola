import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ContentBlockParam,
  ToolResultBlockParam,
  Message,
} from "@anthropic-ai/sdk/resources/messages.js";
import fp from "fastify-plugin";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return err.status === 529 || err.status === 429 || err.status >= 500;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("overloaded") || msg.includes("rate limit") || msg.includes("econnreset");
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, logger?: { warn: (msg: string) => void }): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger?.warn(`Anthropic API retryable error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export interface ClaudeStreamParams {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
}

export interface ClaudeAgentParams {
  systemPrompt: string;
  messages: MessageParam[];
  tools?: Tool[];
  model?: string;
  maxTokens?: number;
  onText?: (text: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  executeToolCall: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string>;
}

type ClaudeMessageStream = ReturnType<Anthropic["messages"]["stream"]>;

interface ClaudeService {
  stream(params: ClaudeStreamParams): ClaudeMessageStream;
  agentLoop(params: ClaudeAgentParams): Promise<{
    fullText: string;
    finalMessage: Message;
    toolCallCount: number;
  }>;
  client: Anthropic;
}

declare module "fastify" {
  interface FastifyInstance {
    claude: ClaudeService;
  }
}

export default fp(async function claudePlugin(fastify) {
  const client = new Anthropic({
    apiKey: fastify.config.ANTHROPIC_API_KEY,
  });

  const service: ClaudeService = {
    client,

    stream(params: ClaudeStreamParams): ClaudeMessageStream {
      return client.messages.stream({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: params.systemPrompt,
        messages: params.messages,
      });
    },

    async agentLoop(params: ClaudeAgentParams) {
      const {
        systemPrompt,
        tools,
        model,
        maxTokens,
        onText,
        onToolUse,
        executeToolCall,
      } = params;

      let currentMessages = [...params.messages];
      let fullText = "";
      let finalMessage: Message | null = null;
      let toolCallCount = 0;
      const maxToolRounds = 10;

      for (let round = 0; round < maxToolRounds; round++) {
        const message = await withRetry(async () => {
          const stream = client.messages.stream({
            model: model ?? DEFAULT_MODEL,
            max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
            system: systemPrompt,
            messages: currentMessages,
            ...(tools && tools.length > 0 ? { tools } : {}),
          });

          stream.on("text", (text: string) => {
            fullText += text;
            onText?.(text);
          });

          return stream.finalMessage();
        }, fastify.log);
        finalMessage = message;

        // Check if there are tool_use blocks
        const toolUseBlocks = message.content.filter(
          (b) => b.type === "tool_use",
        );

        if (toolUseBlocks.length === 0 || message.stop_reason !== "tool_use") {
          // No tool calls — we're done
          break;
        }

        // Execute tool calls
        const toolResults: ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          if (block.type !== "tool_use") continue;

          toolCallCount++;
          onToolUse?.(block.name, block.input as Record<string, unknown>);

          try {
            const result = await executeToolCall(
              block.name,
              block.input as Record<string, unknown>,
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          } catch (err) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
              is_error: true,
            });
          }
        }

        // Add assistant message + tool results to continue the loop
        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: message.content },
          {
            role: "user" as const,
            content: toolResults as ContentBlockParam[],
          },
        ];
      }

      // Safety net: if loop ended after a tool call, do one final round
      // without tools so Claude can generate a text response
      if (
        finalMessage &&
        finalMessage.stop_reason === "tool_use"
      ) {
        finalMessage = await withRetry(async () => {
          const finalStream = client.messages.stream({
            model: model ?? DEFAULT_MODEL,
            max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
            system: systemPrompt,
            messages: currentMessages,
          });

          finalStream.on("text", (text: string) => {
            fullText += text;
            onText?.(text);
          });

          return finalStream.finalMessage();
        }, fastify.log);
      }

      return {
        fullText,
        finalMessage: finalMessage!,
        toolCallCount,
      };
    },
  };

  fastify.decorate("claude", service);
});
