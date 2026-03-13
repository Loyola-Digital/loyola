"use client";

import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/tasks/task-card";
import type { DelegatedTask } from "@loyola-x/shared";

interface TaskListProps {
  tasks: DelegatedTask[];
  total: number;
  offset: number;
  limit: number;
  onPageChange: (offset: number) => void;
}

export function TaskList({
  tasks,
  total,
  offset,
  limit,
  onPageChange,
}: TaskListProps) {
  const start = offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      {total > limit && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Mostrando {start}-{end} de {total} tasks
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => onPageChange(Math.max(0, offset - limit))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => onPageChange(offset + limit)}
            >
              Proximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
