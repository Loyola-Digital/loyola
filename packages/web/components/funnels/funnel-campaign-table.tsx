"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ArrowUpDown,
  Play,
  ImageIcon,
  X,
  ExternalLink,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  useTrafficAdSets,
  useTrafficAds,
  useVideoSource,
  type CampaignAnalytics,
  type MetaAdCreative,
  type VideoMetrics,
} from "@/lib/hooks/use-traffic-analytics";

// ============================================================
// FORMATTERS
// ============================================================

function fmtCurrency(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

function fmtNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}%`;
}

// ============================================================
// MICRO COMPONENTS
// ============================================================

function CreativeTypeBadge({ objectType }: { objectType: string | null }) {
  if (!objectType) return null;
  const label = objectType === "VIDEO" ? "Video" : objectType === "CAROUSEL" ? "Carousel" : "Imagem";
  return <Badge variant="outline" className="text-[9px] px-1 py-0">{label}</Badge>;
}

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Saiba Mais", SHOP_NOW: "Compre Agora", SIGN_UP: "Cadastre-se",
  WATCH_MORE: "Assistir Mais", CONTACT_US: "Fale Conosco", APPLY_NOW: "Inscreva-se",
  DOWNLOAD: "Baixar", GET_OFFER: "Ver Oferta", SUBSCRIBE: "Assinar", BUY_NOW: "Comprar",
  WHATSAPP_MESSAGE: "WhatsApp", MESSAGE_PAGE: "Mensagem", CALL_NOW: "Ligar",
};

function CtaBadge({ ctaType }: { ctaType: string | null }) {
  if (!ctaType || ctaType === "NO_BUTTON") return null;
  const label = CTA_LABELS[ctaType] ?? ctaType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">{label}</Badge>;
}

function VideoRetentionSparkline({ metrics }: { metrics: VideoMetrics }) {
  const data = [
    { label: "25%", value: metrics.p25 },
    { label: "50%", value: metrics.p50 },
    { label: "75%", value: metrics.p75 },
    { label: "100%", value: metrics.p100 },
  ];
  if (data.every((d) => d.value === 0)) return null;

  return (
    <div className="inline-block" title={`25%: ${fmtNumber(metrics.p25)} → 100%: ${fmtNumber(metrics.p100)}`}>
      <ResponsiveContainer width={72} height={22}>
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Area type="monotone" dataKey="value" stroke="hsl(200 80% 60%)" fill="hsl(200 80% 60% / 0.2)" strokeWidth={1.5} />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "10px", padding: "4px 6px" }}
            formatter={(v) => fmtNumber(Number(v))}
            labelFormatter={(l) => `Retenção ${l}`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// LIGHTBOX (replicando Story 9.5/9.6)
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
}

function CreativeLightbox({ items, initialIndex, projectId, onClose }: {
  items: LightboxItem[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
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
            <CreativeTypeBadge objectType={item.creative.objectType} />
            <CtaBadge ctaType={item.creative.ctaType} />
            <span className="text-sm font-medium truncate">{item.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{index + 1} / {items.length}</span>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Media */}
        <div className="relative bg-black min-h-[300px] max-h-[60vh] flex items-center justify-center overflow-hidden">
          {isVideo && videoData?.embedHtml ? (
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
                src={videoData.picture || item.creative.thumbnailUrl || ""}
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
              src={item.creative.imageUrl || item.creative.thumbnailUrl || ""}
              alt={item.name}
              className="w-full max-h-[60vh] object-contain"
            />
          ) : (
            <div className="flex items-center justify-center p-8">
              <Play className="h-10 w-10 text-white opacity-60" />
            </div>
          )}

          {/* Nav arrows */}
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

        {/* Info panel */}
        <div className="p-4 space-y-3 shrink-0 overflow-y-auto">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Spend", value: fmtCurrency(item.spend) },
              { label: "Impressões", value: fmtNumber(item.impressions) },
              { label: "Cliques", value: fmtNumber(item.clicks) },
              { label: "CTR", value: fmtPercent(item.ctr) },
              { label: "CPC", value: fmtCurrency(item.cpc) },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p className="text-sm font-semibold">{m.value}</p>
              </div>
            ))}
          </div>

          {item.videoMetrics && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Retenção:</span>
              <VideoRetentionSparkline metrics={item.videoMetrics} />
              <span className="text-[10px] text-muted-foreground ml-auto">
                Thruplay: {fmtNumber(item.videoMetrics.thruplay)}
              </span>
            </div>
          )}

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
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN TABLE
// ============================================================

interface FunnelCampaignTableProps {
  campaigns: CampaignAnalytics[];
  projectId: string;
  days: number;
}

export function FunnelCampaignTable({ campaigns, projectId, days }: FunnelCampaignTableProps) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<keyof CampaignAnalytics>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [campaigns, sortCol, sortDir]);

  function handleSort(col: keyof CampaignAnalytics) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const SortHeader = ({ label, col }: { label: string; col: keyof CampaignAnalytics }) => (
    <th
      className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2 cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortCol === col && <ArrowUpDown className="h-2.5 w-2.5" />}
      </span>
    </th>
  );

  if (campaigns.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Campanhas do Funil</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Nome</th>
              <SortHeader label="Spend" col="spend" />
              <SortHeader label="Impr" col="impressions" />
              <SortHeader label="Reach" col="reach" />
              <SortHeader label="Clicks" col="clicks" />
              <SortHeader label="CTR" col="ctr" />
              <SortHeader label="CPC" col="cpc" />
              <SortHeader label="CPM" col="cpm" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isExpanded = expandedCampaign === c.campaignId;
              return (
                <CampaignRow
                  key={c.campaignId}
                  campaign={c}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedCampaign(isExpanded ? null : c.campaignId)}
                  projectId={projectId}
                  days={days}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// DRILL-DOWN ROWS
// ============================================================

function CampaignRow({ campaign: c, isExpanded, onToggle, projectId, days }: {
  campaign: CampaignAnalytics; isExpanded: boolean; onToggle: () => void; projectId: string; days: number;
}) {
  return (
    <>
      <tr className="border-t border-border/20 hover:bg-muted/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-2 px-3 text-xs font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="truncate max-w-[200px]">{c.campaignName}</span>
          </span>
        </td>
        <td className="py-2 px-2 text-xs text-right font-medium">{fmtCurrency(c.spend)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.impressions)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.reach)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.clicks)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.ctr)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpc)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpm)}</td>
      </tr>
      {isExpanded && <DrillDownAdSets projectId={projectId} campaignId={c.campaignId} days={days} />}
    </>
  );
}

function DrillDownAdSets({ projectId, campaignId, days }: { projectId: string; campaignId: string; days: number }) {
  const { data, isLoading } = useTrafficAdSets(projectId, campaignId, days);
  if (isLoading) return <tr><td colSpan={8} className="py-2 px-4"><Skeleton className="h-8" /></td></tr>;
  if (!data || data.adsets.length === 0) return <tr><td colSpan={8} className="py-2 px-8 text-xs text-muted-foreground">Nenhum ad set</td></tr>;

  return (
    <>
      {data.adsets.map((a) => (
        <DrillDownAdSetRow key={a.campaignId} adset={a} projectId={projectId} days={days} />
      ))}
    </>
  );
}

function DrillDownAdSetRow({ adset, projectId, days }: { adset: CampaignAnalytics; projectId: string; days: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-t border-border/10 bg-muted/20 hover:bg-muted/40 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="py-1.5 px-3 text-[11px] pl-8">
          <span className="inline-flex items-center gap-1">
            {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            <span className="truncate">{adset.campaignName}</span>
          </span>
        </td>
        <td className="py-1.5 px-2 text-[11px] text-right font-medium">{fmtCurrency(adset.spend)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.impressions)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.reach)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(adset.clicks)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(adset.ctr)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(adset.cpc)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(adset.cpm)}</td>
      </tr>
      {expanded && <DrillDownAds projectId={projectId} adsetId={adset.campaignId} days={days} />}
    </>
  );
}

function DrillDownAds({ projectId, adsetId, days }: { projectId: string; adsetId: string; days: number }) {
  const { data, isLoading } = useTrafficAds(projectId, adsetId, days);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (isLoading) return <tr><td colSpan={8} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data || data.ads.length === 0) return <tr><td colSpan={8} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  const lightboxItems: LightboxItem[] = data.ads
    .filter((a) => a.creative)
    .map((a) => ({
      id: a.campaignId,
      name: a.campaignName,
      creative: a.creative!,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.ctr,
      cpc: a.cpc,
      reach: a.reach,
      videoMetrics: a.videoMetrics,
    }));

  return (
    <>
      {data.ads.map((a) => (
        <tr key={a.campaignId} className="border-t border-border/10 bg-muted/10 hover:bg-muted/30">
          <td className="py-1.5 px-3 text-[11px] pl-14">
            <span className="inline-flex items-center gap-2">
              {a.creative?.thumbnailUrl ? (
                <button
                  onClick={() => {
                    const idx = lightboxItems.findIndex((li) => li.id === a.campaignId);
                    if (idx >= 0) setLightboxIndex(idx);
                  }}
                  className="relative shrink-0 rounded overflow-hidden"
                >
                  <img src={a.creative.thumbnailUrl} alt="" className="w-10 h-10 object-cover" />
                  {a.creative.objectType === "VIDEO" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-3 w-3 text-white fill-white drop-shadow" />
                    </div>
                  )}
                </button>
              ) : (
                <div className="w-10 h-10 rounded bg-muted/40 flex items-center justify-center shrink-0">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              )}
              <span className="truncate">{a.campaignName}</span>
              <CreativeTypeBadge objectType={a.creative?.objectType ?? null} />
              <CtaBadge ctaType={a.creative?.ctaType ?? null} />
              {a.videoMetrics && <VideoRetentionSparkline metrics={a.videoMetrics} />}
            </span>
          </td>
          <td className="py-1.5 px-2 text-[11px] text-right font-medium">{fmtCurrency(a.spend)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.impressions)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.reach)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(a.clicks)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(a.ctr)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(a.cpc)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(a.cpm)}</td>
        </tr>
      ))}
      {lightboxIndex !== null && (
        <tr><td colSpan={8} className="p-0">
          <CreativeLightbox
            items={lightboxItems}
            initialIndex={lightboxIndex}
            projectId={projectId}
            onClose={() => setLightboxIndex(null)}
          />
        </td></tr>
      )}
    </>
  );
}
