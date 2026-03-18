"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useMetaAdsAccounts, useMetaAdsDailyInsights } from "@/lib/hooks/use-meta-ads";
import {
  useTrafficCampaigns,
  useTrafficAdSets,
  useTrafficAds,
  type CampaignAnalytics,
  type CampaignAnalyticsResponse,
} from "@/lib/hooks/use-traffic-analytics";
import {
  LineChart,
  Line,
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

function DailyChart({ accountId, days }: { accountId: string; days: number }) {
  const { data: dailyData, isLoading } = useMetaAdsDailyInsights(accountId, days);
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
  const colSpan = 7 + (hasCrm ? 2 : 0) + (hasQual ? 2 : 0) + (hasSales ? 3 : 0);

  if (isLoading) return <tr><td colSpan={colSpan} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data || data.ads.length === 0) return <tr><td colSpan={colSpan} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  return (
    <>
      {data.ads.map((a) => (
        <DrillDownRow key={a.campaignId} item={a} level={2} isExpanded={false} onToggle={() => {}} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales} />
      ))}
    </>
  );
}

function DrillDownRow({ item, level, isExpanded, onToggle, hasCrm, hasQual, hasSales, children }: {
  item: CampaignAnalytics; level: 1 | 2; isExpanded: boolean; onToggle: () => void;
  hasCrm: boolean; hasQual: boolean; hasSales: boolean; children?: React.ReactNode;
}) {
  const pl = level === 1 ? "pl-8" : "pl-14";
  const bg = level === 1 ? "bg-muted/20" : "bg-muted/10";

  return (
    <>
      <tr className={`border-t border-border/10 ${bg} hover:bg-muted/40 cursor-pointer`} onClick={onToggle}>
        <td className={`py-1.5 px-3 text-[11px] ${pl}`}>
          <span className="inline-flex items-center gap-1">
            {level === 1 && (isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />)}
            {item.campaignName}
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

export default function TrafficPage() {
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand/60 mb-0.5">Loyola X · Tráfego</p>
          <h1 className="text-2xl font-bold tracking-tight">Full Funnel Analytics</h1>
        </div>
        <Link href="/settings/traffic" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="h-3.5 w-3.5" /> Configurar
        </Link>
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

            {/* Badges */}
            {campaignData && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">Mídia</Badge>
                {campaignData.hasCrm && <Badge className="text-[10px] bg-green-500/20 text-green-600 border-green-500/30">CRM</Badge>}
                {campaignData.hasQualification && <Badge className="text-[10px] bg-blue-500/20 text-blue-600 border-blue-500/30">Qualificação</Badge>}
                {campaignData.hasSales && <Badge className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Vendas</Badge>}
              </div>
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

          {campaignData && (
            <>
              <SummaryCards data={campaignData} />
              <FunnelChart data={campaignData} />
              {activeAccountId && <DailyChart accountId={activeAccountId} days={days} />}
              <CampaignTable data={campaignData} projectId={activeProjectId!} days={days} />
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
        </>
      )}
    </div>
  );
}
