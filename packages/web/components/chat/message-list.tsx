"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  mindName: string;
  taskSuggestions?: TaskSuggestion[];
  onConfirmTask?: (globalIndex: number) => void;
  onDismissTask?: (globalIndex: number) => void;
}

export function MessageList({
  messages,
  isStreaming,
  mindName,
  taskSuggestions,
  onConfirmTask,
  onDismissTask,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4">
        {messages.map((msg, i) => {
          const suggestionsForMessage = taskSuggestions?.filter(
            (s) => s.messageIndex === i,
          );
          const globalIndices = taskSuggestions
            ?.map((s, idx) => ({ ...s, globalIdx: idx }))
            .filter((s) => s.messageIndex === i);

          return (
            <MessageBubble
              key={i}
              role={msg.role}
              content={msg.content}
              mindName={mindName}
              isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              taskSuggestions={suggestionsForMessage}
              onConfirmTask={
                globalIndices
                  ? (localIdx) => onConfirmTask?.(globalIndices[localIdx].globalIdx)
                  : undefined
              }
              onDismissTask={
                globalIndices
                  ? (localIdx) => onDismissTask?.(globalIndices[localIdx].globalIdx)
                  : undefined
              }
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
