"use client";

import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { SprintDashboardBlock, SprintCampaignPhase } from "@loyola-x/shared";
import type { ClickUpTaskShape } from "@/lib/hooks/use-sprint-dashboard";
import { PendingTasksList } from "./pending-tasks-list";
import { collectBlockTasks, extractAutoPhases, type AutoPhase } from "./summary-utils";

interface MacroCalendarViewProps {
  blocks: SprintDashboardBlock[];
  tasksByListId: Map<string, ClickUpTaskShape[]>;
}

/**
 * View "Calendário Macro" baseada no guia_campanhas_artifact.html
 * Grid de cards: 1 por bloco com bolinha colorida + título + subtitle + fases.
 * Cada fase tem tag colorida + intervalo de datas + badge de status (derivado da data).
 */
/**
 * Story 31.7 iter — Mapeia AutoPhase (vinda das tasks 📢) pro shape
 * SprintCampaignPhase usado pelo renderizador existente. Permite reusar
 * `PhaseRow` + `derivePhaseState` sem duplicar lógica.
 */
function autoPhasesAsCampaignPhases(autoPhases: AutoPhase[]): SprintCampaignPhase[] {
  return autoPhases.map((p) => ({
    id: p.taskId,
    label: p.label,
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? undefined,
  }));
}

export function MacroCalendarView({ blocks, tasksByListId }: MacroCalendarViewProps) {
  // Story 31.7 iter: cada bloco usa fases do ClickUp (tasks 📢) quando há;
  // senão cai pro campaignPhases configurado manualmente. Cards só aparecem
  // se um dos dois entrega ao menos 1 fase.
  const blocksWithPhases = blocks
    .map((block) => {
      const autoPhases = extractAutoPhases(collectBlockTasks(block, tasksByListId));
      const phases =
        autoPhases.length > 0
          ? autoPhasesAsCampaignPhases(autoPhases)
          : block.campaignPhases ?? [];
      const source = autoPhases.length > 0 ? "auto" : "manual";
      return { block, phases, source };
    })
    .filter((b) => b.phases.length > 0);

  if (blocksWithPhases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Nenhum bloco com fases de campanha.
        </p>
        <p className="text-xs text-muted-foreground">
          Marque tasks no ClickUp com <strong>📢</strong> pra detectar fases automaticamente, ou
          configure manual em <strong>Configurar → editar bloco → Fases da campanha</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {blocksWithPhases.map(({ block, phases, source }) => (
        <CampaignCard
          key={block.id}
          block={block}
          phases={phases}
          source={source as "auto" | "manual"}
          tasksByListId={tasksByListId}
        />
      ))}
    </div>
  );
}

function CampaignCard({
  block,
  phases,
  source,
  tasksByListId,
}: {
  block: SprintDashboardBlock;
  phases: SprintCampaignPhase[];
  source: "auto" | "manual";
  tasksByListId: Map<string, ClickUpTaskShape[]>;
}) {
  const phaseStates = phases.map((p) => derivePhaseState(p));
  const isLive = phaseStates.some((s) => s === "in-progress");

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
          style={{ background: block.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{block.title}</h3>
            {isLive && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">
                ● no ar
              </span>
            )}
            {source === "auto" && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Fases detectadas automaticamente das tasks do ClickUp marcadas com 📢">
                📢 auto
              </span>
            )}
          </div>
          {block.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{block.subtitle}</p>
          )}
        </div>
      </div>

      {/* Fases */}
      <div className="space-y-1.5">
        {phases.map((p, i) => (
          <PhaseRow key={p.id} phase={p} state={phaseStates[i]} blockColor={block.color} />
        ))}
      </div>

      {/* Story 31.7 — Tasks pendentes (atraso + hoje) por campanha */}
      <PendingTasksList block={block} tasksByListId={tasksByListId} />
    </div>
  );
}

function PhaseRow({
  phase,
  state,
  blockColor,
}: {
  phase: SprintCampaignPhase;
  state: PhaseState;
  blockColor: string;
}) {
  const tagColor = phase.color ?? blockColor;
  const dateLabel = formatPhaseDateRange(phase);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
        style={{
          background: `${tagColor}22`,
          color: tagColor,
        }}
      >
        {phase.label}
      </span>
      <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
        {dateLabel}
      </span>
      <StateBadge state={state} />
    </div>
  );
}

type PhaseState = "future" | "in-progress" | "past" | "tbd" | "point-in-future" | "point-in-past";

function derivePhaseState(phase: SprintCampaignPhase): PhaseState {
  const startMs = parseDateMaybe(phase.startDate);
  const endMs = parseDateMaybe(phase.endDate);
  const now = Date.now();

  if (startMs === null) return "tbd"; // "a definir" / texto livre

  if (endMs === null) {
    // Evento pontual (só startDate)
    return startMs < now ? "point-in-past" : "point-in-future";
  }

  if (now < startMs) return "future";
  if (now > endMs + 24 * 60 * 60 * 1000) return "past"; // +1 dia de gracia
  return "in-progress";
}

function parseDateMaybe(s: string | undefined): number | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? d.getTime() : null;
  }
  return null; // texto descritivo
}

function formatPhaseDateRange(phase: SprintCampaignPhase): string {
  const startMs = parseDateMaybe(phase.startDate);
  const endMs = parseDateMaybe(phase.endDate);

  if (startMs === null) {
    return phase.startDate || "—"; // texto descritivo
  }

  const start = new Date(startMs);
  const startLabel = format(start, "dd/MM", { locale: ptBR });

  if (endMs === null) {
    return phase.endDate?.trim()
      ? `${startLabel} · ${phase.endDate}`
      : startLabel;
  }

  const end = new Date(endMs);
  // Se mesmo mês: "14–20/mai", senão "14/mai – 02/jun"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()}/${format(end, "MMM", { locale: ptBR })}`;
  }
  return `${startLabel} – ${format(end, "dd/MM", { locale: ptBR })}`;
}

function StateBadge({ state }: { state: PhaseState }) {
  const map: Record<PhaseState, { label: string; cls: string }> = {
    "in-progress": { label: "no ar", cls: "bg-emerald-500/15 text-emerald-500" },
    "future": { label: "", cls: "" },
    "past": { label: "encerrada", cls: "bg-muted/30 text-muted-foreground" },
    "tbd": { label: "a definir", cls: "bg-muted/30 text-muted-foreground" },
    "point-in-future": { label: "agendado", cls: "bg-blue-500/15 text-blue-500" },
    "point-in-past": { label: "ok", cls: "bg-muted/30 text-muted-foreground" },
  };
  const cfg = map[state];
  if (!cfg.label) return null;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
