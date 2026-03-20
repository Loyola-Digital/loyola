"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  TrendingUp,
  Settings,
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Users,
  ShoppingCart,
  FileSpreadsheet,
  Loader2,
  Save,
  Plus,
  Trash2,
  X,
  Play,
  ImageIcon,
  Download,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaAdsAccounts, useMetaAdsDailyInsights } from "@/lib/hooks/use-meta-ads";
import {
  useGoogleSheetsConnection,
  useConnectGoogleSheet,
  useDeleteGoogleSheetsConnection,
  useMapSheetTabs,
  useSheetTabPreview,
  useAvailableTabs,
  useAIAnalyzeSheet,
  type TabMappingInput,
} from "@/lib/hooks/use-google-sheets";
import {
  useTrafficCampaigns,
  useTrafficAdSets,
  useTrafficAds,
  useTopPerformers,
  useAllAdSets,
  useCampaignDailyInsights,
  usePlacementBreakdown,
  type CampaignAnalytics,
  type CampaignAnalyticsResponse,
  type TopPerformerMetric,
  type TopPerformerAd,
  type VideoMetrics,
  type PlacementInsight,
} from "@/lib/hooks/use-traffic-analytics";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// ============================================================
// HELPERS
// ============================================================

function fmtCurrency(val: number | null): string {
  if (val === null) return "—";
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

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

// ============================================================
// VIDEO RETENTION SPARKLINE (Story 8.6)
// ============================================================

function VideoRetentionSparkline({ metrics }: { metrics: VideoMetrics }) {
  const data = [
    { label: "25%", value: metrics.p25 },
    { label: "50%", value: metrics.p50 },
    { label: "75%", value: metrics.p75 },
    { label: "100%", value: metrics.p100 },
  ];
  if (data.every((d) => d.value === 0)) return null;

  return (
    <div className="inline-block" title={`25%: ${fmtNumber(metrics.p25)} → 50%: ${fmtNumber(metrics.p50)} → 75%: ${fmtNumber(metrics.p75)} → 100%: ${fmtNumber(metrics.p100)}`}>
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

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

// ============================================================
// FUNNEL CHART
// ============================================================

const FUNNEL_COLORS = ["hsl(200 80% 60%)", "hsl(47 98% 54%)", "hsl(142 70% 45%)", "hsl(210 80% 55%)", "hsl(45 93% 47%)"];

function FunnelChart({ data }: { data: CampaignAnalyticsResponse }) {
  const totals = data.campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      leads: acc.leads + (c.leads ?? 0),
      qualified: acc.qualified + (c.qualifiedLeads ?? 0),
      sales: acc.sales + (c.sales ?? 0),
    }),
    { impressions: 0, clicks: 0, leads: 0, qualified: 0, sales: 0 }
  );

  const stages = [
    { name: "Impressões", value: totals.impressions, rate: null as string | null },
    { name: "Cliques", value: totals.clicks, rate: totals.impressions > 0 ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}%` : null },
  ];
  if (data.hasCrm) {
    stages.push({ name: "Leads", value: totals.leads, rate: totals.clicks > 0 ? `${((totals.leads / totals.clicks) * 100).toFixed(1)}%` : null });
  }
  if (data.hasQualification) {
    stages.push({ name: "Qualificados", value: totals.qualified, rate: totals.leads > 0 ? `${((totals.qualified / totals.leads) * 100).toFixed(1)}%` : null });
  }
  if (data.hasSales) {
    const prev = data.hasQualification ? totals.qualified : totals.leads;
    stages.push({ name: "Vendas", value: totals.sales, rate: prev > 0 ? `${((totals.sales / prev) * 100).toFixed(1)}%` : null });
  }

  if (stages.length <= 2) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">Funil de Conversão</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={stages} layout="vertical" margin={{ left: 80, right: 60 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {stages.map((_, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-4 mt-2 px-2">
        {stages.map((s, i) => (
          <div key={s.name} className="text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
            {s.name}: <strong className="text-foreground">{fmtNumber(s.value)}</strong>
            {s.rate && <span className="ml-1 text-muted-foreground/70">({s.rate})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SUMMARY CARDS
// ============================================================

function SummaryCards({ data }: { data: CampaignAnalyticsResponse }) {
  const totals = data.campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      leads: acc.leads + (c.leads ?? 0),
      qualified: acc.qualified + (c.qualifiedLeads ?? 0),
      sales: acc.sales + (c.sales ?? 0),
      revenue: acc.revenue + (c.revenue ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, sales: 0, revenue: 0 }
  );

  const cards: { label: string; value: string; icon: typeof DollarSign; show: boolean }[] = [
    { label: "Spend", value: fmtCurrency(totals.spend), icon: DollarSign, show: true },
    { label: "Impressões", value: fmtNumber(totals.impressions), icon: Eye, show: true },
    { label: "Cliques", value: fmtNumber(totals.clicks), icon: MousePointerClick, show: true },
    { label: "CTR", value: fmtPercent(totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0), icon: Percent, show: true },
    { label: "Leads", value: fmtNumber(totals.leads), icon: Users, show: data.hasCrm },
    { label: "CPL", value: fmtCurrency(totals.leads > 0 ? totals.spend / totals.leads : null), icon: DollarSign, show: data.hasCrm },
    { label: "Qualificados", value: fmtNumber(totals.qualified), icon: Users, show: data.hasQualification },
    { label: "CPL Qual", value: fmtCurrency(totals.qualified > 0 ? totals.spend / totals.qualified : null), icon: DollarSign, show: data.hasQualification },
    { label: "Vendas", value: fmtNumber(totals.sales), icon: ShoppingCart, show: data.hasSales },
    { label: "ROAS", value: fmtRoas(totals.spend > 0 ? totals.revenue / totals.spend : null), icon: TrendingUp, show: data.hasSales },
  ];

  const visible = cards.filter((c) => c.show);

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      {visible.map((card) => (
        <div key={card.label} className="rounded-xl border border-border/30 bg-card/60 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <card.icon className="h-3 w-3" />
            <span className="text-[11px]">{card.label}</span>
          </div>
          <p className="text-lg font-bold tracking-tight">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// DAILY CHART
// ============================================================

function DailyChart({ accountId, projectId, campaignId, days }: { accountId: string; projectId: string | null; campaignId: string | null; days: number }) {
  const { data: accountDailyData, isLoading: loadingAccount } = useMetaAdsDailyInsights(!campaignId ? accountId : null, days);
  const { data: campaignDailyData, isLoading: loadingCampaign } = useCampaignDailyInsights(projectId, campaignId, days);

  const isLoading = campaignId ? loadingCampaign : loadingAccount;
  const dailyData = campaignId ? campaignDailyData : accountDailyData;

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!dailyData || dailyData.length === 0) return null;

  const chartData = dailyData.map((d) => ({
    date: d.date_start.slice(5, 10),
    spend: safeNum(d.spend),
    clicks: safeNum(d.clicks),
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">Spend & Cliques Diários</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis yAxisId="spend" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
          <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
          <Legend />
          <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Spend (R$)" />
          <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke="hsl(200 80% 60%)" strokeWidth={2} dot={false} name="Cliques" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// CAMPAIGN TABLE (MASTER)
// ============================================================

type SortKey = keyof CampaignAnalytics;

function CampaignTable({
  data,
  projectId,
  days,
}: {
  data: CampaignAnalyticsResponse;
  projectId: string;
  days: number;
}) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortCol) return data.campaigns;
    return [...data.campaigns].sort((a, b) => {
      const av = a[sortCol] ?? -Infinity;
      const bv = b[sortCol] ?? -Infinity;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
  }, [data.campaigns, sortCol, sortDir]);

  // Find best/worst for highlights
  const bestWorst = useMemo(() => {
    const campaigns = data.campaigns.filter((c) => c.spend > 0);
    if (campaigns.length < 2) return { bestCpl: "", worstCpl: "", bestRoas: "", worstRoas: "" };
    const byCpl = campaigns.filter((c) => c.cpl !== null).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0));
    const byRoas = campaigns.filter((c) => c.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    return {
      bestCpl: byCpl[0]?.campaignId ?? "",
      worstCpl: byCpl[byCpl.length - 1]?.campaignId ?? "",
      bestRoas: byRoas[0]?.campaignId ?? "",
      worstRoas: byRoas[byRoas.length - 1]?.campaignId ?? "",
    };
  }, [data.campaigns]);

  if (data.campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-8 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma campanha ativa neste período</p>
      </div>
    );
  }

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
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

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Campanhas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Nome</th>
              <SortHeader label="Spend" col="spend" />
              <SortHeader label="Impr" col="impressions" />
              <SortHeader label="Clicks" col="clicks" />
              <SortHeader label="CTR" col="ctr" />
              <SortHeader label="CPC" col="cpc" />
              <SortHeader label="CPM" col="cpm" />
              {data.hasCrm && <SortHeader label="Leads" col="leads" />}
              {data.hasCrm && <SortHeader label="CPL" col="cpl" />}
              {data.hasQualification && <SortHeader label="Qual" col="qualifiedLeads" />}
              {data.hasQualification && <SortHeader label="CPL Q" col="cplQualified" />}
              {data.hasSales && <SortHeader label="Vendas" col="sales" />}
              {data.hasSales && <SortHeader label="C/Venda" col="costPerSale" />}
              {data.hasSales && <SortHeader label="ROAS" col="roas" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isExpanded = expandedCampaign === c.campaignId;
              const cplHighlight = c.campaignId === bestWorst.bestCpl ? "text-green-500" : c.campaignId === bestWorst.worstCpl ? "text-red-400" : "";
              const roasHighlight = c.campaignId === bestWorst.bestRoas ? "text-green-500" : c.campaignId === bestWorst.worstRoas ? "text-red-400" : "";

              return (
                <CampaignRowMaster
                  key={c.campaignId}
                  c={c}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedCampaign(isExpanded ? null : c.campaignId)}
                  hasCrm={data.hasCrm}
                  hasQual={data.hasQualification}
                  hasSales={data.hasSales}
                  cplHighlight={cplHighlight}
                  roasHighlight={roasHighlight}
                  projectId={projectId}
                  days={days}
                />
              );
            })}
            {/* Unattributed row */}
            {(data.unattributedLeads > 0 || data.unattributedSales.count > 0) && (
              <tr className="border-t border-border/20 bg-muted/10 italic text-muted-foreground">
                <td className="py-2 px-3 text-xs">Sem atribuição</td>
                <td colSpan={6} />
                {data.hasCrm && <td className="py-2 px-2 text-xs text-right">{data.unattributedLeads}</td>}
                {data.hasCrm && <td />}
                {data.hasQualification && <><td /><td /></>}
                {data.hasSales && <td className="py-2 px-2 text-xs text-right">{data.unattributedSales.count}</td>}
                {data.hasSales && <><td /><td /></>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignRowMaster({
  c,
  isExpanded,
  onToggle,
  hasCrm,
  hasQual,
  hasSales,
  cplHighlight,
  roasHighlight,
  projectId,
  days,
}: {
  c: CampaignAnalytics;
  isExpanded: boolean;
  onToggle: () => void;
  hasCrm: boolean;
  hasQual: boolean;
  hasSales: boolean;
  cplHighlight: string;
  roasHighlight: string;
  projectId: string;
  days: number;
}) {
  return (
    <>
      <tr className="border-t border-border/20 hover:bg-muted/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-2 px-3 text-xs font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {c.campaignName}
          </span>
        </td>
        <td className="py-2 px-2 text-xs text-right font-medium">{fmtCurrency(c.spend)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.impressions)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.clicks)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.ctr)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpc)}</td>
        <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpm)}</td>
        {hasCrm && <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.leads)}</td>}
        {hasCrm && <td className={`py-2 px-2 text-xs text-right ${cplHighlight}`}>{fmtCurrency(c.cpl)}</td>}
        {hasQual && <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.qualifiedLeads)}</td>}
        {hasQual && <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cplQualified)}</td>}
        {hasSales && <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.sales)}</td>}
        {hasSales && <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.costPerSale)}</td>}
        {hasSales && <td className={`py-2 px-2 text-xs text-right font-medium ${roasHighlight}`}>{fmtRoas(c.roas)}</td>}
      </tr>
      {isExpanded && (
        <DrillDownAdSets projectId={projectId} campaignId={c.campaignId} days={days} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales} />
      )}
    </>
  );
}

// ============================================================
// DRILL-DOWN
// ============================================================

function DrillDownAdSets({ projectId, campaignId, days, hasCrm, hasQual, hasSales }: { projectId: string; campaignId: string; days: number; hasCrm: boolean; hasQual: boolean; hasSales: boolean }) {
  const { data, isLoading } = useTrafficAdSets(projectId, campaignId, days);
  const [expanded, setExpanded] = useState<string | null>(null);
  const colSpan = 7 + (hasCrm ? 2 : 0) + (hasQual ? 2 : 0) + (hasSales ? 3 : 0);

  if (isLoading) return <tr><td colSpan={colSpan} className="py-2 px-4"><Skeleton className="h-8" /></td></tr>;
  if (!data || data.adsets.length === 0) return <tr><td colSpan={colSpan} className="py-2 px-8 text-xs text-muted-foreground">Nenhum ad set</td></tr>;

  return (
    <>
      {data.adsets.map((a) => (
        <DrillDownRow key={a.campaignId} item={a} level={1} isExpanded={expanded === a.campaignId} onToggle={() => setExpanded(expanded === a.campaignId ? null : a.campaignId)} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales}>
          {expanded === a.campaignId && <DrillDownAds projectId={projectId} adsetId={a.campaignId} days={days} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales} />}
        </DrillDownRow>
      ))}
    </>
  );
}

function DrillDownAds({ projectId, adsetId, days, hasCrm, hasQual, hasSales }: { projectId: string; adsetId: string; days: number; hasCrm: boolean; hasQual: boolean; hasSales: boolean }) {
  const { data, isLoading } = useTrafficAds(projectId, adsetId, days);
  const [lightboxAd, setLightboxAd] = useState<(CampaignAnalytics & { creative: import("@/lib/hooks/use-traffic-analytics").MetaAdCreative | null }) | null>(null);
  const colSpan = 7 + (hasCrm ? 2 : 0) + (hasQual ? 2 : 0) + (hasSales ? 3 : 0);

  if (isLoading) return <tr><td colSpan={colSpan} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data || data.ads.length === 0) return <tr><td colSpan={colSpan} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  return (
    <>
      {data.ads.map((a) => (
        <DrillDownRow key={a.campaignId} item={a} level={2} isExpanded={false} onToggle={() => {}} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales} creative={a.creative} videoMetrics={a.videoMetrics} onCreativeClick={() => setLightboxAd(a)} />
      ))}
      {/* Lightbox (Story 8.4) */}
      {lightboxAd?.creative && (
        <tr><td colSpan={colSpan} className="p-0">
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLightboxAd(null)} onKeyDown={(e) => e.key === "Escape" && setLightboxAd(null)}>
            <div className="bg-card border border-border rounded-2xl shadow-xl max-w-lg w-full m-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <CreativeTypeBadge objectType={lightboxAd.creative.objectType} />
                  <span className="text-sm font-medium truncate">{lightboxAd.campaignName}</span>
                </div>
                <button onClick={() => setLightboxAd(null)} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <img
                src={lightboxAd.creative.imageUrl || lightboxAd.creative.thumbnailUrl || ""}
                alt={lightboxAd.campaignName}
                className="w-full max-h-[60vh] object-contain bg-black/5"
              />
              <div className="p-4 space-y-2">
                {lightboxAd.creative.title && <p className="text-sm font-medium">{lightboxAd.creative.title}</p>}
                {lightboxAd.creative.body && <p className="text-xs text-muted-foreground">{lightboxAd.creative.body}</p>}
                {lightboxAd.creative.objectType === "VIDEO" && (
                  <a
                    href={`https://www.facebook.com/ads/library/?id=${lightboxAd.campaignId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    <Play className="h-3 w-3" /> Ver no Meta
                  </a>
                )}
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

