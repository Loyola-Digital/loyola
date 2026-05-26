"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateTask, useListStatuses, type ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";

interface TaskEditDialogProps {
  task: ClickUpTaskShape | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function dueDateToInputValue(dueDate: string | null): string {
  if (!dueDate) return "";
  const ms = Number(dueDate);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  // <input type="date"> espera YYYY-MM-DD em horário local
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputValueToUnixMs(value: string): number | null {
  if (!value) return null;
  // YYYY-MM-DD → meia-noite local → unix ms
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

export function TaskEditDialog({ task, open, onOpenChange }: TaskEditDialogProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");

  const updateTask = useUpdateTask();
  const { data: statusesData, isLoading: statusesLoading } = useListStatuses(
    task?.listId ?? null,
  );
  const availableStatuses = statusesData?.statuses ?? [];

  // Hidrata o form quando abre/troca task
  useEffect(() => {
    if (task && open) {
      setName(task.name);
      setStatus(task.status);
      setDueDateInput(dueDateToInputValue(task.dueDate));
    }
  }, [task, open]);

  if (!task) return null;

  const nameChanged = name.trim() !== task.name;
  const statusChanged = status !== task.status;
  const originalDueInput = dueDateToInputValue(task.dueDate);
  const dueChanged = dueDateInput !== originalDueInput;
  const hasChanges = nameChanged || statusChanged || dueChanged;

  function handleSave() {
    if (!task || !hasChanges) return;
    const payload: { taskId: string; status?: string; name?: string; dueDate?: number | null } = {
      taskId: task.id,
    };
    if (nameChanged) payload.name = name.trim();
    if (statusChanged) payload.status = status;
    if (dueChanged) {
      payload.dueDate = dueDateInput ? inputValueToUnixMs(dueDateInput) : null;
    }
    updateTask.mutate(payload, {
      onSuccess: () => {
        toast.success("Task atualizada no ClickUp");
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
    });
  }

  function clearDueDate() {
    setDueDateInput("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex-1">Editar task</span>
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Abrir no ClickUp"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Nome */}
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            {statusesLoading ? (
              <div className="text-xs text-muted-foreground">Carregando statuses...</div>
            ) : availableStatuses.length === 0 ? (
              <Input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-sm"
                placeholder="Status (texto livre)"
              />
            ) : (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStatuses.map((s) => (
                    <SelectItem key={s.status} value={s.status}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: s.color }}
                        />
                        {s.status}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Due date */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Data de entrega
            </Label>
            <div className="flex gap-1">
              <Input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
                className="text-sm flex-1"
              />
              {dueDateInput && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDueDate}
                  className="h-9 w-9 p-0 text-red-500 hover:text-red-600"
                  title="Remover data"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Tags read-only (info) */}
          {task.tags.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tags (somente leitura)</Label>
              <div className="flex flex-wrap gap-1">
                {task.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assignees read-only */}
          {task.assignees.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Responsáveis (somente leitura)</Label>
              <div className="text-xs text-muted-foreground">
                {task.assignees.map((a) => a.name).join(", ")}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
            Lista: <strong>{task.listName}</strong>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || updateTask.isPending}>
            {updateTask.isPending ? "Salvando..." : "Salvar no ClickUp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
