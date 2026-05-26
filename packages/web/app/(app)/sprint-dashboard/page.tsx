"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Settings2, RefreshCw, AlertCircle, AlertTriangle, Clock, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useSprintDashboardConfig,
  useSprintDashboardTasks,
  useSprintDashboardMetrics,
  useUpdateTaskStatus,
  type ClickUpTaskShape,
} from "@/lib/hooks/use-sprint-dashboard";
import { SprintBuilderDialog } from "@/components/sprint-dashboard/sprint-builder-dialog";
import { SprintBlockCard } from "@/components/sprint-dashboard/sprint-block-card";
import { TaskEditDialog } from "@/components/sprint-dashboard/task-edit-dialog";
import { useQueryClient } from "@tanstack/react-query";

export default function SprintDashboardPage() {
  const role = useUserRole();
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ClickUpTaskShape | null>(null);

  const { data: config, isLoading: configLoading } = useSprintDashboardConfig();
  const { data: metrics } = useSprintDashboardMetrics();

  const allListIds = useMemo(() => {
    if (!config) return [];
    return Array.from(new Set(config.blocks.flatMap((b) => b.clickupListIds)));
  }, [config]);

  const { data: tasksData, isLoading: tasksLoading, isFetching } = useSprintDashboardTasks(
    allListIds.length > 0 ? allListIds : null,
  );
  const updateStatus = useUpdateTaskStatus();

  if (role === "guest") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Sprint Dashboard é restrito à equipe interna.
        </p>
      </div>
    );
  }

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-metrics"] });
  }

  const blocks = (config?.blocks ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const tasksByListId = useMemo(() => {
    const m = new Map<string, ClickUpTaskShape[]>();
    for (const t of tasksData?.tasks ?? []) {
      const arr = m.get(t.listId) ?? [];
      arr.push(t);
      m.set(t.listId, arr);
    }
    return m;
  }, [tasksData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Sprint Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada de lançamentos · sincronizado com ClickUp
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setBuilderOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Configurar
          </Button>
        </div>
      </div>

      {/* Métricas — Story 31.6 */}
      <MetricsHeader metrics={metrics} blockCount={blocks.length} activeCount={metrics?.activeProjectsCount} />

      {/* Builder dialog */}
      <SprintBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        currentBlocks={blocks}
      />

      {/* Empty state */}
      {configLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-3">
          <LayoutGrid className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum bloco configurado.
          </p>
          <p className="text-xs text-muted-foreground">
            Clique em <strong>Configurar</strong> pra selecionar listas do ClickUp e montar o dashboard.
          </p>
          <Button size="sm" className="mt-2 gap-1.5" onClick={() => setBuilderOpen(true)}>
            <Settings2 className="h-4 w-4" />
            Configurar agora
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {blocks.map((block) => (
            <SprintBlockCard
              key={block.id}
              block={block}
              tasksByListId={tasksByListId}
              loading={tasksLoading}
              onToggleStatus={(taskId, newStatus) => updateStatus.mutate({ taskId, status: newStatus })}
              statusUpdating={updateStatus.isPending}
              onEditTask={(task) => setEditingTask(task)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog (status + nome + due_date) */}
      <TaskEditDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
      />
    </div>
  );
}

function MetricsHeader({
  metrics,
  blockCount,
  activeCount,
}: {
  metrics: { byFolder: Array<{ folderId: string; folderName: string; total: number; done: number; overdue: number; inProgress: number; upcoming: number; nextDueDate: number | null; nextDueTaskName: string | null }>; activeProjectsCount: number } | undefined;
  blockCount: number;
  activeCount: number | undefined;
}) {
  const folders = metrics?.byFolder ?? [];
  return (
    <div className="space-y-3">
      {/* Resumo geral — 1 linha de 3 cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <MetricCard
          label="Projetos ativos"
          value={String(activeCount ?? "—")}
          sub={`${blockCount} bloco(s) configurado(s)`}
        />
        <MetricCard
          label="Tasks em atraso"
          value={String(folders.reduce((s, f) => s + f.overdue, 0))}
          sub={`${folders.filter((f) => f.overdue > 0).length} lançamento(s) afetado(s)`}
          tone={folders.reduce((s, f) => s + f.overdue, 0) > 0 ? "danger" : "neutral"}
        />
        <MetricCard
          label="Tasks em progresso"
          value={String(folders.reduce((s, f) => s + f.inProgress, 0))}
          sub={`${folders.reduce((s, f) => s + f.done, 0)} concluída(s)`}
        />
      </div>

      {/* Cards por folder/lançamento */}
      {folders.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((f) => (
            <FolderMetricCard key={f.folderId} folder={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "danger";
}) {
  const valueColor = tone === "danger" && value !== "0" ? "text-red-400" : "";
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function FolderMetricCard({
  folder,
}: {
  folder: { folderId: string; folderName: string; total: number; done: number; overdue: number; inProgress: number; upcoming: number; nextDueDate: number | null; nextDueTaskName: string | null };
}) {
  const completionPct = folder.total > 0 ? Math.round((folder.done / folder.total) * 100) : 0;
  const nextDue = folder.nextDueDate ? new Date(folder.nextDueDate) : null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold leading-tight line-clamp-2 flex-1">
          {folder.folderName}
        </h3>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {completionPct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <CounterPill
          icon={<AlertTriangle className="h-2.5 w-2.5" />}
          label="Atraso"
          value={folder.overdue}
          tone="danger"
        />
        <CounterPill
          icon={<Clock className="h-2.5 w-2.5" />}
          label="Progr."
          value={folder.inProgress}
          tone="warning"
        />
        <CounterPill
          icon={<Check className="h-2.5 w-2.5" />}
          label="Done"
          value={folder.done}
          tone="success"
        />
      </div>

      {nextDue && folder.nextDueTaskName && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/20">
          Próximo: <span className="font-medium">{format(nextDue, "dd/MM", { locale: ptBR })}</span>{" "}
          <span className="opacity-70">· {folder.nextDueTaskName}</span>
        </div>
      )}
    </div>
  );
}

function CounterPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "danger" | "warning" | "success";
}) {
  const colorClass =
    value === 0
      ? "text-muted-foreground/60"
      : tone === "danger"
        ? "text-red-400"
        : tone === "warning"
          ? "text-amber-400"
          : "text-emerald-500";
  return (
    <div className="flex flex-col items-center justify-center py-1 rounded bg-muted/20">
      <span className={`flex items-center gap-0.5 text-[14px] font-bold tabular-nums ${colorClass}`}>
        {icon}
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
