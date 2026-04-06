"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  MousePointerClick,
  Percent,
  LinkIcon,
  Users,
  Target,
  BarChart3,
  Link2,
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
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  useAllAdSets,
  useAllAds,
  usePlacementBreakdown,
  useCampaignDailyInsights,
  type CampaignAnalytics,
  type CampaignDailyInsight,
  type PlacementInsight,
} from "@/lib/hooks/use-traffic-analytics";
import { ConversionFunnel } from "./conversion-funnel";
import { MetricsTable } from "./metrics-table";
import { FunnelCampaignTable } from "./funnel-campaign-table";
import { TopCreativesGallery } from "./top-creatives-gallery";
import type { Funnel } from "@loyola-x/shared";

interface LaunchDashboardProps {
  funnel: Funnel;
  projectId: string;
}

const PERIOD_OPTIONS = [
  { label: "1 dia", value: 1 },
  { label: "2 dias", value: 2 },
  { label: "3 dias", value: 3 },
  { label: "5 dias", value: 5 },
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const DONUT_COLORS = [
  "hsl(45 90% 55%)",
  "hsl(200 80% 60%)",
  "hsl(150 60% 50%)",
  "hsl(280 60% 55%)",
  "hsl(350 70% 55%)",
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

export function LaunchDashboard({ funnel, projectId }: LaunchDashboardProps) {
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState("");
  const isCustom = !PERIOD_OPTIONS.find((o) => o.value === days);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  const firstCampaignId = campaignIds[0] ?? null;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: campaignData, isLoading: campaignsLoading } = useTrafficCampaigns(projectId, days);
  const cids = campaignIds.length > 0 ? campaignIds : null;
  const { data: adsetData, isLoading: adsetsLoading } = useAllAdSets(projectId, days, cids);
  const { data: adData, isLoading: adsLoading } = useAllAds(projectId, days, cids);
  const { data: placementData, isLoading: placementLoading } =
    usePlacementBreakdown(projectId, days, cids);
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
      <div className="flex items-center gap-2">
        <Select
          value={isCustom ? "custom" : String(days)}
          onValueChange={(v) => {
            if (v === "custom") {
              setCustomDays(String(days));
              setDays(-1);
            } else {
              setDays(Number(v));
              setCustomDays("");
            }
          }}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
            ))}
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={365}
              autoFocus
              value={customDays}
              onChange={(e) => {
                setCustomDays(e.target.value);
                const v = parseInt(e.target.value);
                if (v > 0 && v <= 365) setDays(v);
              }}
              placeholder="Dias"
              className="w-[70px] h-8 rounded-md border border-border bg-card px-2 text-xs"
            />
            <span className="text-xs text-muted-foreground">dias</span>
          </div>
        )}
      </div>

      {/* KPI Cards — Meta only */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
          <KpiCard icon={Users} label="Leads" value={fmtNumber(overview.totalLeads)} />
          <KpiCard icon={Target} label="CPL" value={fmtCurrency(overview.avgCpl)} />
          <KpiCard icon={Link2} label="Connect Rate" value={fmtPercent(overview.connectRate)} />
          <KpiCard icon={Percent} label="CTR" value={fmtPercent(overview.ctr)} />
          <KpiCard icon={MousePointerClick} label="CPC" value={fmtCurrency(overview.cpc)} />
          <KpiCard icon={BarChart3} label="CPM" value={fmtCurrency(overview.cpm)} />
        </div>
      ) : <EmptyState />}

      {/* Campanhas do Funil (drill-down com thumbnails) */}
      {campaignsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : funnelCampaigns.length > 0 ? (
        <FunnelCampaignTable campaigns={funnelCampaigns} projectId={projectId} days={days} />
      ) : null}

      {/* Públicos (agrupados por nome do ad set) */}
      {adsetsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : adsetData && adsetData.adsets.length > 0 ? (
        <MetricsTable title="Públicos" rows={adsetData.adsets} />
      ) : null}

      {/* Anúncios (agrupados por nome do ad) */}
      {adsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : adData && adData.ads.length > 0 ? (
        <MetricsTable title="Anúncios" rows={adData.ads} />
      ) : null}

      {/* CTR × CPM — Saturation Chart */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">CTR × CPM — Indicador de Saturação</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Quando CTR cai e CPM sobe, seus anúncios estão saturando</p>
          </div>
          <SaturationBadge dailyData={dailyData ?? null} />
        </div>
        {dailyLoading ? (
          <Skeleton className="h-56" />
        ) : dailyData && dailyData.length > 0 ? (
          <CtrCpmChart data={dailyData} />
        ) : <EmptyState />}
      </div>

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

        {/* Top 5 campaigns donut */}
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Distribuição de Investimento</h3>
          {funnelCampaigns.length > 0 ? (
            <CampaignDonut campaigns={funnelCampaigns} />
          ) : <EmptyState />}
        </div>
      </div>

      {/* Top Creatives Gallery */}
      <TopCreativesGallery projectId={projectId} days={days} campaignIds={campaignIds} />

      {/* Conversion Funnel + Placement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Funil de Conversão</h3>
          {overview ? (
            <ConversionFunnel
              impressions={overview.totalImpressions}
              reach={overview.totalReach}
              linkClicks={overview.totalLinkClicks}
              landingPageViews={overview.totalLandingPageViews}
              leads={overview.totalLeads}
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
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", color: "#fff" }} formatter={(v) => [fmtCurrency(Number(v)), "Spend"]} />
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
            <th className="text-right py-2 font-medium">Investimento</th>
            <th className="text-right py-2 font-medium">Leads</th>
            <th className="text-right py-2 font-medium">CPL</th>
            <th className="text-right py-2 font-medium">CTR</th>
            <th className="text-right py-2 font-medium">CPC</th>
            <th className="text-right py-2 font-medium">CPM</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={`${p.platform}-${p.position}`} className="border-b last:border-0">
              <td className="py-1.5"><span className="capitalize">{p.platform}</span> / {p.position}</td>
              <td className="text-right tabular-nums">{fmtCurrency(p.spend)}</td>
              <td className="text-right tabular-nums">{fmtNumber(p.leads)}</td>
              <td className="text-right tabular-nums">{fmtCurrency(p.cpl)}</td>
              <td className="text-right tabular-nums">{fmtPercent(p.ctr)}</td>
              <td className="text-right tabular-nums">{fmtCurrency(p.cpc)}</td>
              <td className="text-right tabular-nums">{fmtCurrency(p.cpm)}</td>
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

// ============================================================
// CTR × CPM — Saturation Chart (ref: Samuel Diogenes)
// ============================================================

function CtrCpmChart({ data }: { data: CampaignDailyInsight[] }) {
  const chartData = data.map((d) => ({
    date: d.date_start.slice(5, 10),
    ctr: safeNum(d.ctr),
    cpm: safeNum(d.cpm),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#fff" }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          yAxisId="ctr"
          tick={{ fontSize: 11, fill: "#fff" }}
          stroke="hsl(200 80% 60%)"
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          label={{ value: "CTR %", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(200 80% 60%)" } }}
        />
        <YAxis
          yAxisId="cpm"
          orientation="right"
          tick={{ fontSize: 11, fill: "#fff" }}
          stroke="hsl(0 72% 55%)"
          tickFormatter={(v) => `R$${v.toFixed(0)}`}
          label={{ value: "CPM R$", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "hsl(0 72% 55%)" } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#fff",
          }}
          formatter={(value, name) => {
            const v = Number(value);
            if (name === "CTR") return [`${v.toFixed(2)}%`, name];
            return [`R$ ${v.toFixed(2)}`, name];
          }}
        />
        <Legend wrapperStyle={{ color: "#fff" }} />
        <Line
          yAxisId="ctr"
          type="monotone"
          dataKey="ctr"
          stroke="hsl(200 80% 60%)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "hsl(200 80% 60%)" }}
          activeDot={{ r: 5 }}
          name="CTR"
        />
        <Line
          yAxisId="cpm"
          type="monotone"
          dataKey="cpm"
          stroke="hsl(0 72% 55%)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "hsl(0 72% 55%)" }}
          activeDot={{ r: 5 }}
          name="CPM"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SaturationBadge({ dailyData }: { dailyData: CampaignDailyInsight[] | null }) {
  if (!dailyData || dailyData.length < 4) return null;

  const mid = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, mid);
  const secondHalf = dailyData.slice(mid);

  const avg = (arr: CampaignDailyInsight[], key: "ctr" | "cpm") =>
    arr.reduce((s, d) => s + safeNum(d[key]), 0) / arr.length;

  const ctrFirst = avg(firstHalf, "ctr");
  const ctrSecond = avg(secondHalf, "ctr");
  const cpmFirst = avg(firstHalf, "cpm");
  const cpmSecond = avg(secondHalf, "cpm");

  const ctrChange = ctrFirst > 0 ? ((ctrSecond - ctrFirst) / ctrFirst) * 100 : 0;
  const cpmChange = cpmFirst > 0 ? ((cpmSecond - cpmFirst) / cpmFirst) * 100 : 0;

  const ctrDrop = ctrChange < -10;
  const cpmRise = cpmChange > 10;

  let status: "saturating" | "ctr-drop" | "cpm-rise" | "healthy" = "healthy";
  if (ctrDrop && cpmRise) status = "saturating";
  else if (ctrDrop) status = "ctr-drop";
  else if (cpmRise) status = "cpm-rise";

  const config = {
    saturating: {
      label: "⚠ Saturando",
      classes: "bg-red-500/15 text-red-400 border-red-500/20",
      cardBorder: "border-red-500/30",
      title: "Anúncios saturando",
      desc: "CTR caindo e CPM subindo ao mesmo tempo — sinal claro de saturação.",
      tip: "Troque criativos ou pause públicos exaustos.",
    },
    "ctr-drop": {
      label: "⚡ Atenção",
      classes: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      cardBorder: "border-amber-500/30",
      title: "CTR em queda",
      desc: "O público pode estar cansando dos criativos atuais.",
      tip: "Teste novos ângulos de copy e criativos.",
    },
    "cpm-rise": {
      label: "⚡ Atenção",
      classes: "bg-amber-500/15 text-amber-400 border-amber-500/20",
      cardBorder: "border-amber-500/30",
      title: "CPM subindo",
      desc: "Custo de entrega aumentando — concorrência ou frequência alta.",
      tip: "Diversifique públicos ou ajuste lances.",
    },
    healthy: {
      label: "✓ Saudável",
      classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
      cardBorder: "border-emerald-500/30",
      title: "Métricas estáveis",
      desc: "Sem sinais de saturação no período analisado.",
      tip: "Continue monitorando para detectar mudanças cedo.",
    },
  };

  const c = config[status];

  return (
    <div className="relative group">
      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border cursor-pointer ${c.classes}`}>
        {c.label}
      </span>

      {/* Hover card */}
      <div className={`absolute right-0 top-full mt-2 w-72 rounded-xl border bg-card shadow-xl p-4 z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 ${c.cardBorder}`}>
        <p className="text-sm font-semibold mb-2">{c.title}</p>
        <p className="text-xs text-muted-foreground mb-3">{c.desc}</p>

        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">CTR</span>
            <span>
              {ctrFirst.toFixed(2)}% → {ctrSecond.toFixed(2)}%{" "}
              <span className={ctrChange < 0 ? "text-red-400" : "text-emerald-400"}>
                ({ctrChange >= 0 ? "+" : ""}{ctrChange.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">CPM</span>
            <span>
              R${cpmFirst.toFixed(2)} → R${cpmSecond.toFixed(2)}{" "}
              <span className={cpmChange > 0 ? "text-red-400" : "text-emerald-400"}>
                ({cpmChange >= 0 ? "+" : ""}{cpmChange.toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border/30 pt-2">
          💡 {c.tip}
        </p>
      </div>
    </div>
  );
}
