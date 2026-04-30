"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Compass } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLeadScoringOrigins,
  type BandOriginBreakdown,
  type DimensionCount,
} from "@/lib/hooks/use-lead-scoring";

interface LeadOriginsByBandProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

const BAND_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-amber-500",
  D: "bg-red-500",
};

const BAND_TEXT: Record<string, string> = {
  A: "text-emerald-700 dark:text-emerald-300",
  B: "text-blue-700 dark:text-blue-300",
  C: "text-amber-700 dark:text-amber-300",
  D: "text-red-700 dark:text-red-300",
};

export function LeadOriginsByBand({ projectId, funnelId, stageId }: LeadOriginsByBandProps) {
  const { data, isLoading } = useLeadScoringOrigins(projectId, funnelId, stageId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!data || data.semDados) return null;

  const bands = Object.values(data.byBand);
  if (bands.length === 0) return null;

  // Filtrar só bandas que têm pelo menos 1 lead com utm_term
  const withData = bands.filter((b) => b.total > 0);
  if (withData.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">De onde vêm os leads (por banda)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Origem extraída do <code className="font-mono text-[10px] bg-muted/50 px-1 rounded">utm_term</code> da planilha de pesquisa.
        Banda A expandida por padrão — clique nas outras pra ver detalhes.
      </p>

      <div className="space-y-2">
        {withData.map((band, idx) => (
          <BandSection key={band.bandId} band={band} defaultOpen={band.bandId === "A" || idx === 0} />
        ))}
      </div>
    </div>
  );
}

function BandSection({
  band,
  defaultOpen,
}: {
  band: BandOriginBreakdown;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = BAND_COLORS[band.bandId] ?? "bg-muted";
  const textColor = BAND_TEXT[band.bandId] ?? "text-foreground";

  return (
    <div className="rounded-md border border-border/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${color} text-white text-xs font-bold`}>
          {band.bandId}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${textColor}`}>Banda {band.bandId}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{band.bandDescription}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {band.total} {band.total === 1 ? "lead" : "leads"}
          {band.withoutTerm > 0 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">({band.withoutTerm} sem term)</span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/30 p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DimensionCard title="Placement" items={band.byPlacement} />
            <DimensionCard title="Temperatura" items={band.byTemperatura} colorize />
            <DimensionCard title="Estratégia" items={band.byEstrategia} />
            <DimensionCard title="Criativo" items={band.byCriativo} />
          </div>

          {band.topUtmTerms.length > 0 && (
            <div className="border-t border-border/30 pt-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Top 20 utm_terms
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {band.topUtmTerms.map((t) => (
                  <div key={t.name} className="flex items-start gap-2 text-[11px]">
                    <span className="font-semibold tabular-nums shrink-0 w-6 text-right">{t.count}</span>
                    <span className="font-mono text-muted-foreground break-all">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DimensionCard({
  title,
  items,
  colorize = false,
}: {
  title: string;
  items: DimensionCount[];
  colorize?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/20 bg-muted/10 p-2 space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground italic">não detectado</p>
      </div>
    );
  }

  const total = items.reduce((s, x) => s + x.count, 0);

  return (
    <div className="rounded-md border border-border/20 bg-muted/10 p-2 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-0.5">
        {items.slice(0, 8).map((item) => {
          const pct = total > 0 ? (item.count / total) * 100 : 0;
          const colorCls = colorize
            ? item.name === "hot"
              ? "text-red-600 dark:text-red-400"
              : item.name === "cold"
                ? "text-blue-600 dark:text-blue-400"
                : "text-foreground"
            : "text-foreground";
          return (
            <div key={item.name} className="flex items-center gap-1.5 text-[11px]">
              <span className={`flex-1 truncate font-medium ${colorCls}`}>{item.name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {item.count} ({pct.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
