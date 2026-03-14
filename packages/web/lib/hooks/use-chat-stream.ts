"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaskSuggestion {
  title: string;
  description?: string;
  priority?: "urgent" | "high" | "normal" | "low";
  tags?: string[];
  messageId?: string;
  messageIndex: number;
  status: "pending" | "creating" | "created" | "dismissed";
  clickupUrl?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [taskSuggestions, setTaskSuggestions] = useState<TaskSuggestion[]>([]);
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
              case "tool_use": {
                const toolLabels: Record<string, string> = {
                  clickup_get_workspaces: "Conectando ao ClickUp...",
                  clickup_get_spaces: "Navegando spaces...",
                  clickup_get_folders: "Buscando folders...",
                  clickup_get_lists: "Listando listas...",
                  clickup_get_tasks: "Buscando tarefas...",
                  clickup_get_task_details: "Carregando detalhes da tarefa...",
                  clickup_search: `Pesquisando "${parsed.input?.query ?? ""}" no ClickUp...`,
                  clickup_create_task: "Criando tarefa no ClickUp...",
                  get_past_conversations: "Consultando conversas anteriores...",
                };
                setActiveTool(toolLabels[parsed.tool] ?? `Usando ${parsed.tool}...`);
                break;
              }
              case "text_delta":
                setActiveTool(null);
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
                setTaskSuggestions((prev) => [
                  ...prev,
                  {
                    title: parsed.title,
                    description: parsed.description,
                    priority: parsed.priority,
                    tags: parsed.tags,
                    messageId: parsed.messageId,
                    messageIndex: messages.length + 1,
                    status: "pending",
                  },
                ]);
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
        setActiveTool(null);
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

  const updateTaskSuggestion = useCallback(
    (index: number, updates: Partial<TaskSuggestion>) => {
      setTaskSuggestions((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  return {
    messages,
    isStreaming,
    activeTool,
    error,
    conversationId,
    taskSuggestions,
    sendMessage,
    loadHistory,
    updateTaskSuggestion,
  };
}
