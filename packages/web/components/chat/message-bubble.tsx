"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { MindAvatar } from "@/components/minds/mind-avatar";
import { TaskSuggestionCard } from "@/components/chat/task-suggestion-card";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  mindName?: string;
  isStreaming?: boolean;
  taskSuggestions?: TaskSuggestion[];
  onConfirmTask?: (index: number) => void;
  onDismissTask?: (index: number) => void;
}

export function MessageBubble({
  role,
  content,
  mindName,
  isStreaming,
  taskSuggestions,
  onConfirmTask,
  onDismissTask,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {!isUser && mindName && <MindAvatar name={mindName} size="sm" />}

      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-2",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-1 py-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        ) : null}

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