function DrillDownRow({ item, level, isExpanded, onToggle, hasCrm, hasQual, hasSales, children, creative, videoMetrics, onCreativeClick }: {
  item: CampaignAnalytics; level: 1 | 2; isExpanded: boolean; onToggle: () => void;
  hasCrm: boolean; hasQual: boolean; hasSales: boolean; children?: React.ReactNode;
  creative?: { thumbnailUrl: string | null; objectType: string | null } | null;
  videoMetrics?: VideoMetrics | null;
  onCreativeClick?: () => void;
}) {
  const pl = level === 1 ? "pl-8" : "pl-14";
  const bg = level === 1 ? "bg-muted/20" : "bg-muted/10";

  return (
    <>
      <tr className={`border-t border-border/10 ${bg} hover:bg-muted/40 cursor-pointer`} onClick={onToggle}>
        <td className={`py-1.5 px-3 text-[11px] ${pl}`}>
          <span className="inline-flex items-center gap-2">
            {level === 1 && (isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />)}
            {/* Ad thumbnail (Story 8.4) */}
            {level === 2 && creative?.thumbnailUrl ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCreativeClick?.(); }}
                className="relative shrink-0 rounded overflow-hidden"
              >
                <img src={creative.thumbnailUrl} alt="" className="w-10 h-10 object-cover" />
                {creative.objectType === "VIDEO" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="h-3 w-3 text-white fill-white drop-shadow" />
                  </div>
                )}
              </button>
            ) : level === 2 ? (
              <div className="w-10 h-10 rounded bg-muted/40 flex items-center justify-center shrink-0">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            ) : null}
            <span className="truncate">{item.campaignName}</span>
            {level === 2 && creative?.objectType && <CreativeTypeBadge objectType={creative.objectType} />}
            {level === 2 && videoMetrics && <VideoRetentionSparkline metrics={videoMetrics} />}
          </span>
        </td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.spend)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.impressions)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.clicks)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtPercent(item.ctr)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.cpc)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.cpm)}</td>
        {hasCrm && <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.leads)}</td>}
        {hasCrm && <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.cpl)}</td>}
        {hasQual && <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.qualifiedLeads)}</td>}
        {hasQual && <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.cplQualified)}</td>}
        {hasSales && <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.sales)}</td>}
        {hasSales && <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.costPerSale)}</td>}
        {hasSales && <td className="py-1.5 px-2 text-[11px] text-right">{fmtRoas(item.roas)}</td>}
      </tr>
      {children}
    </>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

