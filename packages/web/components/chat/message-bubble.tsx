"use client";

import { useState } from "react";
import { Copy, Check, Paperclip, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MindAvatar } from "@/components/minds/mind-avatar";
import { TaskSuggestionCard } from "@/components/chat/task-suggestion-card";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  mindName?: string;
  mindAvatarUrl?: string | null;
  isStreaming?: boolean;
  showAvatar?: boolean;
  taskSuggestions?: TaskSuggestion[];
  onConfirmTask?: (index: number) => void;
  onDismissTask?: (index: number) => void;
  onRegenerate?: () => void;
  attachmentMeta?: { filename: string };
}

export function MessageBubble({
  role,
  content,
  mindName,
  mindAvatarUrl,
  isStreaming,
  showAvatar = true,
  taskSuggestions,
  onConfirmTask,
  onDismissTask,
  onRegenerate,
  attachmentMeta,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {!isUser && showAvatar && mindName ? (
        <MindAvatar
          name={mindName}
          avatarUrl={mindAvatarUrl}
          size="sm"
          className="mt-0.5 shrink-0"
        />
      ) : !isUser && !showAvatar ? (
        <div className="w-8 shrink-0" />
      ) : null}

      <div className={cn("relative max-w-[75%]", isUser && "max-w-[70%]")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isUser
              ? "bg-brand text-brand-foreground rounded-br-md"
              : "bg-card border border-border/50 rounded-bl-md",
          )}
        >
          {isUser && attachmentMeta && (
            <div className="mb-1.5 flex items-center gap-1 text-xs text-brand-foreground/70">
              <Paperclip className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{attachmentMeta.filename}</span>
            </div>
          )}
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
          ) : content ? (
            <MarkdownRenderer content={content} />
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 py-1 px-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60" />
            </div>
          ) : null}
        </div>

        {/* Action buttons — hover-revealed on assistant messages */}
        {!isUser && content && !isStreaming && (
          <div className="absolute -bottom-3 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              title={copied ? "Copiado" : "Copiar resposta"}
              aria-label={copied ? "Copiado" : "Copiar resposta"}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-border/50 bg-card text-muted-foreground/60 shadow-sm transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                title="Regenerar resposta"
                aria-label="Regenerar resposta"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border/50 bg-card text-muted-foreground/60 shadow-sm transition-colors hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Task suggestions inline */}
        {!isUser && taskSuggestions && taskSuggestions.length > 0 && (
          <div className="mt-2 space-y-2">
            {taskSuggestions.map((suggestion, idx) => (
              <TaskSuggestionCard
                key={idx}
                suggestion={suggestion}
                onConfirm={() => onConfirmTask?.(idx)}
                onDismiss={() => onDismissTask?.(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
