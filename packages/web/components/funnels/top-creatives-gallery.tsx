"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Maximize2,
  AlertTriangle,
  ImageOff,
} from "lucide-react";
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
  type MetaAdCreative,
} from "@/lib/hooks/use-traffic-analytics";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelCtrFormula,
  buildFunnelCplFormula,
  enrichFormulaForEntity,
} from "@/lib/formulas/funnels";
import type { MetricFormula } from "@/lib/types/metric-formula";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import {
  aggregateCreativesByName,
  enrichWithPaidLeads,
  mergeSurveyForGroup,
  type AggregatedCreative,
} from "@/lib/utils/top-creatives";
import type { SurveyDataByAdId } from "@/lib/hooks/use-survey-aggregation";
import { useCreativeRevenue } from "@/lib/hooks/use-creative-revenue";

// ============================================================
// Tipos locais e formatters
// ============================================================

type LocalMetric = "cpl" | "cplQualified" | "leads" | "ctr";

interface MetricOption {
  value: LocalMetric;
  label: string;
  sortLabel: string;
  needsReview?: boolean;
}

const METRIC_OPTIONS: MetricOption[] = [
  { value: "cpl", label: "CPL", sortLabel: "Menor CPL" },
  { value: "cplQualified", label: "CPL Qual", sortLabel: "Menor CPL Qualificado", needsReview: true },
  { value: "leads", label: "Leads", sortLabel: "Mais Leads" },
  { value: "ctr", label: "CTR", sortLabel: "Maior CTR" },
];

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

function creativeImgSrc(c: MetaAdCreative | null): string {
  return c?.imageUrl || c?.thumbnailUrl || "";
}

/** True quando não há imageUrl HD e estamos caindo em thumbnail_url low-res. */
function isLowResFallback(c: MetaAdCreative | null): boolean {
  return !c?.imageUrl && !!c?.thumbnailUrl;
}

/**
 * Thumbnail resiliente a URLs do Meta Ads que já expiraram/404. Se a imagem
 * falha ao carregar, renderiza um placeholder com ícone em vez de um quadrado
 * quebrado. Usa `key={src}` pra re-tentar quando a URL muda entre itens.
 *
 * Story 21.7 follow-up: quando só há thumbnail (low-res do Meta, ~128px),
 * renderiza a versão com `image-rendering: auto` e blur sutil pra disfarçar
 * a pixelização em vez de esticar áspero.
 */
