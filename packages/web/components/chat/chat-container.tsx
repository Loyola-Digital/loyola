"use client";

import { useEffect, useCallback } from "react";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { useCreateTask } from "@/lib/hooks/use-create-task";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { ThinkingIndicator } from "./thinking-indicator";
import { DebateCard } from "./debate-view";

interface ChatContainerProps {
  mindId: string;
  mindName: string;
  mindAvatarUrl?: string | null;
  conversationId?: string;
  projectId?: string;
}

export function ChatContainer({
  mindId,
  mindName,
  mindAvatarUrl,
  conversationId: initialConversationId,
  projectId,
}: ChatContainerProps) {
  const {
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
      sendMessage(mindId, message, attachment, projectId);
    },
    [sendMessage, mindId, projectId],
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

  const handleRegenerate = useCallback(() => {
    regenerateLast(mindId, projectId);
  }, [regenerateLast, mindId, projectId]);

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        mindName={mindName}
        mindAvatarUrl={mindAvatarUrl}
        taskSuggestions={taskSuggestions}
        onConfirmTask={handleConfirmTask}
        onDismissTask={handleDismissTask}
        onRegenerate={handleRegenerate}
      />

      {debateTurns.length > 0 && (
        <div className="px-4 pb-2 max-w-3xl mx-auto w-full">
          <DebateCard turns={debateTurns} currentMindName={mindName} isActive={debateActive} onStop={stopStream} />
        </div>
      )}
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
