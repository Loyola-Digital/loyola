"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface Message {
  role: "user" | "assistant";
  content: string;
  attachmentMeta?: { filename: string; mimeType: string; textLength: number };
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom();
    }
  }, [messages, isStreaming, showScrollButton, scrollToBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 100);
  }, []);

  // Determine if we should show avatar (first message in group or different role)
  const shouldShowAvatar = (index: number) => {
    if (messages[index].role === "user") return false;
    if (index === 0) return true;
    return messages[index - 1].role !== "assistant";
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl flex flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
                <span className="text-2xl">💬</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground/80">
                Inicie uma conversa
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Envie uma mensagem para {mindName} e receba orientacao especializada
              </p>
            </div>
          )}

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
                showAvatar={shouldShowAvatar(i)}
                attachmentMeta={msg.attachmentMeta}
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
      </div>

      {/* Scroll to bottom floating button */}
      <button
        onClick={() => scrollToBottom()}
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card shadow-md transition-all duration-200",
          showScrollButton
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none",
        )}
      >
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
