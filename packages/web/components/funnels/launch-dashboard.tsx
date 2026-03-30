"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  Radio,
  Repeat,
  TrendingUp,
  LinkIcon,
  ChevronRight,
  ChevronDown,
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  useTopPerformers,
  usePlacementBreakdown,
  useCampaignDailyInsights,
  type CampaignAnalytics,
  type PlacementInsight,
} from "@/lib/hooks/use-traffic-analytics";
import { ConversionFunnel } from "./conversion-funnel";
import { FunnelCampaignTable } from "./funnel-campaign-table";
import type { Funnel } from "@loyola-x/shared";

interface LaunchDashboardProps {
  funnel: Funnel;
  projectId: string;
}

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const DONUT_COLORS = [
  "hsl(45 90% 55%)",
  "hsl(200 80% 60%)",
  "hsl(150 60% 50%)",
  "hsl(280 60% 55%)",
  "hsl(350 70% 55%)",
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

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

function RoasBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const color =
    value >= 8 ? "bg-green-500/15 text-green-600" :
    value >= 3 ? "bg-amber-500/15 text-amber-600" :
    "bg-red-500/15 text-red-500";
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 ${color}`}>
      {value.toFixed(2)}x
    </Badge>
  );
}

export function LaunchDashboard({ funnel, projectId }: LaunchDashboardProps) {
  const [days, setDays] = useState(30);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  const firstCampaignId = campaignIds[0] ?? null;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: campaignData, isLoading: campaignsLoading } = useTrafficCampaigns(projectId, days);
  const { data: topData, isLoading: topLoading } = useTopPerformers(
    projectId, "ctr", 5, days, firstCampaignId,
  );
  const { data: placementData, isLoading: placementLoading } =
    usePlacementBreakdown(projectId, days, campaignIds.length > 0 ? campaignIds : null);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, firstCampaignId, days);

  // Filter campaign table to only funnel campaigns
  const funnelCampaigns = useMemo(() => {
    if (!campaignData) return [];
    return campaignData.campaigns.filter((c) => campaignIdSet.has(c.campaignId));
  }, [campaignData, campaignIdSet]);

  if (campaignIds.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/30 p-12 text-center space-y-2">
        <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma campanha vinculada a este funil.</p>
        <p className="text-sm text-muted-foreground">Edite o funil para vincular campanhas do Meta Ads.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-1.5">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setDays(o.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              days === o.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* KPI Cards — Meta only */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
          <KpiCard icon={Eye} label="Impressões" value={fmtNumber(overview.totalImpressions)} />
          <KpiCard icon={Radio} label="Alcance" value={fmtNumber(overview.totalReach)} />
          <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNumber(overview.totalClicks)} />
          <KpiCard icon={Percent} label="CTR" value={fmtPercent(overview.ctr)} />
          <KpiCard icon={DollarSign} label="CPC" value={fmtCurrency(overview.cpc)} />
        </div>
      ) : <EmptyState />}

      {/* Campaign Table with drill-down */}
      {campaignsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : funnelCampaigns.length > 0 ? (
        <FunnelCampaignTable campaigns={funnelCampaigns} projectId={projectId} days={days} />
      ) : null}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend daily chart */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Spend & Cliques Diários</h3>
          {dailyLoading ? (
            <Skeleton className="h-48" />
          ) : dailyData && dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData.map((d) => ({ date: d.date_start.slice(5, 10), spend: safeNum(d.spend), clicks: safeNum(d.clicks) }))}>
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
          ) : <EmptyState />}
        </div>

        {/* Top 5 campaigns donut */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Distribuição de Investimento</h3>
          {funnelCampaigns.length > 0 ? (
            <CampaignDonut campaigns={funnelCampaigns} />
          ) : <EmptyState />}
        </div>
      </div>

      {/* Conversion Funnel + Placement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Funil de Conversão</h3>
          {overview ? (
            <ConversionFunnel
              impressions={overview.totalImpressions}
              clicks={overview.totalClicks}
              leads={overview.totalLeads}
              sales={overview.totalSales}
            />
          ) : <EmptyState />}
        </div>

        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Placements</h3>
          {placementLoading ? (
            <Skeleton className="h-48" />
          ) : placementData?.placements && placementData.placements.length > 0 ? (
            <PlacementTable placements={placementData.placements} />
          ) : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
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

function CampaignDonut({ campaigns }: { campaigns: CampaignAnalytics[] }) {
  const data = campaigns
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((c) => ({ name: c.campaignName, value: c.spend }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={1}>
            {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" }} formatter={(v) => [fmtCurrency(Number(v)), "Spend"]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 text-xs flex-1 min-w-0">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate flex-1">{d.name}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">
              {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlacementTable({ placements }: { placements: PlacementInsight[] }) {
  const sorted = [...placements].sort((a, b) => b.spend - a.spend);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            <th className="text-left py-2 font-medium">Placement</th>
            <th className="text-right py-2 font-medium">Spend</th>
            <th className="text-right py-2 font-medium">Impr</th>
            <th className="text-right py-2 font-medium">CTR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={`${p.platform}-${p.position}`} className="border-b last:border-0">
              <td className="py-1.5"><span className="capitalize">{p.platform}</span> / {p.position}</td>
              <td className="text-right tabular-nums">{fmtCurrency(p.spend)}</td>
              <td className="text-right tabular-nums">{fmtNumber(p.impressions)}</td>
              <td className="text-right tabular-nums">{fmtPercent(p.ctr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
      <p className="text-xs text-muted-foreground mt-1">Tente selecionar um período diferente.</p>
    </div>
  );
}
