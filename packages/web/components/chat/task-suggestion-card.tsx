"use client";

import { Loader2, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TaskSuggestion } from "@/lib/hooks/use-chat-stream";

interface TaskSuggestionCardProps {
  suggestion: TaskSuggestion;
  onConfirm: () => void;
  onDismiss: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-red-500 bg-red-500/5",
  high: "border-l-orange-500 bg-orange-500/5",
  normal: "border-l-blue-500 bg-blue-500/5",
  low: "border-l-gray-400 bg-gray-400/5",
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-600",
  high: "bg-orange-500/10 text-orange-600",
  normal: "bg-blue-500/10 text-blue-600",
  low: "bg-gray-500/10 text-gray-500",
};

export function TaskSuggestionCard({
  suggestion,
  onConfirm,
  onDismiss,
}: TaskSuggestionCardProps) {
  const priority = suggestion.priority ?? "normal";

  if (suggestion.status === "dismissed") {
    return (
      <div className="mt-2 rounded border-l-4 border-l-gray-300 bg-muted/30 px-3 py-2 opacity-50">
        <p className="text-xs text-muted-foreground">Tarefa ignorada</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 rounded border-l-4 px-3 py-2",
        PRIORITY_COLORS[priority],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium truncate">{suggestion.title}</p>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0 shrink-0", PRIORITY_BADGE[priority])}
            >
              {priority}
            </Badge>
          </div>
          {suggestion.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {suggestion.description}
            </p>
          )}
          {suggestion.tags && suggestion.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {suggestion.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        {suggestion.status === "pending" && (
          <>
            <Button size="sm" className="h-7 text-xs" onClick={onConfirm}>
              Criar no ClickUp
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onDismiss}
            >
              Ignorar
            </Button>
          </>
        )}
        {suggestion.status === "creating" && (
          <Button size="sm" className="h-7 text-xs" disabled>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Criando...
          </Button>
        )}
        {suggestion.status === "created" && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Criada
            </span>
            {suggestion.clickupUrl && (
              <a
                href={suggestion.clickupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Ver no ClickUp
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
