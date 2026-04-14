"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachmentMeta?: { filename: string; mimeType: string; textLength: number };
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

export interface ThinkingStep {
  label: string;
  tool: string;
  timestamp: number;
  status: "running" | "done";
}

export interface DebateTurn {
  speaker: "current" | "consulted";
  mindName: string;
  message: string;
  type: "question" | "response";
  timestamp: number;
}

const TOOL_LABELS: Record<string, string> = {
  clickup_get_workspaces: "Conectando ao ClickUp",
  clickup_get_spaces: "Navegando spaces",
  clickup_get_folders: "Buscando folders",
  clickup_get_lists: "Listando listas",
  clickup_get_tasks: "Buscando tarefas",
  clickup_get_task_details: "Carregando detalhes da tarefa",
  clickup_search: "Pesquisando no ClickUp",
  clickup_create_task: "Criando tarefa no ClickUp",
  get_past_conversations: "Consultando conversas anteriores",
  consult_mind: "🧠 Consultando especialista",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [taskSuggestions, setTaskSuggestions] = useState<TaskSuggestion[]>([]);
  const [debateTurns, setDebateTurns] = useState<DebateTurn[]>([]);
  const [debateActive, setDebateActive] = useState(false);
  const { getToken } = useAuth();
  const apiClient = useApiClient();
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      mindId: string,
      message: string,
      attachment?: {
        attachmentContext: string;
        attachmentMeta: { filename: string; mimeType: string; textLength: number };
      },
      projectId?: string,
    ) => {
      setError(null);
      setIsStreaming(true);
      setThinkingSteps([]);
      setDebateTurns([]);
      setDebateActive(false);

      // Optimistic: add user message (with attachment meta if present)
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: message,
          ...(attachment ? { attachmentMeta: attachment.attachmentMeta } : {}),
        },
      ]);

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
            ...(projectId ? { projectId } : {}),
            ...(attachment
              ? {
                  attachmentContext: attachment.attachmentContext,
                  attachmentMeta: attachment.attachmentMeta,
                }
              : {}),
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
                const toolName = parsed.tool as string;
                let label = TOOL_LABELS[toolName] ?? `Usando ${toolName}`;
                if (toolName === "clickup_search" && parsed.input?.query) {
                  label = `Pesquisando "${parsed.input.query}" no ClickUp`;
                }
                if (toolName === "consult_mind" && parsed.input?.mind_name) {
                  label = `🧠 Consultando ${parsed.input.mind_name}...`;
                }

                // Mark previous step as done, add new one
                setThinkingSteps((prev) => [
                  ...prev.map((s) => ({ ...s, status: "done" as const })),
                  { label, tool: toolName, timestamp: Date.now(), status: "running" },
                ]);
                break;
              }
              case "text_delta":
                // Mark all thinking steps as done when text starts arriving
                setThinkingSteps((prev) =>
                  prev.length > 0 && prev.some((s) => s.status === "running")
                    ? prev.map((s) => ({ ...s, status: "done" as const }))
                    : prev,
                );
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
              case "debate_turn":
                setDebateActive(true);
                setDebateTurns((prev) => [
                  ...prev,
                  {
                    speaker: parsed.speaker,
                    mindName: parsed.mindName,
                    message: parsed.message,
                    type: parsed.type,
                    timestamp: Date.now(),
                  },
                ]);
                break;
              case "task_detected":
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
                setDebateActive(false);
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
        setThinkingSteps([]);
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

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setDebateActive(false);
    setThinkingSteps([]);
  }, []);

  const regenerateLast = useCallback(
    async (mindId: string, projectId?: string) => {
      if (isStreaming) return;
      // Find the last user message and drop everything from there onwards.
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx === -1) return;
      const lastUser = messages[lastUserIdx];
      setMessages((prev) => prev.slice(0, lastUserIdx));
      setTaskSuggestions((prev) => prev.filter((s) => s.messageIndex < lastUserIdx));
      await sendMessage(mindId, lastUser.content, undefined, projectId);
    },
    [isStreaming, messages, sendMessage],
  );

  return {
    messages,
    isStreaming,
    thinkingSteps,
    error,
    conversationId,
    taskSuggestions,
    debateTurns,
    debateActive,
    sendMessage,
    loadHistory,
    updateTaskSuggestion,
    stopStream,
    regenerateLast,
  };
}
