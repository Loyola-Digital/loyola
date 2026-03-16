"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MindAvatar } from "@/components/minds/mind-avatar";
import { TaskSuggestionCard } from "@/components/chat/task-suggestion-card";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  mindName?: string;
  isStreaming?: boolean;
  showAvatar?: boolean;
  taskSuggestions?: TaskSuggestion[];
  onConfirmTask?: (index: number) => void;
  onDismissTask?: (index: number) => void;
}

export function MessageBubble({
  role,
  content,
  mindName,
  isStreaming,
  showAvatar = true,
  taskSuggestions,
  onConfirmTask,
  onDismissTask,
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
        <MindAvatar name={mindName} size="sm" className="mt-0.5 shrink-0" />
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
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
          ) : content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border/50 prose-code:text-brand prose-code:font-normal prose-headings:text-foreground prose-a:text-brand prose-a:no-underline hover:prose-a:underline">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 py-1 px-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand/60" />
            </div>
          ) : null}
        </div>

        {/* Copy button — hover-revealed on assistant messages */}
        {!isUser && content && !isStreaming && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-3 right-2 flex h-6 w-6 items-center justify-center rounded-md border border-border/50 bg-card text-muted-foreground/60 opacity-0 shadow-sm transition-all hover:text-foreground group-hover:opacity-100"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
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
