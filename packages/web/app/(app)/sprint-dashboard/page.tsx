"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Settings2, RefreshCw, Calendar, AlertCircle } from "lucide-react";
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
import { useQueryClient } from "@tanstack/react-query";

export default function SprintDashboardPage() {
  const role = useUserRole();
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsHeader({
  metrics,
  blockCount,
  activeCount,
}: {
  metrics: { upcomingEvents: Array<{ taskId: string; name: string; dueDate: string; status: string; listName: string; url: string }>; activeProjectsCount: number } | undefined;
  blockCount: number;
  activeCount: number | undefined;
}) {
  const upcoming = (metrics?.upcomingEvents ?? []).slice(0, 5);
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
      <MetricCard label="Projetos ativos" value={String(activeCount ?? "—")} sub={`${blockCount} bloco(s) configurado(s)`} />
      {upcoming.map((e) => {
        const ms = Number(e.dueDate);
        const date = Number.isFinite(ms) ? new Date(ms) : null;
        return (
          <a
            key={e.taskId}
            href={e.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border/40 bg-card/60 p-3 hover:border-border transition-colors"
          >
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              <span className="truncate">{e.listName}</span>
            </div>
            <div className="text-[15px] font-semibold tabular-nums">
              {date ? format(date, "dd/MM", { locale: ptBR }) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
              {e.name}
            </div>
          </a>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
