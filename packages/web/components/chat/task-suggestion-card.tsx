"use client";

import { Loader2, Check, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface TaskSuggestionCardProps {
  suggestion: TaskSuggestion;
  onConfirm: () => void;
  onDismiss: () => void;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-blue-500",
  low: "bg-gray-400",
};

export function TaskSuggestionCard({
  suggestion,
  onConfirm,
  onDismiss,
}: TaskSuggestionCardProps) {
  const priority = suggestion.priority ?? "normal";

  if (suggestion.status === "dismissed") return null;

  if (suggestion.status === "created") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2">
        <Check className="h-3.5 w-3.5 text-success shrink-0" />
        <span className="text-xs text-success">Criada no ClickUp</span>
        {suggestion.clickupUrl && (
          <a
            href={suggestion.clickupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-brand hover:underline"
          >
            Ver
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/80 px-3 py-2.5">
      <div className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[priority])} />
      <span className="flex-1 text-sm font-medium truncate">{suggestion.title}</span>

      {suggestion.status === "pending" && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onConfirm}
            className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            Criar
          </button>
          <button
            onClick={onDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {suggestion.status === "creating" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand shrink-0" />
      )}
    </div>
  );
}
