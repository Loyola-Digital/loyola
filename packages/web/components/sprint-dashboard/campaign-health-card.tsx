"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SprintDashboardBlock } from "@loyola-x/shared";
import type { ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";
import { collectBlockTasks, getCampaignHealth } from "./summary-utils";

interface CampaignHealthCardProps {
  block: SprintDashboardBlock;
  tasksByListId: Map<string, ClickUpTaskShape[]>;
}

/**
 * Story 31.8 — Saúde da Campanha. Card compacto com 3 stats (atraso / em
 * progresso / done), % de saúde e próxima task. Exclui tasks sem
 * responsável, fases (Campanha) e marcos (Marco).
 */
export function CampaignHealthCard({ block, tasksByListId }: CampaignHealthCardProps) {
  const stats = useMemo(
    () => getCampaignHealth(collectBlockTasks(block, tasksByListId)),
    [block, tasksByListId],
  );

  const healthColor =
    stats.healthPct >= 70
      ? "text-emerald-500"
      : stats.healthPct >= 40
      ? "text-amber-500"
      : "text-red-500";

  return (
    <div
      className="rounded-xl border border-border/40 bg-card/60 p-3 space-y-3"
      style={{ borderLeftWidth: 3, borderLeftColor: block.color }}
    >
      {/* Header: título + saúde % */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold truncate" title={block.title}>
            {block.title}
          </h3>
          {block.subtitle && (
            <p className="text-[10px] text-muted-foreground truncate">{block.subtitle}</p>
          )}
        </div>
        <span className={`text-sm font-bold tabular-nums shrink-0 ${healthColor}`}>
          {stats.healthPct}%
        </span>
      </div>

      {/* Stats: atraso / progress / done */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat
          icon={<AlertTriangle className="h-3 w-3" />}
          value={stats.atraso}
          label="atraso"
          tone="danger"
        />
        <Stat
          icon={<Clock className="h-3 w-3" />}
          value={stats.progress}
          label="progr"
          tone="warn"
        />
        <Stat
          icon={<CheckCircle2 className="h-3 w-3" />}
          value={stats.done}
          label="done"
          tone="success"
        />
      </div>

      {/* Próximo evento */}
      {stats.next && (
        <a
          href={stats.next.url}
          target="_blank"
          rel="noreferrer"
          className="block pt-2 border-t border-border/30 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={stats.next.isOverdue ? "text-red-500 font-medium" : ""}>
            {stats.next.isOverdue ? "Atrasada:" : "Próximo:"}
          </span>{" "}
          {stats.next.dueDateMs && (
            <span className="tabular-nums">
              {format(new Date(stats.next.dueDateMs), "dd/MM", { locale: ptBR })}
            </span>
          )}{" "}
          <span className="text-foreground/80">{truncate(stats.next.name, 60)}</span>
        </a>
      )}
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "danger" | "warn" | "success";
}

function Stat({ icon, value, label, tone }: StatProps) {
  const colorMap = {
    danger: "text-red-500 bg-red-500/10",
    warn: "text-amber-500 bg-amber-500/10",
    success: "text-emerald-500 bg-emerald-500/10",
  };
  return (
    <div className={`rounded-md py-1.5 px-2 flex items-center gap-1.5 ${colorMap[tone]}`}>
      {icon}
      <span className="text-base font-bold tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-wide opacity-80">{label}</span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
