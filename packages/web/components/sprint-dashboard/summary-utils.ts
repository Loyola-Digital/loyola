/**
 * Story 31.7 — Helpers compartilhados entre SprintBlockCard (Visão Geral) e
 * CampaignCard (Calendário Macro).
 */

import type { SprintDashboardBlock } from "@loyola-x/shared";
import type { ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";

// Estados de "done" no ClickUp — variações usadas pelos times Loyola.
const DONE_STATUSES = new Set([
  "done",
  "closed",
  "concluído",
  "concluido",
  "complete",
  "completed",
]);

export function isDoneStatus(s: string): boolean {
  return DONE_STATUSES.has(s.toLowerCase());
}

/** Aplica statuses/tags/assigneeIds do bloco em cima de um array de tasks. */
export function applyFilters(
  tasks: ClickUpTaskShape[],
  filters: SprintDashboardBlock["filters"],
): ClickUpTaskShape[] {
  return tasks.filter((t) => {
    if (filters.statuses && filters.statuses.length > 0) {
      if (!filters.statuses.includes(t.status)) return false;
    }
    if (filters.tags && filters.tags.length > 0) {
      const has = t.tags.some((tag) => filters.tags!.includes(tag));
      if (!has) return false;
    }
    if (filters.assigneeIds && filters.assigneeIds.length > 0) {
      const has = t.assignees.some(
        (a) => a.id !== null && filters.assigneeIds!.includes(String(a.id)),
      );
      if (!has) return false;
    }
    return true;
  });
}

// Story 31.7 — emojis-gatilho do card resumo. Match no nome da task.
const SUMMARY_EMOJIS = ["📢", "📣"] as const;

export interface AutoSummary {
  taskId: string;
  name: string;
  url: string;
  dueDate: string | null;
}

/** Pega a primeira task cujo nome contém 📢/📣, ordenada por dueDate ASC. */
export function extractAutoSummary(tasks: ClickUpTaskShape[]): AutoSummary | null {
  const candidates = tasks
    .filter((t) => SUMMARY_EMOJIS.some((e) => t.name.includes(e)))
    .sort((a, b) => {
      const da = a.dueDate ? Number(a.dueDate) : Number.POSITIVE_INFINITY;
      const db = b.dueDate ? Number(b.dueDate) : Number.POSITIVE_INFINITY;
      return da - db;
    });
  const first = candidates[0];
  if (!first) return null;
  return {
    taskId: first.id,
    name: first.name,
    url: first.url,
    dueDate: first.dueDate,
  };
}

/** Junta tasks de todas as listas do bloco e aplica filtros. */
export function collectBlockTasks(
  block: SprintDashboardBlock,
  tasksByListId: Map<string, ClickUpTaskShape[]>,
): ClickUpTaskShape[] {
  const all: ClickUpTaskShape[] = [];
  for (const listId of block.clickupListIds) {
    const arr = tasksByListId.get(listId) ?? [];
    all.push(...arr);
  }
  return applyFilters(all, block.filters);
}

/**
 * Story 31.7 — Tasks "pendentes": NÃO done + dueDate parseável + dueDate <= fim
 * do dia de hoje. Ordena por dueDate ASC (vencidas há mais tempo primeiro).
 */
export interface PendingTask {
  task: ClickUpTaskShape;
  dueDateMs: number;
  isOverdue: boolean;
  isToday: boolean;
}

export function getPendingTasks(
  tasks: ClickUpTaskShape[],
  now: Date = new Date(),
): PendingTask[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const out: PendingTask[] = [];
  for (const task of tasks) {
    if (isDoneStatus(task.status)) continue;
    if (!task.dueDate) continue;
    const dueMs = Number(task.dueDate);
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs > endOfToday.getTime()) continue;
    const dueDate = new Date(dueMs);
    const isToday =
      dueDate.getTime() >= startOfToday.getTime() &&
      dueDate.getTime() <= endOfToday.getTime();
    const isOverdue = !isToday && dueDate.getTime() < startOfToday.getTime();
    out.push({ task, dueDateMs: dueMs, isOverdue, isToday });
  }
  out.sort((a, b) => a.dueDateMs - b.dueDateMs);
  return out;
}

/** Formata diferença pra português curto: "Hoje", "Ontem", "Há N dias". */
export function formatRelativeDue(dueMs: number, now: Date = new Date()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const due = new Date(dueMs);
  const startOfDue = new Date(due);
  startOfDue.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDue.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1) return `Há ${diffDays} dias`;
  if (diffDays === -1) return "Amanhã";
  return `Em ${Math.abs(diffDays)} dias`;
}
