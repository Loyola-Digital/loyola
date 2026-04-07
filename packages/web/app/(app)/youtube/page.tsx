"use client";

import { useState } from "react";
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  Play,
  Target,
  TrendingUp,
  Youtube,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
  ChevronLeft,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useGoogleAdsAccounts } from "@/lib/hooks/use-google-ads";
import {
  useGoogleAdsOverview,
  useGoogleAdsDailyInsights,
  useGoogleAdsCampaigns,
  useGoogleAdsAdGroups,
  useGoogleAdsAds,
  useGoogleAdsTopPerformers,
  type GoogleAdsCampaign,
  type GoogleAdsAd,
} from "@/lib/hooks/use-google-ads-analytics";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// ============================================================
// HELPERS
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
// KPI CARD
// ============================================================

function KpiCard({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

// ============================================================
// RETENTION BAR
// ============================================================

function RetentionBar({ retention }: { retention: { p25: number; p50: number; p75: number; p100: number } }) {
  const bars = [
    { label: "25%", value: retention.p25, color: "bg-blue-500" },
    { label: "50%", value: retention.p50, color: "bg-blue-400" },
    { label: "75%", value: retention.p75, color: "bg-amber-500" },
    { label: "100%", value: retention.p100, color: "bg-emerald-500" },
  ];

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">Retencao de Video</h3>
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="w-10 text-xs text-muted-foreground text-right">{bar.label}</span>
            <div className="flex-1 h-6 rounded-md bg-muted/30 overflow-hidden">
              <div
                className={`h-full rounded-md ${bar.color} transition-all`}
                style={{ width: `${Math.max(bar.value * 100, 2)}%` }}
              />
            </div>
            <span className="w-12 text-xs font-medium tabular-nums text-right">
              {(bar.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CAMPAIGN TABLE WITH DRILL-DOWN
// ============================================================

function CampaignTable({ campaigns, accountId, days }: { campaigns: GoogleAdsCampaign[]; accountId: string; days: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (campaigns.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Campanhas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3">Nome</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Spend</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Views</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPV</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">View Rate</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Impr</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CTR</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPC</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Conv</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const isExpanded = expanded === c.id;
              return (
                <CampaignRow key={c.id} campaign={c} isExpanded={isExpanded} onToggle={() => setExpanded(isExpanded ? null : c.id)} accountId={accountId} days={days} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignRow({ campaign: c, isExpanded, onToggle, accountId, days }: { campaign: GoogleAdsCampaign; isExpanded: boolean; onToggle: () => void; accountId: string; days: number }) {
  return (
    <>
      <tr className="border-t border-border/20 hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="py-2 px-3 text-xs font-medium">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {c.name}
          </span>
        </td>
        <td className="py-2 px-2 text-xs text-right font-medium">{fmtCurrency(c.spend)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.views)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpv)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.viewRate)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.impressions)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.ctr)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpc)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.conversions)}</td>
      </tr>
      {isExpanded && <DrillDownAdGroups accountId={accountId} campaignId={c.id} days={days} />}
    </>
  );
}

function DrillDownAdGroups({ accountId, campaignId, days }: { accountId: string; campaignId: string; days: number }) {
  const { data, isLoading } = useGoogleAdsAdGroups(accountId, campaignId, days);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading) return <tr><td colSpan={9} className="py-2 px-4"><Skeleton className="h-8" /></td></tr>;
  if (!data?.adGroups?.length) return <tr><td colSpan={9} className="py-2 px-8 text-xs text-muted-foreground">Nenhum ad group</td></tr>;

  return (
    <>
      {data.adGroups.map((ag) => (
        <DrillDownAdGroupRow key={ag.id} adGroup={ag} isExpanded={expanded === ag.id} onToggle={() => setExpanded(expanded === ag.id ? null : ag.id)} accountId={accountId} days={days} />
      ))}
    </>
  );
}

function DrillDownAdGroupRow({ adGroup: ag, isExpanded, onToggle, accountId, days }: { adGroup: { id: string; name: string; spend: number; views: number; cpv: number | null; viewRate: number | null; impressions: number; ctr: number; cpc: number; conversions: number; clicks: number }; isExpanded: boolean; onToggle: () => void; accountId: string; days: number }) {
  return (
    <>
      <tr className="border-t border-border/10 bg-muted/20 hover:bg-muted/40 cursor-pointer" onClick={onToggle}>
        <td className="py-1.5 px-3 text-[11px] pl-8">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            {ag.name}
          </span>
        </td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ag.spend)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ag.views)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ag.cpv)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(ag.viewRate)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ag.impressions)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(ag.ctr)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ag.cpc)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ag.conversions)}</td>
      </tr>
      {isExpanded && <DrillDownAds accountId={accountId} adGroupId={ag.id} days={days} />}
    </>
  );
}