function CreativeThumbnail({
  src,
  alt,
  className,
  isLowRes = false,
}: {
  src: string;
  alt: string;
  className: string;
  isLowRes?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Reset fallback quando a src muda (ex: lightbox navegando entre itens)
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted/30`}>
        <ImageOff className="h-6 w-6 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      style={isLowRes ? { imageRendering: "auto", filter: "blur(1.5px)" } : undefined}
    />
  );
}

function formatMetricValue(c: AggregatedCreative, metric: LocalMetric): string {
  switch (metric) {
    case "cpl":
      return fmtCurrency(c.cplPago);
    case "cplQualified":
      return fmtCurrency(c.cplQualified);
    case "leads":
      return fmtNumber(c.leadsPagos);
    case "ctr":
      return fmtPercent(c.ctr);
    default:
      return "—";
  }
}

/**
 * Ordena criativos pela métrica selecionada.
 * - cpl / cplQualified: ASC (menor = melhor); null vai pro final
 * - leads / ctr: DESC (maior = melhor)
 */
function sortByMetric(
  creatives: AggregatedCreative[],
  metric: LocalMetric,
): AggregatedCreative[] {
  const sorted = [...creatives];
  if (metric === "cpl") {
    sorted.sort((a, b) => {
      if (a.cplPago == null && b.cplPago == null) return 0;
      if (a.cplPago == null) return 1;
      if (b.cplPago == null) return -1;
      return a.cplPago - b.cplPago;
    });
  } else if (metric === "cplQualified") {
    sorted.sort((a, b) => {
      if (a.cplQualified == null && b.cplQualified == null) return 0;
      if (a.cplQualified == null) return 1;
      if (b.cplQualified == null) return -1;
      return a.cplQualified - b.cplQualified;
    });
  } else if (metric === "leads") {
    sorted.sort((a, b) => b.leadsPagos - a.leadsPagos);
  } else {
    sorted.sort((a, b) => b.ctr - a.ctr);
  }
  return sorted;
}

// ============================================================
// LIGHTBOX
// ============================================================

interface LightboxItem {
  id: string;
  name: string;
  creative: MetaAdCreative | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cplPago: number | null;
  parentInfo?: string;
}

function CreativeLightbox({
  items,
  initialIndex,
  projectId,
  onClose,
  funnelContext,
}: {
  items: LightboxItem[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
  funnelContext?: { days: number; funnelType?: "launch" | "perpetual"; funnelName?: string };
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  const isVideo = item.creative?.objectType === "VIDEO";

  const { data: videoData } = useVideoSource(
    isVideo ? projectId : null,
    isVideo ? (item.creative?.videoId ?? null) : null,
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

  const funnel = funnelContext ?? { days: 30 };
  const path = { ad: item.name };
  const spendFormula = enrichFormulaForEntity(
    buildFunnelSpendFormula(item.spend, funnel),
    path,
  );
  const ctrFormula = enrichFormulaForEntity(
    buildFunnelCtrFormula(item.ctr, funnel),
    path,
  );
  const cplFormula = item.cplPago != null
    ? enrichFormulaForEntity(buildFunnelCplFormula(item.spend, item.clicks > 0 ? item.clicks : 0, funnel, "pago"), path)
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full m-4 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {item.creative?.objectType === "VIDEO"
                ? "Video"
                : item.creative?.objectType === "CAROUSEL"
                  ? "Carousel"
                  : "Imagem"}
            </Badge>
            <span className="text-sm font-medium truncate">{item.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {index + 1} / {items.length}
            </span>
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
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

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
              <CreativeThumbnail
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
            <CreativeThumbnail
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <div className="p-4 space-y-3 shrink-0 overflow-y-auto">
          {(() => {
            const cells: Array<{
              label: string;
              value: string;
              formula: MetricFormula | undefined;
            }> = [
              { label: "Investimento", value: fmtCurrency(item.spend), formula: spendFormula },
              { label: "Impressões", value: fmtNumber(item.impressions), formula: undefined },
              { label: "Cliques", value: fmtNumber(item.clicks), formula: undefined },
              { label: "CTR", value: fmtPercent(item.ctr), formula: ctrFormula },
              { label: "CPL Pago", value: fmtCurrency(item.cplPago), formula: cplFormula },
            ];
            return (
              <div className="grid grid-cols-5 gap-3">
                {cells.map((m) => (
                  <MetricTooltip key={m.label} label={m.label} value={m.value} formula={m.formula}>
                    <div className="text-center cursor-help">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p
                        className={`text-sm font-semibold ${m.formula ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}
                      >
                        {m.value}
                      </p>
                    </div>
                  </MetricTooltip>
                ))}
              </div>
            );
          })()}

          {item.creative?.title && <p className="text-sm font-medium">{item.creative.title}</p>}
          {item.creative?.body && (
            <p className="text-xs text-muted-foreground line-clamp-3">{item.creative.body}</p>
          )}

          {item.creative?.linkUrl && (
            <a
              href={item.creative.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {(() => {
                try {
                  const u = new URL(item.creative!.linkUrl!);
                  return (
                    u.hostname +
                    (u.pathname.length > 1 ? u.pathname.split("/").slice(0, 3).join("/") : "")
                  );
                } catch {
                  return item.creative!.linkUrl;
                }
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
  funnelId?: string;
  /**
   * Stage atual (Story 21.7) — quando presente, ativa o hook
   * `useCreativeRevenue` que cruza planilha de leads × vendas e exibe
   * o faturamento real por criativo nos cards.
   */
  stageId?: string;
  funnelContext?: {
    days: number;
    funnelType?: "launch" | "perpetual";
    funnelName?: string;
  };
  /**
   * Dados da pesquisa agregados por ad_id (Story 18.6).
   * Quando passado, cada card exibe top-1 de faturamento + profissão abaixo
   * das métricas (Invest / CTR / CPL). Tipo refinado de `unknown` (Story 18.5)
   * pra `SurveyDataByAdId` nesta story.
   */
  surveyDataByAdId?: SurveyDataByAdId;
}

export function TopCreativesGallery({
  projectId,
  days,
  campaignIds,
  funnelId,
  stageId,
  funnelContext,
  surveyDataByAdId,
}: TopCreativesGalleryProps) {
  const [metric, setMetric] = useState<LocalMetric>("cpl");
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Story 21.7 — faturamento real por criativo (cruzamento leads × vendas).
  // Só ativa quando temos funnelId+stageId; hook é no-op (`enabled: false`)
  // caso contrário, então overhead zero nos dashboards que não passam stageId.
  const { data: revenueData } = useCreativeRevenue(
    projectId,
    funnelId ?? null,
    stageId ?? null,
    days,
  );

  const brlFormatter = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    [],
  );

  // Story 18.5: limit=20, todas as campanhas do funil/stage (não apenas a 1ª).
  // Backend aceita `campaignIds` CSV via Meta API IN filter — múltiplas
  // campanhas num único request.
  const { data, isLoading } = useTopPerformers(
    projectId,
    "ctr" as const,
    20,
    days,
    campaignIds && campaignIds.length > 0 ? campaignIds : null,
  );

  const { data: spreadsheetsData } = useFunnelSpreadsheets(projectId, funnelId ?? "");
  const linkedSheet = useMemo(() => {
    if (!spreadsheetsData?.spreadsheets) return null;
    return (
      spreadsheetsData.spreadsheets.find((s) => s.type === "leads") ??
      spreadsheetsData.spreadsheets[0] ??
      null
    );
  }, [spreadsheetsData]);
  const { data: sheetData } = useFunnelSpreadsheetData(
    projectId,
    funnelId ?? "",
    linkedSheet?.id,
  );

  const aggregated = useMemo<AggregatedCreative[]>(() => {
    if (!data) return [];
    const agg = aggregateCreativesByName(data.topPerformers);
    if (!sheetData) return agg;
    const filtered = filterSheetRowsByDays(sheetData, days);
    const utmContentMapped = !!sheetData.mapping.utm_content;
    const utmSourceMapped = !!sheetData.mapping.utm_source;
    return enrichWithPaidLeads(agg, filtered, utmContentMapped, utmSourceMapped);
  }, [data, sheetData, days]);

  const sorted = useMemo(() => sortByMetric(aggregated, metric), [aggregated, metric]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) return null;

  const shown = expanded ? sorted : sorted.slice(0, 20);
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;
  const selectedOption = METRIC_OPTIONS.find((m) => m.value === metric);
  const showReviewBadge = !!selectedOption?.needsReview;

  const lightboxItems: LightboxItem[] = sorted.map((c) => ({
    id: c.ids[0],
    name: c.name,
    creative: c.creative,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.ctr,
    cplPago: c.cplPago,
    parentInfo: c.parentInfo,
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Top Criativos — {metricLabel}</h3>
          <p className="text-[11px] text-muted-foreground">
            {sorted.length} criativos agregados por nome
          </p>
        </div>
        <Select value={metric} onValueChange={(v) => setMetric(v as LocalMetric)}>
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <span className="flex items-center gap-1.5">
                  {m.label}
                  {m.needsReview && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showReviewBadge && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 dark:text-amber-400">
            <span className="font-medium">Métrica em revisão —</span> definição de lead qualificado
            pendente. Valores exibidos são do backend legado e podem divergir da metodologia atual.
          </p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c, i) => {
          const funnel = funnelContext ?? { days: 30 };
          const path = { ad: c.name };
          const spendFormula = enrichFormulaForEntity(
            buildFunnelSpendFormula(c.spend, funnel),
            path,
          );
          const ctrFormula = enrichFormulaForEntity(
            buildFunnelCtrFormula(c.ctr, funnel),
            path,
          );
          const cplFormula = c.cplPago != null
            ? enrichFormulaForEntity(
                buildFunnelCplFormula(c.spend, c.leadsPagos, funnel, "pago"),
                path,
              )
            : undefined;
          return (
            <div
              key={c.name}
              className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md cursor-pointer"
              onClick={() => setLightboxIndex(i)}
            >
              <div className="relative aspect-video bg-muted/30">
                <CreativeThumbnail
                  src={creativeImgSrc(c.creative)}
                  alt={c.name}
                  className="w-full h-full object-cover"
                  isLowRes={isLowResFallback(c.creative)}
                />

                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 bg-black/50 text-white border-white/20 backdrop-blur-sm"
                  >
                    {c.creative?.objectType === "VIDEO"
                      ? "Video"
                      : c.creative?.objectType === "CAROUSEL"
                        ? "Carousel"
                        : "Imagem"}
                  </Badge>
                  {c.ids.length > 1 && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-blue-500/30 text-white border-blue-200/40 backdrop-blur-sm"
                      title={`Agregado de ${c.ids.length} versões com mesmo nome`}
                    >
                      ×{c.ids.length}
                    </Badge>
                  )}
                </div>

                {c.creative?.objectType === "VIDEO" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-black/40 p-2 group-hover:bg-black/60 transition-colors">
                      <Play className="h-4 w-4 text-white fill-white" />
                    </div>
                  </div>
                )}

                <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                  <a
                    href={creativeImgSrc(c.creative)}
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

              <div className="p-2.5 space-y-2">
                <p className="text-[11px] font-medium truncate" title={c.name}>
                  {c.name}
                </p>
                <p className="text-lg font-bold tracking-tight">
                  {formatMetricValue(c, metric)}
                </p>
                <div className="grid grid-cols-3 gap-1 text-[10px] pt-1 border-t border-border/20">
                  <MetricTooltip label="Investimento" value={fmtCurrency(c.spend)} formula={spendFormula}>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-help text-center"
                    >
                      <p className="text-muted-foreground">Invest.</p>
                      <p className="font-semibold underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                        {fmtCurrency(c.spend)}
                      </p>
                    </div>
                  </MetricTooltip>
                  <MetricTooltip label="CTR" value={fmtPercent(c.ctr)} formula={ctrFormula}>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-help text-center"
                    >
                      <p className="text-muted-foreground">CTR</p>
                      <p className="font-semibold underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                        {fmtPercent(c.ctr)}
                      </p>
                    </div>
                  </MetricTooltip>
                  <MetricTooltip label="CPL Pago" value={fmtCurrency(c.cplPago)} formula={cplFormula}>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-help text-center"
                    >
                      <p className="text-muted-foreground">CPL</p>
                      <p className="font-semibold underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                        {fmtCurrency(c.cplPago)}
                      </p>
                    </div>
                  </MetricTooltip>
                </div>

                {/* Breakdown de leads por origem (Story 21.2 — Task 6) */}
                {(c.leadsPagos > 0 || c.leadsOrg > 0 || c.leadsSemTrack > 0) && (
                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/20">
                    <span className="font-medium text-foreground/70">Leads: </span>
                    {c.leadsPagos > 0 && <span>{c.leadsPagos} Pagos</span>}
                    {c.leadsOrg > 0 && <span>{c.leadsPagos > 0 ? " | " : ""}{c.leadsOrg} Org</span>}
                    {c.leadsSemTrack > 0 && <span>{(c.leadsPagos > 0 || c.leadsOrg > 0) ? " | " : ""}{c.leadsSemTrack} S/orig</span>}
                  </div>
                )}

                {/* Faturamento real por criativo (Story 21.7). Dedup de email
                    entre múltiplos ad_ids do mesmo criativo agregado (AC-8). */}
                {revenueData && !revenueData.semDados ? (() => {
                  const seenEmails = new Set<string>();
                  let bruto = 0;
                  let vendas = 0;
                  for (const id of c.ids) {
                    const entry = revenueData.byAdId[id];
                    if (!entry) continue;
                    for (let i = 0; i < entry.emails.length; i++) {
                      const email = entry.emails[i];
                      if (seenEmails.has(email)) continue;
                      seenEmails.add(email);
                      // Share proporcional por venda (cada email conta 1 vez;
                      // bruto do ad foi somado já por email, então distribui
                      // pelo count de emails do ad pra pegar o share do email).
                      bruto += entry.faturamentoBruto / entry.emails.length;
                      vendas += 1;
                    }
                  }
                  if (bruto <= 0 || vendas === 0) return null;
                  return (
                    <div className="text-[10px] pt-1 border-t border-border/20">
                      <span className="text-foreground/80 font-medium">
                        💵 Faturado: {brlFormatter.format(bruto)}
                      </span>
                      <span className="text-muted-foreground/70"> · {vendas} {vendas === 1 ? "venda" : "vendas"}</span>
                    </div>
                  );
                })() : null}

                {/* Dados da pesquisa (Story 18.6 sub-feature 3.b) */}
                {surveyDataByAdId ? (() => {
                  const survey = mergeSurveyForGroup(surveyDataByAdId, c.ids, c.leadsPagos);
                  if (
                    !survey.faturamento &&
                    !survey.profissao &&
                    !survey.funcionarios &&
                    !survey.voce_e
                  ) {
                    return (
                      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/20">
                        — Sem dados de pesquisa
                      </p>
                    );
                  }
                  function line(emoji: string, top: typeof survey.faturamento) {
                    if (!top || top.total === 0) return null;
                    const pct = ((top.count / top.total) * 100).toFixed(0);
                    const titleDetail = `${top.label} · ${top.count} de ${top.total} leads (${pct}%) — baseado em ${top.totalResponses} ${top.totalResponses === 1 ? "resposta" : "respostas"} da pesquisa`;
                    return (
                      <p className="truncate" title={titleDetail}>
                        {emoji} <span className="font-medium">{top.label}</span>
                        <span className="text-muted-foreground/70"> · {top.count}/{top.total} ({pct}%)</span>
                      </p>
                    );
                  }
                  return (
                    <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/20">
                      {line("💰", survey.faturamento)}
                      {line("👤", survey.profissao)}
                      {line("👥", survey.funcionarios)}
                      {line("📋", survey.voce_e)}
                    </div>
                  );
                })() : null}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 20 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${sorted.length})`}
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