// ============================================================
// TOP PERFORMERS (Story 7.8)
// ============================================================

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

const RANK_STYLES = [
  "ring-2 ring-yellow-500/60",  // #1 gold
  "ring-1 ring-gray-400/40",    // #2 silver
  "ring-1 ring-amber-600/30",   // #3 bronze
  "",                            // #4
  "",                            // #5
];

function CreativeTypeBadge({ objectType }: { objectType: string | null }) {
  if (!objectType) return null;
  const label = objectType === "VIDEO" ? "Video" : objectType === "CAROUSEL" ? "Carousel" : "Imagem";
  return <Badge variant="outline" className="text-[9px] px-1 py-0">{label}</Badge>;
}

function TopPerformersSection({ projectId, days, campaignId }: { projectId: string; days: number; campaignId?: string | null }) {
  const [metric, setMetric] = useState<TopPerformerMetric>("roas");
  const { data, isLoading } = useTopPerformers(projectId, metric, 5, days, campaignId);

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

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Top Performers — {metricLabel}</h3>
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
      <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {data.topPerformers.map((ad, i) => (
          <div
            key={ad.campaignId}
            className={`rounded-lg border border-border/20 bg-muted/20 overflow-hidden ${RANK_STYLES[i] ?? ""}`}
            title={ad.creative?.title && ad.creative?.body ? `${ad.creative.title}\n\n${ad.creative.body}` : undefined}
          >
            {/* Thumbnail */}
            <div className="relative aspect-square bg-muted/40 max-h-[200px]">
              {ad.creative?.thumbnailUrl ? (
                <>
                  <img
                    src={ad.creative.thumbnailUrl}
                    alt={ad.campaignName}
                    className="w-full h-full object-cover"
                  />
                  {ad.creative.objectType === "VIDEO" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-black/50 p-2">
                        <Play className="h-5 w-5 text-white fill-white" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
            </div>
            {/* Info */}
            <div className="p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{medals[i] ?? `${i + 1}.`}</span>
                <CreativeTypeBadge objectType={ad.creative?.objectType ?? null} />
              </div>
              <p className="text-xs font-medium truncate">{ad.campaignName}</p>
              <p className="text-lg font-bold tracking-tight">{formatMetricValue(ad, metric)}</p>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <p>Adset: {ad.adsetName}</p>
                <p>Campanha: {ad.parentCampaignName}</p>
                <p>Spend: {fmtCurrency(ad.spend)}</p>
              </div>
              {/* Video retention sparkline (Story 8.6) */}
              {ad.videoMetrics && <VideoRetentionSparkline metrics={ad.videoMetrics} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CREATIVE RANKING CHART (Story 8.5)
// ============================================================

const RANKING_COLORS = [
  "hsl(142 70% 45%)", "hsl(142 60% 50%)", "hsl(150 50% 52%)", "hsl(160 40% 55%)",
  "hsl(45 80% 55%)", "hsl(35 70% 55%)", "hsl(25 65% 55%)", "hsl(15 60% 50%)",
  "hsl(5 60% 50%)", "hsl(0 65% 50%)",
];

function CreativeRankingChart({ projectId, days, campaignId }: { projectId: string; days: number; campaignId?: string | null }) {
  const [metric, setMetric] = useState<TopPerformerMetric>("roas");
  const [onlyWithCreatives, setOnlyWithCreatives] = useState(false);
  const { data, isLoading } = useTopPerformers(projectId, metric, 10, days, campaignId);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!data || data.topPerformers.length < 2) return null;

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;
  const performers = onlyWithCreatives
    ? data.topPerformers.filter((ad) => ad.creative?.thumbnailUrl)
    : data.topPerformers;

  if (performers.length === 0) return null;

  const chartData = performers.map((ad, i) => ({
    name: ad.campaignName.length > 25 ? ad.campaignName.slice(0, 25) + "…" : ad.campaignName,
    value: (() => {
      switch (metric) {
        case "roas": return ad.roas ?? 0;
        case "cpl": return ad.cpl ?? 0;
        case "cplQualified": return ad.cplQualified ?? 0;
        case "leads": return ad.leads ?? 0;
        case "sales": return ad.sales ?? 0;
        case "ctr": return ad.ctr ?? 0;
        default: return 0;
      }
    })(),
    fullName: ad.campaignName,
    adsetName: ad.adsetName,
    parentCampaignName: ad.parentCampaignName,
    spend: ad.spend,
    color: RANKING_COLORS[i] ?? RANKING_COLORS[RANKING_COLORS.length - 1],
    thumbnail: ad.creative?.thumbnailUrl ?? null,
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Comparativo de Criativos — {metricLabel}</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={onlyWithCreatives} onChange={(e) => setOnlyWithCreatives(e.target.checked)} className="rounded border-border" />
            Apenas com criativos
          </label>
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
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, performers.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 140, right: 60 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            width={135}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
            formatter={(value) => {
              const v = Number(value);
              return metric === "roas" ? fmtRoas(v) : metric === "ctr" ? fmtPercent(v) : ["cpl", "cplQualified"].includes(metric) ? fmtCurrency(v) : fmtNumber(v);
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// PLACEMENT BREAKDOWN (Story 8.7)
// ============================================================

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

function PlacementBreakdownSection({ projectId, days }: { projectId: string; days: number }) {
  const { data, isLoading } = usePlacementBreakdown(projectId, days);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!data || data.placements.length === 0) return null;

  const placements = data.placements;
  const grouped = new Map<string, PlacementInsight[]>();
  for (const p of placements) {
    const list = grouped.get(p.platform) ?? [];
    list.push(p);
    grouped.set(p.platform, list);
  }

  const bestCpc = placements.reduce((b, p) => (p.cpc > 0 && (b === null || p.cpc < b.cpc)) ? p : b, null as PlacementInsight | null);
  const bestCtr = placements.reduce((b, p) => p.ctr > (b?.ctr ?? 0) ? p : b, null as PlacementInsight | null);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Performance por Posicionamento</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3">Posição</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Spend</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Impr</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Clicks</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CTR</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPC</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPM</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([platform, items]) => (
              items.map((p, i) => (
                <tr key={`${platform}-${p.position}`} className="border-t border-border/10 hover:bg-muted/20">
                  <td className="py-1.5 px-3 text-[11px]">
                    {i === 0 && <span className="text-muted-foreground font-medium mr-1.5">{PLATFORM_LABELS[platform] ?? platform}</span>}
                    <span className={i === 0 ? "" : "pl-4"}>{p.position.replace(/_/g, " ")}</span>
                  </td>
                  <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(p.spend)}</td>
                  <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(p.impressions)}</td>
                  <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(p.clicks)}</td>
                  <td className={`py-1.5 px-2 text-[11px] text-right ${bestCtr && p.platform === bestCtr.platform && p.position === bestCtr.position ? "text-green-500 font-medium" : ""}`}>
                    {fmtPercent(p.ctr)}
                  </td>
                  <td className={`py-1.5 px-2 text-[11px] text-right ${bestCpc && p.platform === bestCpc.platform && p.position === bestCpc.position ? "text-green-500 font-medium" : ""}`}>
                    {fmtCurrency(p.cpc)}
                  </td>
                  <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(p.cpm)}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// CSV EXPORT (Story 8.8)
// ============================================================

function exportCsv(campaigns: CampaignAnalytics[], hasCrm: boolean, hasQual: boolean, hasSales: boolean) {
  const headers = ["Nome", "Spend", "Impressoes", "Cliques", "CTR", "CPC", "CPM"];
  if (hasCrm) headers.push("Leads", "CPL");
  if (hasQual) headers.push("Qualificados", "CPL Qual");
  if (hasSales) headers.push("Vendas", "Custo/Venda", "ROAS");

  const rows = campaigns.map((c) => {
    const row = [
      c.campaignName,
      c.spend.toFixed(2).replace(".", ","),
      String(c.impressions),
      String(c.clicks),
      c.ctr.toFixed(2).replace(".", ","),
      c.cpc.toFixed(2).replace(".", ","),
      c.cpm.toFixed(2).replace(".", ","),
    ];
    if (hasCrm) {
      row.push(c.leads !== null ? String(c.leads) : "");
      row.push(c.cpl !== null ? c.cpl.toFixed(2).replace(".", ",") : "");
    }
    if (hasQual) {
      row.push(c.qualifiedLeads !== null ? String(c.qualifiedLeads) : "");
      row.push(c.cplQualified !== null ? c.cplQualified.toFixed(2).replace(".", ",") : "");
    }
    if (hasSales) {
      row.push(c.sales !== null ? String(c.sales) : "");
      row.push(c.costPerSale !== null ? c.costPerSale.toFixed(2).replace(".", ",") : "");
      row.push(c.roas !== null ? c.roas.toFixed(2).replace(".", ",") : "");
    }
    return row;
  });

  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const now = new Date().toISOString().slice(0, 10);
  a.download = `loyola-traffic-${now}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ADSET FILTER (Story 7.8)
// ============================================================

function AdSetFilterDropdown({
  projectId,
  days,
  value,
  onChange,
}: {
  projectId: string;
  days: number;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data } = useAllAdSets(projectId, days);
  if (!data || data.adsets.length === 0) return null;

  return (
    <Select value={value ?? "__all__"} onValueChange={(v) => onChange(v === "__all__" ? null : v)}>
      <SelectTrigger className="h-8 w-[200px] text-xs">
        <SelectValue placeholder="Todos Ad Sets" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos Ad Sets</SelectItem>
        {data.adsets.map((a) => (
          <SelectItem key={a.campaignId} value={a.campaignId}>
            {a.campaignName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function TrafficPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: accounts, isLoading: loadingAccounts } = useMetaAdsAccounts();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Auto-select first account
  const activeAccountId = selectedAccountId ?? accounts?.[0]?.id ?? null;

  // Get project linked to selected account
  const linkedProjects = accounts?.find((a) => a.id === activeAccountId)?.projects ?? [];
  const activeProjectId = selectedProjectId ?? linkedProjects[0]?.projectId ?? null;

  const { data: campaignData, isLoading: loadingCampaigns } = useTrafficCampaigns(activeProjectId, days);
  const { data: sheetsConnection, error: sheetsError } = useGoogleSheetsConnection(activeProjectId);
  const hasSheets = !!sheetsConnection && !sheetsError;
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);

  // Filters from URL state (Story 8.3)
  const filterCampaignId = searchParams.get("campaign") ?? null;
  const filterAdsetId = searchParams.get("adset") ?? null;

  const updateFilters = useCallback((campaign: string | null, adset: string | null) => {
    const params = new URLSearchParams();
    if (campaign) params.set("campaign", campaign);
    if (adset) params.set("adset", adset);
    const qs = params.toString();
    router.replace(`/traffic${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router]);

  const setFilterCampaignId = useCallback((id: string | null) => {
    updateFilters(id, id ? filterAdsetId : null);
  }, [updateFilters, filterAdsetId]);

  const setFilterAdsetId = useCallback((id: string | null) => {
    updateFilters(filterCampaignId, id);
  }, [updateFilters, filterCampaignId]);

  const clearFilters = useCallback(() => {
    updateFilters(null, null);
  }, [updateFilters]);

  const hasActiveFilters = filterCampaignId !== null || filterAdsetId !== null;

  // Filter campaigns by campaign filter (Story 8.3)
  const filteredCampaignData = useMemo(() => {
    if (!campaignData) return campaignData;
    if (!filterCampaignId) return campaignData;
    const filtered = campaignData.campaigns.filter((c) => c.campaignId === filterCampaignId);
    return { ...campaignData, campaigns: filtered };
  }, [campaignData, filterCampaignId]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand/60 mb-0.5">Loyola X · Tráfego</p>
          <h1 className="text-2xl font-bold tracking-tight">Full Funnel Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          {campaignData && campaignData.campaigns.length > 0 && (
            <button
              onClick={() => exportCsv(filteredCampaignData?.campaigns ?? campaignData.campaigns, campaignData.hasCrm, campaignData.hasQualification, campaignData.hasSales)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          )}
          <Link href="/settings/traffic" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="h-3.5 w-3.5" /> Configurar
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loadingAccounts && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-96 rounded-lg" />
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        </div>
      )}

      {/* Empty */}
      {!loadingAccounts && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-12 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium text-lg">Nenhuma conta de anúncios</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Conecte uma conta Meta Ads para começar.</p>
          <Link href="/settings/traffic" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors">
            <Settings className="h-4 w-4" /> Ir para Settings
          </Link>
        </div>
      )}

      {/* Dashboard */}
      {accounts && accounts.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={activeAccountId ?? ""}
              onChange={(e) => { setSelectedAccountId(e.target.value); setSelectedProjectId(null); }}
              className="rounded-lg border border-border/40 bg-card px-3 py-2 text-sm"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.accountName}</option>
              ))}
            </select>

            {linkedProjects.length > 0 && (
              <select
                value={activeProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="rounded-lg border border-border/40 bg-card px-3 py-2 text-sm"
              >
                {linkedProjects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
                ))}
              </select>
            )}

            {/* Badges + Sheets config */}
            {activeProjectId && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">Mídia</Badge>
                {campaignData?.hasCrm && <Badge className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">CRM</Badge>}
                {campaignData?.hasQualification && <Badge className="text-[10px] bg-blue-500/20 text-blue-600 border-blue-500/30">Qualificação</Badge>}
                {campaignData?.hasSales && <Badge className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Vendas</Badge>}
                <button
                  onClick={() => setSheetsModalOpen(true)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                    hasSheets
                      ? "border-green-500/30 text-green-600 hover:bg-green-500/10"
                      : "border-border/40 text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  {hasSheets ? "Planilha" : "Conectar planilha"}
                </button>
              </div>
            )}

            {/* Campaign filter (Story 8.3) */}
            {activeProjectId && campaignData && campaignData.campaigns.length > 0 && (
              <Select value={filterCampaignId ?? "__all__"} onValueChange={(v) => setFilterCampaignId(v === "__all__" ? null : v)}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Todas Campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas Campanhas</SelectItem>
                  {campaignData.campaigns.map((c) => (
                    <SelectItem key={c.campaignId} value={c.campaignId}>
                      {c.campaignName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Adset filter */}
            {activeProjectId && (
              <AdSetFilterDropdown
                projectId={activeProjectId}
                days={days}
                value={filterAdsetId}
                onChange={setFilterAdsetId}
              />
            )}

            {/* Clear filters (Story 8.3) */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}

            <div className="flex rounded-lg border border-border/40 overflow-hidden ml-auto">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${days === opt.value ? "bg-brand text-brand-foreground" : "bg-card hover:bg-muted/50 text-muted-foreground"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {loadingCampaigns && (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-60 rounded-xl" />
            </div>
          )}

          {/* CTA: connect spreadsheet */}
          {activeProjectId && !hasSheets && !loadingCampaigns && (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/40 p-5 flex items-center gap-4">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Conecte uma planilha do Google Sheets</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Para cruzar leads, qualificação e vendas com as campanhas deste projeto.
                </p>
              </div>
              <Button size="sm" onClick={() => setSheetsModalOpen(true)}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Conectar
              </Button>
            </div>
          )}

          {campaignData && (
            <>
              <SummaryCards data={filteredCampaignData!} />
              {activeProjectId && <TopPerformersSection projectId={activeProjectId} days={days} campaignId={filterCampaignId} />}
              {activeProjectId && <CreativeRankingChart projectId={activeProjectId} days={days} campaignId={filterCampaignId} />}
              <FunnelChart data={filteredCampaignData!} />
              {activeAccountId && <DailyChart accountId={activeAccountId} projectId={activeProjectId} campaignId={filterCampaignId} days={days} />}
              <CampaignTable data={filteredCampaignData!} projectId={activeProjectId!} days={days} />
              {activeProjectId && <PlacementBreakdownSection projectId={activeProjectId} days={days} />}
            </>
          )}

          {/* No project linked */}
          {!activeProjectId && linkedProjects.length === 0 && (
            <div className="rounded-xl border border-border/30 bg-card/60 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Vincule um projeto a esta conta em{" "}
                <Link href="/settings/traffic" className="text-brand hover:underline">Settings</Link>{" "}
                para ver analytics cruzados.
              </p>
            </div>
          )}

          {/* Sheets config modal */}
          {sheetsModalOpen && activeProjectId && (
            <SheetsConfigModal
              projectId={activeProjectId}
              connection={hasSheets ? sheetsConnection : null}
              onClose={() => setSheetsModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// SHEETS CONFIG MODAL
// ============================================================

const REQUIRED_COLUMNS: Record<string, { field: string; label: string }[]> = {
  leads: [
    { field: "utmCampaign", label: "UTM Campaign" },
    { field: "utmMedium", label: "UTM Medium" },
    { field: "utmContent", label: "UTM Content" },
  ],
  sales: [
    { field: "utmCampaign", label: "UTM Campaign" },
    { field: "utmMedium", label: "UTM Medium" },
    { field: "utmContent", label: "UTM Content" },
    { field: "valor", label: "Valor da venda" },
  ],
  survey: [],
};

const DATA_NEEDS = [
  { type: "leads" as const, label: "Leads / CRM", description: "Leads com UTMs para cruzar com campanhas" },
  { type: "survey" as const, label: "Pesquisa", description: "Respostas para qualificar leads" },
  { type: "sales" as const, label: "Vendas", description: "Vendas para calcular ROAS real" },
];

function SheetsConfigModal({
  projectId,
  connection,
  onClose,
}: {
  projectId: string;
  connection: { id: string; projectId: string; spreadsheetName: string; tabMappings: { tabName: string; tabType: string; columnMapping: Record<string, string> }[] } | null;
  onClose: () => void;
}) {
  const connectSheet = useConnectGoogleSheet();
  const deleteSheet = useDeleteGoogleSheetsConnection();
  const mapTabs = useMapSheetTabs();
  const aiAnalyze = useAIAnalyzeSheet();

  const [sheetUrl, setSheetUrl] = useState("");
  const [connectError, setConnectError] = useState("");
  const [aiExplanation, setAiExplanation] = useState("");

  // After connection, fetch available tabs
  const { data: availableTabs } = useAvailableTabs(connection?.id ?? null);
  const tabs = availableTabs?.tabs ?? [];

  // Tab selections state
  const [selections, setSelections] = useState<Record<string, { tabName: string; columnMapping: Record<string, string> }>>(() => {
    const init: Record<string, { tabName: string; columnMapping: Record<string, string> }> = {};
    for (const m of connection?.tabMappings ?? []) {
      init[m.tabType] = { tabName: m.tabName, columnMapping: m.columnMapping as Record<string, string> };
    }
    return init;
  });

  // Preview for column mapping
  const [previewType, setPreviewType] = useState<string | null>(null);
  const previewTabName = previewType ? selections[previewType]?.tabName : null;
  const { data: preview } = useSheetTabPreview(
    previewTabName ? connection?.id ?? null : null,
    previewTabName
  );
  const previewHeaders = (previewType && preview?.headers) ? preview.headers.filter(Boolean) : [];

  // Survey fields
  const [newSurveyField, setNewSurveyField] = useState("");

  function handleConnect() {
    setConnectError("");
    if (!sheetUrl.trim()) {
      setConnectError("Cole a URL da planilha.");
      return;
    }
    connectSheet.mutate(
      { projectId, spreadsheetUrl: sheetUrl.trim() },
      {
        onSuccess: () => {
          toast.success("Planilha conectada!");
          setSheetUrl("");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erro ao conectar.";
          setConnectError(msg);
        },
      }
    );
  }

  function handleSelectTab(type: string, tabName: string) {
    setSelections((prev) => ({
      ...prev,
      [type]: { tabName, columnMapping: prev[type]?.columnMapping ?? {} },
    }));
    setPreviewType(type);
  }

  function handleMapColumn(type: string, field: string, value: string) {
    setSelections((prev) => ({
      ...prev,
      [type]: { ...prev[type], columnMapping: { ...prev[type]?.columnMapping, [field]: value } },
    }));
  }

  function handleSave() {
    if (!connection) return;
    const mappings: TabMappingInput[] = [];
    for (const [type, sel] of Object.entries(selections)) {
      if (sel.tabName) {
        mappings.push({ tabName: sel.tabName, tabType: type as "leads" | "survey" | "sales", columnMapping: sel.columnMapping });
      }
    }
    if (mappings.length === 0) {
      toast.error("Selecione pelo menos uma aba.");
      return;
    }
    mapTabs.mutate(
      { connectionId: connection.id, projectId, mappings },
      {
        onSuccess: () => { toast.success("Mapeamento salvo!"); onClose(); },
        onError: () => toast.error("Erro ao salvar."),
      }
    );
  }

  function handleDisconnect() {
    if (!connection) return;
    deleteSheet.mutate(
      { id: connection.id, projectId },
      {
        onSuccess: () => { toast.success("Planilha desconectada."); onClose(); },
        onError: () => toast.error("Erro ao desconectar."),
      }
    );
  }

  function handleAIAnalyze() {
    if (!connection) return;
    setAiExplanation("");
    aiAnalyze.mutate(connection.id, {
      onSuccess: (data) => {
        // Apply AI suggestions to selections
        const newSelections: Record<string, { tabName: string; columnMapping: Record<string, string> }> = {};
        for (const m of data.mappings) {
          newSelections[m.tabType] = { tabName: m.tabName, columnMapping: m.columnMapping };
        }
        setSelections(newSelections);
        setAiExplanation(data.explanation);
        toast.success(`IA identificou ${data.mappings.length} aba(s). Revise e salve.`);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Erro ao analisar planilha.");
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            <h2 className="text-lg font-bold">Google Sheets</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Connect sheet */}
          {!connection && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cole a URL da planilha do Google Sheets. Certifique-se de compartilhá-la com a Service Account.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleConnect} disabled={connectSheet.isPending}>
                  {connectSheet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Conectar
                </Button>
              </div>
              {connectError && <p className="text-sm text-destructive">{connectError}</p>}
            </div>
          )}

          {/* Step 2: Connected — map tabs */}
          {connection && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">Conectada</Badge>
                  <span className="text-sm font-medium">{connection.spreadsheetName}</span>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive/70 hover:text-destructive text-xs" onClick={handleDisconnect}>
                  <Trash2 className="h-3 w-3" /> Desconectar
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Selecione qual aba corresponde a cada tipo de dado, ou deixe a IA mapear:
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={handleAIAnalyze}
                  disabled={aiAnalyze.isPending}
                >
                  {aiAnalyze.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  Mapear com IA
                </Button>
              </div>
              {aiExplanation && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2">
                  <p className="text-xs text-green-700">{aiExplanation}</p>
                </div>
              )}

              {DATA_NEEDS.map((need) => {
                const sel = selections[need.type];
                const selectedTab = sel?.tabName ?? "";
                const isActive = previewType === need.type;
                const cols = REQUIRED_COLUMNS[need.type] ?? [];

                return (
                  <div key={need.type} className="rounded-xl border border-border/20 bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{need.label}</span>
                          {selectedTab && <Badge variant="outline" className="text-[10px]">{selectedTab}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{need.description}</p>
                      </div>
                      <Select value={selectedTab} onValueChange={(v) => handleSelectTab(need.type, v)}>
                        <SelectTrigger className="h-8 w-[170px] text-xs shrink-0">
                          <SelectValue placeholder="Aba..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tabs.filter(Boolean).map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Preview (compact) */}
                    {isActive && preview && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border border-border/20 rounded">
                          <thead>
                            <tr className="bg-muted/40">
                              {preview.headers.map((h, i) => (
                                <th key={i} className="px-2 py-1 text-left font-medium border-b border-border/20">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.slice(0, 2).map((row, ri) => (
                              <tr key={ri} className="border-b border-border/10">
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-2 py-0.5 text-muted-foreground truncate max-w-[100px]">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Column mapping — leads / sales */}
                    {selectedTab && need.type !== "survey" && cols.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {cols.map((col) => (
                          <div key={col.field} className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">{col.label}</Label>
                            <Select
                              value={sel?.columnMapping?.[col.field] ?? ""}
                              onValueChange={(v) => handleMapColumn(need.type, col.field, v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Coluna..." />
                              </SelectTrigger>
                              <SelectContent>
                                {previewHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Column mapping — survey (dynamic) */}
                    {selectedTab && need.type === "survey" && (
                      <div className="space-y-2">
                        {Object.entries(sel?.columnMapping ?? {}).map(([field, headerName]) => (
                          <div key={field} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs shrink-0">{field}</Badge>
                            <Select
                              value={headerName}
                              onValueChange={(v) => handleMapColumn("survey", field, v)}
                            >
                              <SelectTrigger className="h-7 text-xs max-w-[180px]">
                                <SelectValue placeholder="Coluna..." />
                              </SelectTrigger>
                              <SelectContent>
                                {previewHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <button
                              onClick={() => setSelections((prev) => {
                                const m = { ...prev.survey.columnMapping };
                                delete m[field];
                                return { ...prev, survey: { ...prev.survey, columnMapping: m } };
                              })}
                              className="text-destructive/60 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <Input className="h-7 text-xs max-w-[140px]" placeholder="Campo (ex: renda)" value={newSurveyField} onChange={(e) => setNewSurveyField(e.target.value)} />
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { if (newSurveyField.trim()) { handleMapColumn("survey", newSurveyField.trim(), ""); setNewSurveyField(""); } }}>
                            <Plus className="h-3 w-3" /> Adicionar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Save */}
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={mapTabs.isPending}>
                  {mapTabs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar mapeamento
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
