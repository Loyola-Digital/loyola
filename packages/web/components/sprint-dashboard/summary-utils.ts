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

// Story 31.7 iter — Detecção de fase:
// 1. PRIMÁRIO: Task Type custom no ClickUp (customItemId !== null).
//    Lucas usa o tipo "Campanha" no ClickUp pra marcar fases — qualquer task
//    com Task Type custom vira fase automaticamente.
// 2. FALLBACK: emoji 📢/📣 no nome (retrocompat com fluxo antigo).
const SUMMARY_EMOJIS = ["📢", "📣"] as const;

function isCustomTypeNamed(task: ClickUpTaskShape, name: string): boolean {
  return (task.customItemName ?? "").trim().toLowerCase() === name.toLowerCase();
}

function isPhaseTask(task: ClickUpTaskShape): boolean {
  // Task Type "Campanha" — primário (Story 31.7 iter)
  if (isCustomTypeNamed(task, "campanha")) return true;
  // Emoji no nome — fallback retrocompat
  return SUMMARY_EMOJIS.some((e) => task.name.includes(e));
}

/** Story 31.8 — Marco (milestone) é meta visual, não tarefa real. Não conta. */
function isMarcoTask(task: ClickUpTaskShape): boolean {
  return isCustomTypeNamed(task, "marco");
}

/**
 * Story 31.8 — Tasks que entram no cálculo de Saúde da Campanha.
 * Exclui: sem responsável, fases (Campanha), marcos (Marco).
 */
export function shouldCountForHealth(task: ClickUpTaskShape): boolean {
  if (task.assignees.length === 0) return false;
  if (isPhaseTask(task)) return false;
  if (isMarcoTask(task)) return false;
  return true;
}

/**
 * Story 31.8 — Calcula stats de Saúde da Campanha:
 *   atraso   = não-done com due passado
 *   progress = não-done sem due passado (em andamento ou futuro)
 *   done     = concluídas
 *   healthPct = done / (done + progress)  ← fórmula do print do Lucas
 */
export interface CampaignHealthStats {
  done: number;
  progress: number;
  atraso: number;
  healthPct: number;
  /** Próxima task: futuro mais próximo OU atrasada mais antiga (atraso prevalece). */
  next: {
    name: string;
    dueDateMs: number | null;
    isOverdue: boolean;
    url: string;
  } | null;
}

export function getCampaignHealth(
  tasks: ClickUpTaskShape[],
  now: Date = new Date(),
): CampaignHealthStats {
  const startOfTodayMs = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  let done = 0;
  let progress = 0;
  let atraso = 0;
  let earliestOverdue: { task: ClickUpTaskShape; dueMs: number } | null = null;
  let earliestUpcoming: { task: ClickUpTaskShape; dueMs: number } | null = null;

  for (const t of tasks) {
    if (!shouldCountForHealth(t)) continue;
    if (isDoneStatus(t.status)) {
      done += 1;
      continue;
    }
    const dueMs = t.dueDate ? Number(t.dueDate) : null;
    const dueValid = dueMs !== null && Number.isFinite(dueMs);
    if (dueValid && (dueMs as number) < startOfTodayMs) {
      atraso += 1;
      if (!earliestOverdue || (dueMs as number) < earliestOverdue.dueMs) {
        earliestOverdue = { task: t, dueMs: dueMs as number };
      }
    } else {
      progress += 1;
      if (dueValid) {
        if (!earliestUpcoming || (dueMs as number) < earliestUpcoming.dueMs) {
          earliestUpcoming = { task: t, dueMs: dueMs as number };
        }
      }
    }
  }

  const denominador = done + progress;
  const healthPct = denominador > 0 ? Math.round((done / denominador) * 100) : 0;

  const nextSource = earliestOverdue ?? earliestUpcoming;
  const next = nextSource
    ? {
        name: nextSource.task.name,
        dueDateMs: nextSource.dueMs,
        isOverdue: nextSource === earliestOverdue,
        url: nextSource.task.url,
      }
    : null;

  return { done, progress, atraso, healthPct, next };
}

/**
 * Cada task com 📢/📣 representa UMA FASE do lançamento. Datas e status vêm
 * direto do ClickUp; nome da task é o label completo (ex: "[DATA] FASE CAPTAÇÃO").
 */
export interface AutoPhase {
  taskId: string;
  label: string;
  /** ISO YYYY-MM-DD derivado de task.startDate (ms) ou null */
  startDate: string | null;
  /** ISO YYYY-MM-DD derivado de task.dueDate (ms) ou null */
  endDate: string | null;
  status: string;
  statusColor: string | null;
  url: string;
  /** Timestamp ms pra ordenação interna. NÃO exposto na UI. */
  sortKey: number;
}

function msToIsoDate(ms: string | null): string | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pega TODAS as tasks que são fase (Task Type custom OU emoji 📢/📣) e
 * converte em fases ordenadas pelo startDate (fallback dueDate).
 * Story 31.8 — exclui fases sem responsável (Lucas: fase órfã polui o card).
 */
export function extractAutoPhases(tasks: ClickUpTaskShape[]): AutoPhase[] {
  return tasks
    .filter((t) => isPhaseTask(t) && t.assignees.length > 0)
    .map<AutoPhase>((t) => {
      const startMs = t.startDate ? Number(t.startDate) : null;
      const dueMs = t.dueDate ? Number(t.dueDate) : null;
      const sortKey =
        startMs && Number.isFinite(startMs)
          ? startMs
          : dueMs && Number.isFinite(dueMs)
          ? dueMs
          : Number.POSITIVE_INFINITY;
      return {
        taskId: t.id,
        label: t.name,
        startDate: msToIsoDate(t.startDate),
        endDate: msToIsoDate(t.dueDate),
        status: t.status,
        statusColor: t.statusColor,
        url: t.url,
        sortKey,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
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
