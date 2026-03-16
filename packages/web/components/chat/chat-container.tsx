"use client";

import { useEffect, useCallback } from "react";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { useCreateTask } from "@/lib/hooks/use-create-task";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { ThinkingIndicator } from "./thinking-indicator";

interface ChatContainerProps {
  mindId: string;
  mindName: string;
  conversationId?: string;
}

export function ChatContainer({
  mindId,
  mindName,
  conversationId: initialConversationId,
}: ChatContainerProps) {
  const {
    messages,
    isStreaming,
    thinkingSteps,
    error,
    conversationId,
    taskSuggestions,
    sendMessage,
    loadHistory,
    updateTaskSuggestion,
  } = useChatStream();

  const createTask = useCreateTask();

  useEffect(() => {
    if (initialConversationId) {
      loadHistory(initialConversationId);
    }
  }, [initialConversationId, loadHistory]);

  const handleSend = useCallback(
    (
      message: string,
      attachment?: {
        attachmentContext: string;
        attachmentMeta: { filename: string; mimeType: string; textLength: number };
      },
    ) => {
      sendMessage(mindId, message, attachment);
    },
    [sendMessage, mindId],
  );

  const handleConfirmTask = useCallback(
    async (index: number) => {
      const suggestion = taskSuggestions[index];
      if (!suggestion || suggestion.status !== "pending") return;
      if (!conversationId) return;

      updateTaskSuggestion(index, { status: "creating" });

      try {
        const task = await createTask.mutateAsync({
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority ?? "normal",
          tags: suggestion.tags,
          mindId,
          conversationId,
          messageId: suggestion.messageId ?? "",
        });
        updateTaskSuggestion(index, {
          status: "created",
          clickupUrl: task.clickupUrl,
        });
      } catch {
        updateTaskSuggestion(index, { status: "pending" });
      }
    },
    [taskSuggestions, updateTaskSuggestion, createTask, mindId, conversationId],
  );

  const handleDismissTask = useCallback(
    (index: number) => {
      updateTaskSuggestion(index, { status: "dismissed" });
    },
    [updateTaskSuggestion],
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        mindName={mindName}
        taskSuggestions={taskSuggestions}
        onConfirmTask={handleConfirmTask}
        onDismissTask={handleDismissTask}
      />

      {thinkingSteps.length > 0 && <ThinkingIndicator steps={thinkingSteps} />}

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ChatInput onSend={handleSend} disabled={isStreaming} mindName={mindName} />
    </div>
  );
}
