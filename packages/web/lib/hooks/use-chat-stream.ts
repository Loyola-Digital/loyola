"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { getToken } = useAuth();
  const apiClient = useApiClient();
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (mindId: string, message: string) => {
      setError(null);
      setIsStreaming(true);

      // Optimistic: add user message
      setMessages((prev) => [...prev, { role: "user", content: message }]);

      // Add empty assistant message to accumulate
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const token = await getToken();
        abortRef.current = new AbortController();

        const response = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mindId,
            conversationId,
            message,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop()!;

          for (const block of blocks) {
            const eventMatch = block.match(/event: (.+)\ndata: (.+)/);
            if (!eventMatch) continue;

            const [, event, data] = eventMatch;
            const parsed = JSON.parse(data);

            switch (event) {
              case "conversation":
                setConversationId(parsed.conversationId);
                break;
              case "text_delta":
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + parsed.text,
                    };
                  }
                  return updated;
                });
                break;
              case "done":
                break;
              case "error":
                setError(parsed.message);
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(
            err instanceof Error ? err.message : "Erro ao enviar mensagem",
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [getToken, conversationId],
  );

  const loadHistory = useCallback(
    async (convId: string) => {
      try {
        const data = await apiClient<{
          messages: Array<{ role: "user" | "assistant"; content: string }>;
        }>(`/api/conversations/${convId}/messages?limit=50`);
        setMessages(
          data.messages.map((m) => ({ role: m.role, content: m.content })),
        );
        setConversationId(convId);
      } catch {
        setError("Erro ao carregar histórico");
      }
    },
    [apiClient],
  );

  return {
    messages,
    isStreaming,
    error,
    conversationId,
    sendMessage,
    loadHistory,
  };
}
