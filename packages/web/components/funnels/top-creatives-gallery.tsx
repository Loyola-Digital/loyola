"use client";

import { useState } from "react";
import { Play, ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTopPerformers,
  type TopPerformerMetric,
  type TopPerformerAd,
} from "@/lib/hooks/use-traffic-analytics";

function fmtCurrency(val: number | null): string {
  if (val === null || val === 0) return "—";
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

function fmtNumber(val: number | null): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)}%`;
}

function fmtRoas(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)}x`;
}

const METRIC_OPTIONS: { value: TopPerformerMetric; label: string; sortLabel: string }[] = [
  { value: "roas", label: "ROAS", sortLabel: "Maior ROAS" },
  { value: "cpl", label: "CPL", sortLabel: "Menor CPL" },
  { value: "cplQualified", label: "CPL Qual", sortLabel: "Menor CPL Qualificado" },
  { value: "leads", label: "Leads", sortLabel: "Mais Leads" },
  { value: "sales", label: "Vendas", sortLabel: "Mais Vendas" },
  { value: "ctr", label: "CTR", sortLabel: "Maior CTR" },
];

const RANK_STYLES = [
  "ring-2 ring-yellow-500/60",
  "ring-1 ring-gray-400/40",
  "ring-1 ring-amber-600/30",
  "",
  "",
];

function formatMetricValue(ad: TopPerformerAd, metric: TopPerformerMetric): string {
  switch (metric) {
    case "roas": return fmtRoas(ad.roas);
    case "cpl": return fmtCurrency(ad.cpl);
    case "cplQualified": return fmtCurrency(ad.cplQualified);
    case "leads": return fmtNumber(ad.leads);
    case "sales": return fmtNumber(ad.sales);
    case "ctr": return fmtPercent(ad.ctr);
    default: return "—";
  }
}

interface TopCreativesGalleryProps {
  projectId: string;
  days: number;
  campaignIds?: string[];
}

export function TopCreativesGallery({ projectId, days, campaignIds }: TopCreativesGalleryProps) {
  const [metric, setMetric] = useState<TopPerformerMetric>("ctr");
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useTopPerformers(projectId, metric, 10, days, campaignIds?.[0] ?? null);

  if (isLoading) return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );

  if (!data || data.topPerformers.length === 0) return null;

  const withCreatives = data.topPerformers.filter((ad) => ad.creative?.thumbnailUrl);
  if (withCreatives.length === 0) return null;

  const shown = expanded ? withCreatives : withCreatives.slice(0, 6);
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;
  const medals = ["🥇", "🥈", "🥉", "4.", "5.", "6.", "7.", "8.", "9.", "10."];

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Top Criativos — {metricLabel}</h3>
          <p className="text-[11px] text-muted-foreground">{withCreatives.length} criativos com preview</p>
        </div>
        <Select value={metric} onValueChange={(v) => setMetric(v as TopPerformerMetric)}>
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
        {shown.map((ad, i) => (
          <div
            key={ad.campaignId}
            className={`group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md ${RANK_STYLES[i] ?? ""}`}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted/30">
              <img
                src={ad.creative!.thumbnailUrl!}
                alt={ad.campaignName}
                className="w-full h-full object-cover"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div>
                      <p className="opacity-60">Spend</p>
                      <p className="font-semibold">{fmtCurrency(ad.spend)}</p>
                    </div>
                    <div>
                      <p className="opacity-60">CTR</p>
                      <p className="font-semibold">{fmtPercent(ad.ctr)}</p>
                    </div>
                    <div>
                      <p className="opacity-60">CPC</p>
                      <p className="font-semibold">{fmtCurrency(ad.cpc)}</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Type badge */}
              <div className="absolute top-1.5 left-1.5">
                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-black/50 text-white border-white/20 backdrop-blur-sm">
                  {ad.creative?.objectType === "VIDEO" ? "Video" : ad.creative?.objectType === "CAROUSEL" ? "Carousel" : "Imagem"}
                </Badge>
              </div>
              {/* Play icon */}
              {ad.creative?.objectType === "VIDEO" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-full bg-black/40 p-2 group-hover:bg-black/60 transition-colors">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                </div>
              )}
              {/* Rank */}
              <div className="absolute top-1.5 right-1.5">
                <span className="text-[10px] font-bold bg-black/50 text-white rounded px-1.5 py-0.5 backdrop-blur-sm">
                  {medals[i] ?? `${i + 1}.`}
                </span>
              </div>
            </div>
            {/* Info */}
            <div className="p-2.5 space-y-1">
              <p className="text-[11px] font-medium truncate" title={ad.campaignName}>{ad.campaignName}</p>
              <p className="text-lg font-bold tracking-tight">{formatMetricValue(ad, metric)}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{fmtNumber(ad.impressions)} impr</span>
                <span>{fmtNumber(ad.clicks)} clicks</span>
                <span>{fmtNumber(ad.reach)} reach</span>
              </div>
              <p className="text-[9px] text-muted-foreground truncate">
                {ad.parentCampaignName} &rsaquo; {ad.adsetName}
              </p>
            </div>
          </div>
        ))}
      </div>

      {withCreatives.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${withCreatives.length})`}
        </button>
      )}
    </div>
  );
}
