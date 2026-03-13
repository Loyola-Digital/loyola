export interface Conversation {
  id: string;
  userId: string;
  mindId: string;
  mindName: string;
  squadId: string;
  title: string | null;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  tokensUsed: number | null;
  metadata: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    taskDetected?: boolean;
    finishReason?: string;
  } | null;
  createdAt: string;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface MessageListResponse {
  messages: Message[];
}
