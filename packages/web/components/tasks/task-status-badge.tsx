"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@loyola-x/shared";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-600",
  open: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-yellow-500/10 text-yellow-600",
  review: "bg-purple-500/10 text-purple-600",
  done: "bg-green-500/10 text-green-600",
  cancelled: "bg-gray-500/10 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  open: "Aberta",
  in_progress: "Em progresso",
  review: "Revisao",
  done: "Concluida",
  cancelled: "Cancelada",
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs px-2 py-0.5", STATUS_STYLES[status])}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
