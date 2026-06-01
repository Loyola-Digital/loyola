"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Check, Circle, Clock, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SprintDashboardBlock } from "@loyola-x/shared";
import type { ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";
import { applyFilters, isDoneStatus, extractAutoPhases } from "./summary-utils";
import { BlockSummaryCard } from "./block-summary-card";

interface SprintBlockCardProps {
  block: SprintDashboardBlock;
  tasksByListId: Map<string, ClickUpTaskShape[]>;
  loading: boolean;
  onToggleStatus: (taskId: string, newStatus: string) => void;
  statusUpdating: boolean;
  /** Abre o dialog de edit (status / nome / due_date) pra essa task */
  onEditTask?: (task: ClickUpTaskShape) => void;
  /** Story 31.7: abre dialog pra editar manualContext do bloco */
  onEditContext?: (block: SprintDashboardBlock) => void;
}

export function SprintBlockCard({
  block,
  tasksByListId,
  loading,
  onToggleStatus,
  statusUpdating,
  onEditTask,
  onEditContext,
}: SprintBlockCardProps) {
  const [optimisticDone, setOptimisticDone] = useState<Set<string>>(new Set());

  const tasks = useMemo(() => {
    const all: ClickUpTaskShape[] = [];
    for (const listId of block.clickupListIds) {
      const arr = tasksByListId.get(listId) ?? [];
      all.push(...arr);
    }
    return applyFilters(all, block.filters);
  }, [block.clickupListIds, block.filters, tasksByListId]);

  const grouped = useMemo(() => {
    if (!block.groupBy) {
      return [{ key: "all", label: "", tasks }];
    }
    const map = new Map<string, ClickUpTaskShape[]>();
    for (const t of tasks) {
      let key = "—";
      if (block.groupBy === "status") key = t.status;
      else if (block.groupBy === "tag") key = t.tags[0] ?? "(sem tag)";
      else if (block.groupBy === "assignee") {
        key = t.assignees.map((a) => a.name).join(", ") || "(sem responsável)";
      }
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, ts]) => ({ key, label: key, tasks: ts }));
  }, [tasks, block.groupBy]);

  const completedCount = tasks.filter((t) => isDoneStatus(t.status) || optimisticDone.has(t.id)).length;

  // Story 31.7 iter: resumo executivo = manualContext (texto livre) +
  // fases auto-detectadas (tasks com 📢). Ambos coexistem no mesmo card.
  const autoPhases = useMemo(() => extractAutoPhases(tasks), [tasks]);
  const manualText = block.manualContext?.trim() ?? "";
  const hasSummary = manualText.length > 0 || autoPhases.length > 0;

  function handleToggle(task: ClickUpTaskShape) {
    if (statusUpdating) return;
    const currentDone = isDoneStatus(task.status) || optimisticDone.has(task.id);
    // Otimista: marca/desmarca local antes de servidor responder
    setOptimisticDone((prev) => {
      const next = new Set(prev);
      if (currentDone) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
    // Inverte: se done, volta pra "to do"; se !done, vai pra "done"
    const newStatus = currentDone ? "to do" : "done";
    onToggleStatus(task.id, newStatus);
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
          style={{ background: block.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{block.title}</h3>
          <p className="text-[10px] text-muted-foreground">
            {tasks.length} tarefa(s) · {completedCount} concluída(s)
          </p>
        </div>
        {onEditContext && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => onEditContext(block)}
            title="Editar contexto do bloco"
          >
            <Megaphone className="h-3 w-3" />
            Contexto
          </Button>
        )}
      </div>

      {/* Story 31.7 iter — Card resumo: manual + fases auto coexistem */}
      {hasSummary && (
        <BlockSummaryCard
          manualText={manualText}
          phases={autoPhases}
          accentColor={block.color}
        />
      )}

      {/* Tasks */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Sem tarefas neste bloco
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.key} className="space-y-1">
              {g.label && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </p>
              )}
              <div className="space-y-1">
                {g.tasks.map((t) => {
                  const done = isDoneStatus(t.status) || optimisticDone.has(t.id);
                  const dueMs = t.dueDate ? Number(t.dueDate) : null;
                  const dueDate = dueMs && Number.isFinite(dueMs) ? new Date(dueMs) : null;
                  const isOverdue = dueDate && !done && dueDate.getTime() < Date.now();
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-2 py-1 border-b border-border/10 last:border-0 group"
                    >
                      <button
                        onClick={() => handleToggle(t)}
                        disabled={statusUpdating}
                        className="mt-0.5 shrink-0 hover:scale-110 transition-transform disabled:opacity-40"
                        title={done ? "Marcar como aberto" : "Marcar como concluído"}
                      >
                        {done ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/60" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onEditTask?.(t)}
                            className={`text-xs text-left hover:underline decoration-dotted ${done ? "line-through text-muted-foreground" : ""}`}
                            title="Editar status / nome / data"
                          >
                            {t.name}
                          </button>
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            title="Abrir no ClickUp"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: t.statusColor ? `${t.statusColor}22` : "#80808022",
                              color: t.statusColor ?? "#888",
                            }}
                          >
                            {t.status}
                          </span>
                          {dueDate && (
                            <span
                              className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? "text-red-400" : "text-muted-foreground"}`}
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {format(dueDate, "dd/MM", { locale: ptBR })}
                            </span>
                          )}
                          {t.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] px-1 py-0 rounded bg-muted/40 text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
