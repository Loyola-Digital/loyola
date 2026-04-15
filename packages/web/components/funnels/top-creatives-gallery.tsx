"use client";

import { useState, useEffect } from "react";
import { Play, ChevronLeft, ChevronRight, X, ExternalLink, Maximize2 } from "lucide-react";
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
  useVideoSource,
  type TopPerformerMetric,
  type TopPerformerAd,
  type MetaAdCreative,
  type VideoMetrics,
} from "@/lib/hooks/use-traffic-analytics";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  enrichFormulaForEntity,
} from "@/lib/formulas/funnels";
import type { MetricFormula } from "@/lib/types/metric-formula";

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

function creativeImgSrc(c: MetaAdCreative | null): string {
  return c?.imageUrl || c?.thumbnailUrl || "";
}

// ============================================================
// LIGHTBOX
// ============================================================

interface LightboxItem {
  id: string;
  name: string;
  creative: MetaAdCreative;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach: number;
  videoMetrics?: VideoMetrics | null;
  parentInfo?: string;
}

function CreativeLightbox({ items, initialIndex, projectId, onClose, funnelContext }: {
  items: LightboxItem[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
  funnelContext?: { days: number; funnelType?: "launch" | "perpetual"; funnelName?: string };
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  const isVideo = item.creative.objectType === "VIDEO";

  const { data: videoData } = useVideoSource(
    isVideo ? projectId : null,
    isVideo ? item.creative.videoId : null,
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + items.length) % items.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % items.length);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items.length, onClose]);

  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const next = () => setIndex((i) => (i + 1) % items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full m-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {item.creative.objectType === "VIDEO" ? "Video" : item.creative.objectType === "CAROUSEL" ? "Carousel" : "Imagem"}
            </Badge>
            <span className="text-sm font-medium truncate">{item.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{index + 1} / {items.length}</span>
            <a
              href={creativeImgSrc(item.creative)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Abrir imagem original"
              onClick={(e) => e.stopPropagation()}
            >
              <Maximize2 className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Media */}
        <div className="relative bg-black min-h-[300px] max-h-[60vh] flex items-center justify-center overflow-hidden">
          {isVideo && videoData?.sourceUrl ? (
            <video
              key={videoData.sourceUrl}
              src={videoData.sourceUrl}
              controls
              autoPlay
              className="w-full max-h-[60vh] object-contain"
              poster={creativeImgSrc(item.creative)}
            />
          ) : isVideo && videoData?.embedHtml ? (
            <iframe
              src={(() => {
                const match = videoData.embedHtml.match(/src="([^"]+)"/);
                return match ? match[1].replace(/&amp;/g, "&") + "&autoplay=1" : "";
              })()}
              className="w-full h-[60vh] border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : isVideo && videoData?.permalinkUrl ? (
            <div className="text-center p-8">
              <img
                src={videoData.picture || creativeImgSrc(item.creative)}
                alt={item.name}
                className="max-h-[40vh] object-contain mx-auto rounded-lg mb-4"
              />
              <a
                href={videoData.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Play className="h-4 w-4" /> Assistir no Facebook
              </a>
            </div>
          ) : !isVideo ? (
            <img
              src={creativeImgSrc(item.creative)}
              alt={item.name}
              className="w-full max-h-[60vh] object-contain"
            />
          ) : (
            <div className="flex items-center justify-center p-8">
              <Play className="h-10 w-10 text-white opacity-60" />
            </div>
          )}

          {isVideo && !videoData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Play className="h-10 w-10 mx-auto mb-2 opacity-60" />
                <p className="text-xs opacity-80">Carregando vídeo...</p>
              </div>
            </div>
          )}

          {items.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-3 shrink-0 overflow-y-auto">
          {(() => {
            const formulas = buildAdFormulas(
              { spend: item.spend, ctr: item.ctr, cpc: item.cpc, impressions: item.impressions, clicks: item.clicks, campaignName: item.name },
              funnelContext,
            );
            const cells: Array<{ label: string; value: string; formula: MetricFormula | undefined }> = [
              { label: "Spend", value: fmtCurrency(item.spend), formula: formulas.spend },
              { label: "Impressões", value: fmtNumber(item.impressions), formula: formulas.impressions },
              { label: "Cliques", value: fmtNumber(item.clicks), formula: formulas.clicks },
              { label: "CTR", value: fmtPercent(item.ctr), formula: formulas.ctr },
              { label: "CPC", value: fmtCurrency(item.cpc), formula: formulas.cpc },
            ];
            return (
              <div className="grid grid-cols-5 gap-3">
                {cells.map((m) => (
                  <MetricTooltip key={m.label} label={m.label} value={m.value} formula={m.formula}>
                    <div className="text-center cursor-help">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className={`text-sm font-semibold ${m.formula ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{m.value}</p>
                    </div>
                  </MetricTooltip>
                ))}
              </div>
            );
          })()}

          {item.creative.title && <p className="text-sm font-medium">{item.creative.title}</p>}
          {item.creative.body && <p className="text-xs text-muted-foreground line-clamp-3">{item.creative.body}</p>}

          {item.creative.linkUrl && (
            <a
              href={item.creative.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {(() => {
                try {
                  const u = new URL(item.creative.linkUrl);
                  return u.hostname + (u.pathname.length > 1 ? u.pathname.split("/").slice(0, 3).join("/") : "");
                } catch { return item.creative.linkUrl; }
              })()}
            </a>
          )}

          {item.parentInfo && (
            <p className="text-[10px] text-muted-foreground">{item.parentInfo}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GALLERY
// ============================================================

interface TopCreativesGalleryProps {
  projectId: string;
  days: number;
  campaignIds?: string[];
  funnelContext?: { days: number; funnelType?: "launch" | "perpetual"; funnelName?: string };
}

function buildAdFormulas(ad: { spend: number; ctr: number; cpc: number; impressions?: number; clicks?: number; campaignName: string }, f?: { days: number; funnelType?: "launch" | "perpetual"; funnelName?: string }) {
  const funnel = f ?? { days: 30 };
  const path = { ad: ad.campaignName };
  const impressionsFormula: MetricFormula | undefined = ad.impressions != null ? {
    expression: "Σ impressions do criativo",
    values: [{ label: "Impressões", value: ad.impressions, source: "Meta Ads API · impressions" }],
    result: new Intl.NumberFormat("pt-BR").format(ad.impressions),
  } : undefined;
  const clicksFormula: MetricFormula | undefined = ad.clicks != null ? {
    expression: "Σ clicks do criativo",
    values: [{ label: "Cliques", value: ad.clicks, source: "Meta Ads API · clicks" }],
    result: new Intl.NumberFormat("pt-BR").format(ad.clicks),
  } : undefined;
  return {
    spend: enrichFormulaForEntity(buildFunnelSpendFormula(ad.spend, funnel), path),
    ctr: enrichFormulaForEntity(buildFunnelCtrFormula(ad.ctr, funnel), path),
    cpc: enrichFormulaForEntity(buildFunnelCpcFormula(ad.cpc, funnel), path),
    impressions: enrichFormulaForEntity(impressionsFormula, path),
    clicks: enrichFormulaForEntity(clicksFormula, path),
  };
}

export function TopCreativesGallery({ projectId, days, campaignIds, funnelContext }: TopCreativesGalleryProps) {
  const [metric, setMetric] = useState<TopPerformerMetric>("ctr");
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data, isLoading } = useTopPerformers(projectId, metric, 20, days, campaignIds?.[0] ?? null);

  if (isLoading) return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <Skeleton className="h-5 w-48" />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );

  if (!data || data.topPerformers.length === 0) return null;

  const withCreatives = data.topPerformers.filter((ad) => ad.creative?.imageUrl || ad.creative?.thumbnailUrl);
  if (withCreatives.length === 0) return null;

  const shown = expanded ? withCreatives : withCreatives.slice(0, 8);
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;

  const lightboxItems: LightboxItem[] = withCreatives.map((ad) => ({
    id: ad.campaignId,
    name: ad.campaignName,
    creative: ad.creative!,
    spend: ad.spend,
    impressions: ad.impressions,
    clicks: ad.clicks,
    ctr: ad.ctr,
    cpc: ad.cpc,
    reach: ad.reach,
    videoMetrics: ad.videoMetrics,
    parentInfo: `${ad.parentCampaignName} › ${ad.adsetName}`,
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
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

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((ad, i) => (
          <div
            key={ad.campaignId}
            className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md cursor-pointer"
            onClick={() => setLightboxIndex(i)}
          >
            <div className="relative aspect-video bg-muted/30">
              <img
                src={creativeImgSrc(ad.creative)}
                alt={ad.campaignName}
                className="w-full h-full object-cover"
              />
              {/* Hover overlay */}
              {(() => {
                const formulas = buildAdFormulas(ad, funnelContext);
                return (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <MetricTooltip label="Spend" value={fmtCurrency(ad.spend)} formula={formulas.spend}>
                          <div onClick={(e) => e.stopPropagation()} className="cursor-help">
                            <p className="opacity-60">Spend</p>
                            <p className="font-semibold underline decoration-dotted decoration-white/40 underline-offset-4">{fmtCurrency(ad.spend)}</p>
                          </div>
                        </MetricTooltip>
                        <MetricTooltip label="CTR" value={fmtPercent(ad.ctr)} formula={formulas.ctr}>
                          <div onClick={(e) => e.stopPropagation()} className="cursor-help">
                            <p className="opacity-60">CTR</p>
                            <p className="font-semibold underline decoration-dotted decoration-white/40 underline-offset-4">{fmtPercent(ad.ctr)}</p>
                          </div>
                        </MetricTooltip>
                        <MetricTooltip label="CPC" value={fmtCurrency(ad.cpc)} formula={formulas.cpc}>
                          <div onClick={(e) => e.stopPropagation()} className="cursor-help">
                            <p className="opacity-60">CPC</p>
                            <p className="font-semibold underline decoration-dotted decoration-white/40 underline-offset-4">{fmtCurrency(ad.cpc)}</p>
                          </div>
                        </MetricTooltip>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
              {/* Rank + open in new tab */}
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                <a
                  href={creativeImgSrc(ad.creative)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/50 p-1 text-white hover:bg-black/70 backdrop-blur-sm"
                  title="Abrir em nova guia"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-[10px] font-bold bg-black/50 text-white rounded px-1.5 py-0.5 backdrop-blur-sm">
                  #{i + 1}
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
            </div>
          </div>
        ))}
      </div>

      {withCreatives.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${withCreatives.length})`}
        </button>
      )}

      {lightboxIndex !== null && (
        <CreativeLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          projectId={projectId}
          onClose={() => setLightboxIndex(null)}
          funnelContext={funnelContext}
        />
      )}
    </div>
  );
}
