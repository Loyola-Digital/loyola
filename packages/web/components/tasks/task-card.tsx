"use client";

import { ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import type { DelegatedTask } from "@loyola-x/shared";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-600",
  high: "bg-orange-500/10 text-orange-600",
  normal: "bg-blue-500/10 text-blue-600",
  low: "bg-gray-500/10 text-gray-500",
};

interface TaskCardProps {
  task: DelegatedTask;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium truncate">{task.title}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TaskStatusBadge status={task.status} />
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs px-2 py-0.5",
                  PRIORITY_BADGE[task.priority],
                )}
              >
                {task.priority}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {task.mindId}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(task.createdAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
            {task.tags && task.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <a
            href={task.clickupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