function DrillDownAds({ accountId, adGroupId, days }: { accountId: string; adGroupId: string; days: number }) {
  const { data, isLoading } = useGoogleAdsAds(accountId, adGroupId, days);
  if (isLoading) return <tr><td colSpan={9} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data?.ads?.length) return <tr><td colSpan={9} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  return (
    <>
      {data.ads.map((ad) => (
        <tr key={ad.id} className="border-t border-border/10 bg-muted/10 hover:bg-muted/30">
          <td className="py-1.5 px-3 text-[11px] pl-14">
            <span className="inline-flex items-center gap-2">
              {ad.thumbnailUrl ? (
                <img src={ad.thumbnailUrl} alt="" className="w-16 h-9 object-cover rounded shrink-0" />
              ) : null}
              <span className="truncate">{ad.name}</span>
              {ad.type.includes("VIDEO") && <Badge variant="outline" className="text-[9px] px-1 py-0">Video</Badge>}
            </span>
          </td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ad.spend)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ad.views)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ad.cpv)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(ad.viewRate)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ad.impressions)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(ad.ctr)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(ad.cpc)}</td>
          <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(ad.conversions)}</td>
        </tr>
      ))}
    </>
  );
}

// ============================================================
// CREATIVE GALLERY
// ============================================================

function CreativeGallery({ accountId, days }: { accountId: string; days: number }) {
  const { data, isLoading } = useGoogleAdsTopPerformers(accountId, days, 12);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!data?.topPerformers?.length) return null;

  const withThumbnails = data.topPerformers.filter((ad) => ad.thumbnailUrl);
  if (withThumbnails.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Top Criativos YouTube</h3>
        <p className="text-[11px] text-muted-foreground">{withThumbnails.length} videos com preview</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {withThumbnails.map((ad, i) => (
          <div
            key={ad.id}
            className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md cursor-pointer"
            onClick={() => setLightboxIndex(i)}
          >
            <div className="relative aspect-video bg-muted/30">
              <img src={ad.thumbnailUrl!} alt={ad.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div><p className="opacity-60">Spend</p><p className="font-semibold">{fmtCurrency(ad.spend)}</p></div>
                    <div><p className="opacity-60">CPV</p><p className="font-semibold">{fmtCurrency(ad.cpv)}</p></div>
                    <div><p className="opacity-60">Views</p><p className="font-semibold">{fmtNumber(ad.views)}</p></div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-full bg-black/40 p-2 group-hover:bg-black/60 transition-colors">
                  <Play className="h-4 w-4 text-white fill-white" />
                </div>
              </div>
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                {ad.youtubeVideoId && (
                  <a
                    href={`https://www.youtube.com/watch?v=${ad.youtubeVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/50 p-1 text-white hover:bg-black/70 backdrop-blur-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <span className="text-[10px] font-bold bg-black/50 text-white rounded px-1.5 py-0.5 backdrop-blur-sm">#{i + 1}</span>
              </div>
            </div>
            <div className="p-2.5 space-y-1">
              <p className="text-[11px] font-medium truncate">{ad.name}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{fmtNumber(ad.views)} views</span>
                <span>{fmtPercent(ad.viewRate)} view rate</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <YouTubeLightbox
          ads={withThumbnails}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function YouTubeLightbox({ ads, initialIndex, onClose }: { ads: GoogleAdsAd[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const ad = ads[index];
  const prev = () => setIndex((i) => (i - 1 + ads.length) % ads.length);
  const next = () => setIndex((i) => (i + 1) % ads.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full m-4 overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
          <span className="text-sm font-medium truncate">{ad.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{index + 1} / {ads.length}</span>
            {ad.youtubeVideoId && (
              <a href={`https://www.youtube.com/watch?v=${ad.youtubeVideoId}`} target="_blank" rel="noopener noreferrer" className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="relative bg-black">
          {ad.youtubeVideoId ? (
            <iframe
              key={ad.youtubeVideoId}
              src={`https://www.youtube.com/embed/${ad.youtubeVideoId}?autoplay=1&rel=0`}
              className="w-full aspect-video border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : (
            <img src={ad.thumbnailUrl!} alt={ad.name} className="w-full aspect-video object-contain" />
          )}
          {ads.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"><ChevronRight className="h-5 w-5" /></button>
            </>
          )}
        </div>
        <div className="p-4 space-y-3 shrink-0">
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: "Spend", value: fmtCurrency(ad.spend) },
              { label: "Views", value: fmtNumber(ad.views) },
              { label: "CPV", value: fmtCurrency(ad.cpv) },
              { label: "View Rate", value: fmtPercent(ad.viewRate) },
              { label: "CTR", value: fmtPercent(ad.ctr) },
              { label: "Conv", value: fmtNumber(ad.conversions) },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p className="text-sm font-semibold">{m.value}</p>
              </div>
            ))}
          </div>
          {(ad.retention.p25 > 0 || ad.retention.p100 > 0) && (
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span>Retencao:</span>
              <span>25%: <strong className="text-foreground">{(ad.retention.p25 * 100).toFixed(1)}%</strong></span>
              <span>50%: <strong className="text-foreground">{(ad.retention.p50 * 100).toFixed(1)}%</strong></span>
              <span>75%: <strong className="text-foreground">{(ad.retention.p75 * 100).toFixed(1)}%</strong></span>
              <span>100%: <strong className="text-foreground">{(ad.retention.p100 * 100).toFixed(1)}%</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PAGE
// ============================================================

export default function YouTubeDashboardPage() {
  const { data: accounts, isLoading: accountsLoading } = useGoogleAdsAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Auto-select first account
  const activeAccountId = selectedAccountId ?? accounts?.[0]?.id ?? null;

  const { data: overview, isLoading: overviewLoading } = useGoogleAdsOverview(activeAccountId, days > 0 ? days : 30);
  const { data: dailyData, isLoading: dailyLoading } = useGoogleAdsDailyInsights(activeAccountId, days > 0 ? days : 30);
  const { data: campaignData, isLoading: campaignsLoading } = useGoogleAdsCampaigns(activeAccountId, days > 0 ? days : 30);

  // Empty state
  if (!accountsLoading && (!accounts || accounts.length === 0)) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Youtube className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-lg">Nenhuma conta Google Ads conectada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte uma conta nas configuracoes para visualizar as metricas.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/google-ads">Ir para Configuracoes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          YouTube Ads
        </h1>
        <div className="flex items-center gap-2">
          {/* Account selector */}
          {accounts && accounts.length > 1 && (
            <Select
              value={activeAccountId ?? undefined}
              onValueChange={setSelectedAccountId}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.accountName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Period selector */}
          <DayRangePicker days={days} onDaysChange={setDays} />
        </div>
      </div>

      {/* KPI Cards */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
          <KpiCard icon={Play} label="Views" value={fmtNumber(overview.totalViews)} />
          <KpiCard icon={Target} label="CPV" value={fmtCurrency(overview.cpv)} />
          <KpiCard icon={Eye} label="View Rate" value={fmtPercent(overview.viewRate)} />
          <KpiCard icon={Eye} label="Impressoes" value={fmtNumber(overview.totalImpressions)} />
          <KpiCard icon={Percent} label="CTR" value={fmtPercent(overview.ctr)} />
          <KpiCard icon={MousePointerClick} label="CPC" value={fmtCurrency(overview.cpc)} />
          <KpiCard icon={TrendingUp} label="Conversoes" value={fmtNumber(overview.conversions)} />
        </div>
      ) : null}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Spend + Views */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Spend & Views Diarios</h3>
          {dailyLoading ? (
            <Skeleton className="h-56" />
          ) : dailyData && dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailyData.map((d) => ({ date: d.date.slice(5, 10), spend: d.spend, views: d.views }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
                <YAxis yAxisId="views" orientation="right" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
                <Legend wrapperStyle={{ color: "#fff" }} />
                <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Spend (R$)" />
                <Line yAxisId="views" type="monotone" dataKey="views" stroke="hsl(0 72% 55%)" strokeWidth={2} dot={false} name="Views" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Sem dados no periodo.</div>
          )}
        </div>

        {/* Retention */}
        {overview?.retention && (
          <RetentionBar retention={overview.retention} />
        )}
      </div>

      {/* Creative Gallery */}
      {activeAccountId && <CreativeGallery accountId={activeAccountId} days={days > 0 ? days : 30} />}

      {/* Campaign Table with drill-down */}
      {campaignsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : campaignData?.campaigns && campaignData.campaigns.length > 0 && activeAccountId ? (
        <CampaignTable campaigns={campaignData.campaigns} accountId={activeAccountId} days={days > 0 ? days : 30} />
      ) : null}
    </div>
  );
}
