"use client";

import { ExternalLink, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AutoPhase } from "./summary-utils";

interface BlockSummaryCardProps {
  /** Texto livre do manualContext. Renderiza no topo. */
  manualText?: string | null;
  /** Fases derivadas das tasks com 📢 (qualquer quantidade, inclusive 0). */
  phases: AutoPhase[];
  accentColor: string;
}

/**
 * Story 31.7 iter — Card resumo: cabeçalho com texto manual (quando há) +
 * lista de fases auto-detectadas no ClickUp (tasks com 📢). Componente esconde
 * automaticamente partes vazias; se nada → não renderiza.
 */
export function BlockSummaryCard({ manualText, phases, accentColor }: BlockSummaryCardProps) {
  const hasManual = !!manualText && manualText.trim().length > 0;
  const hasPhases = phases.length > 0;
  if (!hasManual && !hasPhases) return null;

  return (
    <div
      className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2 relative overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Megaphone className="h-3 w-3" />
        Resumo do lançamento
        {hasManual && (
          <span className="ml-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 normal-case tracking-normal">
            contexto manual
          </span>
        )}
      </div>

      {hasManual && (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
          {manualText}
        </p>
      )}

      {hasPhases && (
        <div className="space-y-1 pt-1">
          {phases.map((p) => (
            <PhaseRow key={p.taskId} phase={p} accentColor={accentColor} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseRow({ phase, accentColor }: { phase: AutoPhase; accentColor: string }) {
  const dateLabel = formatPhaseRange(phase.startDate, phase.endDate);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className="font-medium px-1.5 py-0.5 rounded-full text-[10px] truncate max-w-[60%] shrink-0"
        style={{ background: `${accentColor}22`, color: accentColor }}
        title={phase.label}
      >
        {phase.label}
      </span>
      {dateLabel && (
        <span className="text-muted-foreground flex-1 min-w-0 truncate">{dateLabel}</span>
      )}
      {phase.statusColor ? (
        <span
          className="px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0"
          style={{ background: `${phase.statusColor}22`, color: phase.statusColor }}
        >
          {phase.status}
        </span>
      ) : (
        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0 bg-muted text-muted-foreground">
          {phase.status}
        </span>
      )}
      <a
        href={phase.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label="Abrir task no ClickUp"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function formatPhaseRange(startIso: string | null, endIso: string | null): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (Number.isNaN(dt.getTime())) return iso;
    return format(dt, "d MMM", { locale: ptBR });
  };
  if (startIso && endIso) {
    if (startIso === endIso) return fmt(startIso);
    return `${fmt(startIso)} → ${fmt(endIso)}`;
  }
  if (startIso) return `a partir de ${fmt(startIso)}`;
  if (endIso) return `até ${fmt(endIso)}`;
  return "";
}
