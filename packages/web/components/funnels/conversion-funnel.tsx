"use client";

import { cn } from "@/lib/utils";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface ConversionFunnelProps {
  impressions: number;
  reach: number | null;
  linkClicks: number | null;
  landingPageViews: number | null;
  leads: number | null;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function conversionRate(from: number, to: number): string {
  if (from === 0) return "0%";
  return `${((to / from) * 100).toFixed(1)}%`;
}

export function ConversionFunnel({ impressions, reach, linkClicks, landingPageViews, leads }: ConversionFunnelProps) {
  const stages: FunnelStage[] = [
    { label: "Impressões", value: impressions, color: "bg-blue-500/70" },
  ];

  if (reach !== null && reach > 0) {
    stages.push({ label: "Alcance", value: reach, color: "bg-blue-400/70" });
  }
  if (linkClicks !== null && linkClicks > 0) {
    stages.push({ label: "Cliques no Link", value: linkClicks, color: "bg-amber-500/70" });
  }
  if (landingPageViews !== null && landingPageViews > 0) {
    stages.push({ label: "Visualização da LP", value: landingPageViews, color: "bg-amber-400/70" });
  }
  if (leads !== null && leads > 0) {
    stages.push({ label: "Leads", value: leads, color: "bg-emerald-500/70" });
  }

  const maxValue = stages[0]?.value || 1;

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const widthPercent = Math.max((stage.value / maxValue) * 100, 8);
        const prevStage = i > 0 ? stages[i - 1] : null;

        return (
          <div key={stage.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stage.label}</span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{fmtNumber(stage.value)}</span>
                {prevStage && (
                  <span className="text-xs text-muted-foreground">
                    ({conversionRate(prevStage.value, stage.value)})
                  </span>
                )}
              </div>
            </div>
            <div className="h-8 w-full rounded-md bg-muted/30 overflow-hidden">
              <div
                className={cn("h-full rounded-md transition-all", stage.color)}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
