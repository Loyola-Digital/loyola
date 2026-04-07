"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  Radio,
  TrendingUp,
  TrendingDown,
  LinkIcon,
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
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  usePlacementBreakdown,
  useCampaignDailyInsights,
  type PlacementInsight,
} from "@/lib/hooks/use-traffic-analytics";
import { FunnelCampaignTable } from "./funnel-campaign-table";
import { TopCreativesGallery } from "./top-creatives-gallery";
import type { Funnel } from "@loyola-x/shared";

interface PerpetualDashboardProps {
  funnel: Funnel;
  projectId: string;
}

const DONUT_COLORS = [
  "hsl(45 90% 55%)", "hsl(200 80% 60%)", "hsl(150 60% 50%)",
  "hsl(280 60% 55%)", "hsl(350 70% 55%)", "hsl(30 80% 55%)",
];

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

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

export function PerpetualDashboard({ funnel, projectId }: PerpetualDashboardProps) {
  const [days, setDays] = useState(30);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  const firstCampaignId = campaignIds[0] ?? null;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: prevOverview } = useTrafficOverview(
    projectId, days * 2, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: campaignData, isLoading: campaignsLoading } = useTrafficCampaigns(projectId, days);
  const { data: placementData, isLoading: placementLoading } =
    usePlacementBreakdown(projectId, days, campaignIds.length > 0 ? campaignIds : null);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, firstCampaignId, days);

  const funnelCampaigns = useMemo(() => {
    if (!campaignData) return [];
    return campaignData.campaigns.filter((c) => campaignIdSet.has(c.campaignId));
  }, [campaignData, campaignIdSet]);

  // Period comparison
  const deltas = useMemo(() => {
    if (!overview || !prevOverview) return null;
    const prevSpend = prevOverview.totalSpend - overview.totalSpend;
    return {
      spend: prevSpend > 0 ? ((overview.totalSpend - prevSpend) / prevSpend) * 100 : null,
    };
  }, [overview, prevOverview]);

  // CPC daily trend (proxy for CPL)
  const cpcTrend = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.map((d) => {
      const spend = safeNum(d.spend);
      const clicks = safeNum(d.clicks);
      return { date: d.date_start.slice(5, 10), cpc: clicks > 0 ? spend / clicks : 0, spend };
    });
  }, [dailyData]);

  const avgCpc = useMemo(() => {
    if (cpcTrend.length === 0) return 0;
    return cpcTrend.reduce((s, d) => s + d.cpc, 0) / cpcTrend.length;
  }, [cpcTrend]);

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
      <DayRangePicker days={days} onDaysChange={setDays} />

      {/* KPI Cards with delta */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} delta={deltas?.spend} />
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
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
                <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
                <Legend wrapperStyle={{ color: "#fff" }} />
                <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Spend (R$)" />
                <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke="hsl(200 80% 60%)" strokeWidth={2} dot={false} name="Cliques" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        {/* CPC Trend */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-1">Tendência CPC</h3>
          <p className="text-xs text-muted-foreground mb-4">Linha pontilhada = média do período</p>
          {dailyLoading ? (
            <Skeleton className="h-48" />
          ) : cpcTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cpcTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v.toFixed(1)}`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "CPC"]} />
                <ReferenceLine y={avgCpc} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: `Média: R$${avgCpc.toFixed(2)}`, position: "insideTopRight", fontSize: 10, fill: "#fff" }} />
                <Line type="monotone" dataKey="cpc" stroke="hsl(200 80% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
      </div>

      {/* Top Creatives Gallery */}
      <TopCreativesGallery projectId={projectId} days={days} campaignIds={campaignIds} />

      {/* Placement donut + distribution */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">Distribuição por Placement</h3>
        {placementLoading ? (
          <Skeleton className="h-48" />
        ) : placementData?.placements && placementData.placements.length > 0 ? (
          <PlacementDonut placements={placementData.placements} />
        ) : <EmptyState />}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({ icon: Icon, label, value, delta }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold tracking-tight">{value}</p>
        {delta !== null && delta !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${delta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function PlacementDonut({ placements }: { placements: PlacementInsight[] }) {
  const data = placements.sort((a, b) => b.spend - a.spend).slice(0, 6).map((p) => ({ name: `${p.platform} / ${p.position}`, value: p.spend }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={180} height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} strokeWidth={1}>
            {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", color: "#fff" }} formatter={(v) => [fmtCurrency(Number(v)), "Spend"]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 text-xs flex-1 min-w-0">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate flex-1">{d.name}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{fmtCurrency(d.value)}</span>
            <span className="text-muted-foreground tabular-nums shrink-0 w-8 text-right">
              {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
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
