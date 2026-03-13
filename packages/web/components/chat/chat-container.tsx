"use client";

import { useEffect, useCallback } from "react";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

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
  const { messages, isStreaming, error, sendMessage, loadHistory } =
    useChatStream();

  useEffect(() => {
    if (initialConversationId) {
      loadHistory(initialConversationId);
    }
  }, [initialConversationId, loadHistory]);

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(mindId, message);
    },
    [sendMessage, mindId],
  );

  return (
    <div className="flex h-full flex-col">
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        mindName={mindName}
      />

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
