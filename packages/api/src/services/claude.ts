import Anthropic from "@anthropic-ai/sdk";
import fp from "fastify-plugin";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

export interface ClaudeStreamParams {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
}

type ClaudeMessageStream = ReturnType<Anthropic["messages"]["stream"]>;

interface ClaudeService {
  stream(params: ClaudeStreamParams): ClaudeMessageStream;
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
    stream(params: ClaudeStreamParams): ClaudeMessageStream {
      return client.messages.stream({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: params.systemPrompt,
        messages: params.messages,
      });
    },
  };

  fastify.decorate("claude", service);
});
