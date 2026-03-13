"use client";

import { useState } from "react";
import { CheckSquare } from "lucide-react";
import { useTasks } from "@/lib/hooks/use-tasks";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@loyola-x/shared";

const STATUS_FILTERS: Array<{ label: string; value: TaskStatus | "all" }> = [
  { label: "Todas", value: "all" },
  { label: "Pendentes", value: "pending" },
  { label: "Abertas", value: "open" },
  { label: "Em progresso", value: "in_progress" },
  { label: "Revisao", value: "review" },
  { label: "Concluidas", value: "done" },
  { label: "Canceladas", value: "cancelled" },
];

const LIMIT = 20;

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [offset, setOffset] = useState(0);

  const { tasks, total, isLoading } = useTasks({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: LIMIT,
    offset,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <CheckSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Tarefas</h1>
        <Badge variant="secondary" className="ml-auto">
          {total}
        </Badge>
      </header>

      <div className="flex gap-2 overflow-x-auto px-6 py-3 border-b">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => {
              setStatusFilter(filter.value);
              setOffset(0);
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma tarefa encontrada
            </p>
          </div>
        ) : (
          <TaskList
            tasks={tasks}
            total={total}
            offset={offset}
            limit={LIMIT}
            onPageChange={setOffset}
          />
        )}
      </div>
    </div>
  );
}
