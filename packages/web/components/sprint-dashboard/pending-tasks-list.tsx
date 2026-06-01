"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { collectBlockTasks, formatRelativeDue, getPendingTasks } from "./summary-utils";
import type { SprintDashboardBlock } from "@loyola-x/shared";
import type { ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";

interface PendingTasksListProps {
  block: SprintDashboardBlock;
  tasksByListId: Map<string, ClickUpTaskShape[]>;
}

const DEFAULT_LIMIT = 5;

/**
 * Story 31.7 — Lista de tasks pendentes (atraso + hoje) de um bloco no
 * Calendário Macro. Usa o mesmo filtro do BlockCard pra coerência.
 */
export function PendingTasksList({ block, tasksByListId }: PendingTasksListProps) {
  const [expanded, setExpanded] = useState(false);

  const pending = useMemo(() => {
    const tasks = collectBlockTasks(block, tasksByListId);
    return getPendingTasks(tasks);
  }, [block, tasksByListId]);

  const visible = expanded ? pending : pending.slice(0, DEFAULT_LIMIT);
  const hidden = pending.length - visible.length;

  return (
    <div className="pt-3 border-t border-border/30 space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertCircle className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Pendentes ({pending.length})
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma task em atraso ou pra hoje
        </p>
      ) : (
        <div className="space-y-1.5">
          {visible.map(({ task, isOverdue, isToday, dueDateMs }) => (
            <div
              key={task.id}
              className="flex items-start gap-2 py-0.5 pl-2 border-l-2"
              style={{
                borderLeftColor: isOverdue
                  ? "rgb(239 68 68)" // red-500
                  : isToday
                  ? "rgb(245 158 11)" // amber-500
                  : "transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <a
                  href={task.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-foreground hover:underline truncate flex items-center gap-1 group"
                >
                  <span className="truncate">{task.name}</span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
                </a>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {task.statusColor ? (
                    <span
                      className="px-1.5 py-px rounded-full text-[9px] font-medium"
                      style={{
                        background: `${task.statusColor}22`,
                        color: task.statusColor,
                      }}
                    >
                      {task.status}
                    </span>
                  ) : (
                    <span className="px-1.5 py-px rounded-full bg-muted text-[9px]">
                      {task.status}
                    </span>
                  )}
                  <span
                    className={
                      isOverdue
                        ? "text-red-500 font-medium"
                        : isToday
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : ""
                    }
                  >
                    {formatRelativeDue(dueDateMs)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-2"
            >
              +{hidden} pendente{hidden > 1 ? "s" : ""}
            </button>
          )}
          {expanded && pending.length > DEFAULT_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-2"
            >
              Recolher
            </button>
          )}
        </div>
      )}
    </div>
  );
}
