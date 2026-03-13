export interface ChatRequest {
  mindId: string;
  conversationId: string | null;
  message: string;
}

export type SSEEvent =
  | { type: "conversation"; conversationId: string; isNew: boolean }
  | { type: "text_delta"; text: string }
  | {
      type: "task_detected";
      title: string;
      description: string;
      priority: number;
    }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string; code?: string };
