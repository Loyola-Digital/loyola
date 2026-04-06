"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
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
  X,
  Play,
  ImageIcon,
  Download,
  Repeat,
  Radio,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaAdsAccounts, useMetaAdsDailyInsights } from "@/lib/hooks/use-meta-ads";
import {
  useTrafficCampaigns,
  useTrafficAdSets,
  useTrafficAds,
  useTopPerformers,
  useAllAdSets,
  useCampaignDailyInsights,
  usePlacementBreakdown,
  useVideoSource,
  type CampaignAnalytics,
  type CampaignAnalyticsResponse,
  type TopPerformerMetric,
  type TopPerformerAd,
  type VideoMetrics,
  type PlacementInsight,
  type MetaAdCreative,
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
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "10px", padding: "4px 6px", color: "#fff" }}
            formatter={(v) => fmtNumber(Number(v))}
            labelFormatter={(l) => `Retenção ${l}`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
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
] as const;

// ============================================================
// FUNNEL CHART
// ============================================================

const FUNNEL_COLORS = ["hsl(200 80% 60%)", "hsl(47 98% 54%)", "hsl(142 70% 45%)", "hsl(210 80% 55%)", "hsl(45 93% 47%)"];

// ============================================================
// CTA LABELS (Story 9.6)
// ============================================================

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Saiba Mais",
  SHOP_NOW: "Compre Agora",
  SIGN_UP: "Cadastre-se",
  WATCH_MORE: "Assistir Mais",
  CONTACT_US: "Fale Conosco",
  APPLY_NOW: "Inscreva-se",
  BOOK_TRAVEL: "Reserve",
  DOWNLOAD: "Baixar",
  GET_OFFER: "Ver Oferta",
  GET_QUOTE: "Pedir Orçamento",
  SUBSCRIBE: "Assinar",
  BUY_NOW: "Comprar",
  ORDER_NOW: "Pedir Agora",
  WHATSAPP_MESSAGE: "WhatsApp",
  MESSAGE_PAGE: "Mensagem",
  CALL_NOW: "Ligar",
};

function CtaBadge({ ctaType }: { ctaType: string | null }) {
  if (!ctaType || ctaType === "NO_BUTTON") return null;
  const label = CTA_LABELS[ctaType] ?? ctaType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-brand/10 text-brand border-brand/20">{label}</Badge>;
}

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
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#fff" }} width={75} />
          <Tooltip
            formatter={(value) => fmtNumber(Number(value))}
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
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
      reach: acc.reach + c.reach,
      leads: acc.leads + (c.leads ?? 0),
      qualified: acc.qualified + (c.qualifiedLeads ?? 0),
      sales: acc.sales + (c.sales ?? 0),
      revenue: acc.revenue + (c.revenue ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, qualified: 0, sales: 0, revenue: 0 }
  );

  const frequency = totals.reach > 0 ? totals.impressions / totals.reach : 0;

  const cards: { label: string; value: string; icon: typeof DollarSign; show: boolean }[] = [
    { label: "Spend", value: fmtCurrency(totals.spend), icon: DollarSign, show: true },
    { label: "Impressões", value: fmtNumber(totals.impressions), icon: Eye, show: true },
    { label: "Alcance", value: fmtNumber(totals.reach), icon: Radio, show: true },
    { label: "Frequência", value: totals.reach > 0 ? frequency.toFixed(2) : "—", icon: Repeat, show: true },
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
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {visible.map((card) => (
        <div key={card.label} className="rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
            <card.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
          <p className="text-xl font-bold tracking-tight">{card.value}</p>
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
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
          <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
          <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} />
          <Legend wrapperStyle={{ color: "#fff" }} />
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
              <SortHeader label="Reach" col="reach" />
              <SortHeader label="Freq" col="frequency" />
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
                <td colSpan={8} />
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
        <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.reach)}</td>
        <td className="py-2 px-2 text-xs text-right">{c.frequency > 0 ? c.frequency.toFixed(2) : "—"}</td>
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
  const colSpan = 9 + (hasCrm ? 2 : 0) + (hasQual ? 2 : 0) + (hasSales ? 3 : 0);

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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const colSpan = 9 + (hasCrm ? 2 : 0) + (hasQual ? 2 : 0) + (hasSales ? 3 : 0);

  if (isLoading) return <tr><td colSpan={colSpan} className="py-1 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!data || data.ads.length === 0) return <tr><td colSpan={colSpan} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad</td></tr>;

  // Build lightbox items for drill-down ads (Story 9.5)
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
        <DrillDownRow key={a.campaignId} item={a} level={2} isExpanded={false} onToggle={() => {}} hasCrm={hasCrm} hasQual={hasQual} hasSales={hasSales} creative={a.creative} videoMetrics={a.videoMetrics} ctaType={a.creative?.ctaType} onCreativeClick={() => {
          const lbIdx = lightboxItems.findIndex((li) => li.id === a.campaignId);
          if (lbIdx >= 0) setLightboxIndex(lbIdx);
        }} />
      ))}
      {/* Enhanced Lightbox (Story 9.5) */}
      {lightboxIndex !== null && (
        <tr><td colSpan={colSpan} className="p-0">
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

function DrillDownRow({ item, level, isExpanded, onToggle, hasCrm, hasQual, hasSales, children, creative, videoMetrics, onCreativeClick, ctaType }: {
  item: CampaignAnalytics; level: 1 | 2; isExpanded: boolean; onToggle: () => void;
  hasCrm: boolean; hasQual: boolean; hasSales: boolean; children?: React.ReactNode;
  creative?: { thumbnailUrl: string | null; objectType: string | null } | null;
  videoMetrics?: VideoMetrics | null;
  onCreativeClick?: () => void;
  ctaType?: string | null;
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
            {level === 2 && <CtaBadge ctaType={ctaType ?? null} />}
            {level === 2 && videoMetrics && <VideoRetentionSparkline metrics={videoMetrics} />}
          </span>
        </td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtCurrency(item.spend)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.impressions)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{fmtNumber(item.reach)}</td>
        <td className="py-1.5 px-2 text-[11px] text-right">{item.frequency > 0 ? item.frequency.toFixed(2) : "—"}</td>
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
// ENHANCED LIGHTBOX (Story 9.5) + CREATIVE METADATA (Story 9.6)
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

function CreativeLightbox({ items, initialIndex, projectId, onClose }: {
  items: LightboxItem[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  const isVideo = item.creative.objectType === "VIDEO";

  // Fetch video source on demand
  const { data: videoData } = useVideoSource(
    isVideo ? projectId : null,
    isVideo ? item.creative.videoId : null
  );

  // Keyboard navigation
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
          {isVideo && videoData?.sourceUrl ? (
            <video
              key={videoData.sourceUrl}
              src={videoData.sourceUrl}
              controls
              autoPlay
              className="w-full max-h-[60vh] object-contain"
              poster={item.creative.thumbnailUrl || undefined}
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
                src={videoData.picture || item.creative.thumbnailUrl || ""}
                alt={item.name}
                className="max-h-[40vh] object-contain mx-auto rounded-lg mb-4"
              />
              <a
                href={videoData.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
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
          ) : null}

          {/* Loading indicator for video */}
          {isVideo && !videoData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Play className="h-10 w-10 mx-auto mb-2 opacity-60" />
                <p className="text-xs opacity-80">Carregando vídeo...</p>
              </div>
            </div>
          )}

          {/* Nav arrows */}
          {items.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white transition-colors">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Info panel */}
        <div className="p-4 space-y-3 shrink-0 overflow-y-auto">
          {/* Metrics */}
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

          {/* Video retention */}
          {item.videoMetrics && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Retenção:</span>
              <VideoRetentionSparkline metrics={item.videoMetrics} />
              <span className="text-[10px] text-muted-foreground ml-auto">
                Thruplay: {fmtNumber(item.videoMetrics.thruplay)}
              </span>
            </div>
          )}

          {/* Title & body */}
          {item.creative.title && <p className="text-sm font-medium">{item.creative.title}</p>}
          {item.creative.body && <p className="text-xs text-muted-foreground line-clamp-3">{item.creative.body}</p>}

          {/* Landing page URL (Story 9.6) */}
          {item.creative.linkUrl && (
            <a
              href={item.creative.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline truncate max-w-full"
              title={item.creative.linkUrl}
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

          {/* Parent info */}
          {item.parentInfo && (
            <p className="text-[10px] text-muted-foreground">{item.parentInfo}</p>
          )}
        </div>
      </div>
    </div>
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
            tick={{ fontSize: 10, fill: "#fff" }}
            width={135}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px", color: "#fff" }}
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
// CREATIVE GALLERY (Story 9.3)
// ============================================================

type CreativeFilter = "all" | "VIDEO" | "IMAGE" | "CAROUSEL";
type CreativeSort = "spend" | "ctr" | "cpc" | "impressions";

function CreativeGallerySection({ projectId, days, campaignId }: { projectId: string; days: number; campaignId?: string | null }) {
  const [filterType, setFilterType] = useState<CreativeFilter>("all");
  const [sortBy, setSortBy] = useState<CreativeSort>("spend");
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { data, isLoading } = useTopPerformers(projectId, "ctr", 20, days, campaignId);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!data || data.topPerformers.length === 0) return null;

  const withCreatives = data.topPerformers.filter((ad) => ad.creative?.thumbnailUrl);
  if (withCreatives.length === 0) return null;

  const filtered = filterType === "all"
    ? withCreatives
    : withCreatives.filter((ad) => ad.creative?.objectType === filterType);

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "spend": return b.spend - a.spend;
      case "ctr": return b.ctr - a.ctr;
      case "cpc": return (a.cpc || 999) - (b.cpc || 999);
      case "impressions": return b.impressions - a.impressions;
      default: return 0;
    }
  });

  const shown = expanded ? sorted : sorted.slice(0, 8);
  const typeCount = {
    all: withCreatives.length,
    VIDEO: withCreatives.filter((a) => a.creative?.objectType === "VIDEO").length,
    IMAGE: withCreatives.filter((a) => a.creative?.objectType !== "VIDEO" && a.creative?.objectType !== "CAROUSEL").length,
    CAROUSEL: withCreatives.filter((a) => a.creative?.objectType === "CAROUSEL").length,
  };

  // Build lightbox items from sorted list (Story 9.5)
  const lightboxItems: LightboxItem[] = sorted.map((ad) => ({
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
          <h3 className="text-sm font-semibold">Galeria de Criativos</h3>
          <p className="text-[11px] text-muted-foreground">{withCreatives.length} criativos com preview</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Type filter */}
          <div className="flex rounded-lg border border-border/40 overflow-hidden">
            {(["all", "VIDEO", "IMAGE", "CAROUSEL"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${filterType === t ? "bg-brand text-brand-foreground" : "bg-card hover:bg-muted/50 text-muted-foreground"} ${typeCount[t] === 0 ? "opacity-40" : ""}`}
                disabled={typeCount[t] === 0}
              >
                {t === "all" ? "Todos" : t === "IMAGE" ? "Imagem" : t === "VIDEO" ? "Vídeo" : "Carousel"}
                <span className="ml-1 opacity-60">{typeCount[t]}</span>
              </button>
            ))}
          </div>
          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as CreativeSort)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Maior Spend</SelectItem>
              <SelectItem value="ctr">Maior CTR</SelectItem>
              <SelectItem value="cpc">Menor CPC</SelectItem>
              <SelectItem value="impressions">Mais Impressões</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((ad, i) => (
          <div
            key={ad.campaignId}
            className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md cursor-pointer"
            onClick={() => setLightboxIndex(i)}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-muted/30">
              <img
                src={ad.creative!.thumbnailUrl!}
                alt={ad.campaignName}
                className="w-full h-full object-cover"
              />
              {/* Overlay with metrics */}
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
              {/* Play icon for video */}
              {ad.creative?.objectType === "VIDEO" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-full bg-black/40 p-2 group-hover:bg-black/60 transition-colors">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                </div>
              )}
              {/* Rank badge */}
              <div className="absolute top-1.5 right-1.5">
                <span className="text-[10px] font-bold bg-black/50 text-white rounded px-1.5 py-0.5 backdrop-blur-sm">
                  #{i + 1}
                </span>
              </div>
            </div>
            {/* Info */}
            <div className="p-2.5 space-y-1">
              <div className="flex items-center gap-1">
                <p className="text-[11px] font-medium truncate" title={ad.campaignName}>{ad.campaignName}</p>
                <CtaBadge ctaType={ad.creative?.ctaType ?? null} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{fmtNumber(ad.impressions)} impr</span>
                <span>{fmtNumber(ad.clicks)} clicks</span>
                <span>{fmtNumber(ad.reach)} reach</span>
              </div>
              {/* Video retention mini bar */}
              {ad.videoMetrics && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] text-muted-foreground/60">Retenção</span>
                  <VideoRetentionSparkline metrics={ad.videoMetrics} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {sorted.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${sorted.length})`}
        </button>
      )}

      {/* Enhanced Lightbox (Story 9.5) */}
      {lightboxIndex !== null && (
        <CreativeLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          projectId={projectId}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// PLACEMENT BREAKDOWN (Story 8.7)
// ============================================================

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  facebook: { label: "Facebook", color: "hsl(220 80% 55%)", icon: "f" },
  instagram: { label: "Instagram", color: "hsl(330 70% 55%)", icon: "ig" },
  audience_network: { label: "Audience Network", color: "hsl(200 60% 50%)", icon: "an" },
  messenger: { label: "Messenger", color: "hsl(210 90% 55%)", icon: "m" },
  threads: { label: "Threads", color: "hsl(0 0% 45%)", icon: "t" },
  unknown: { label: "Outros", color: "hsl(0 0% 55%)", icon: "?" },
};

/** Strip redundant platform prefix from position name: "facebook reels" → "Reels" */
function cleanPositionName(platform: string, position: string): string {
  let name = position.replace(/_/g, " ");
  // Strip platform prefix (e.g. "facebook reels" → "reels", "instagram stories" → "stories")
  const prefixes = [platform, platform.replace(/_/g, " ")];
  for (const prefix of prefixes) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length).trim();
    }
  }
  // Capitalize first letter
  if (name.length > 0) name = name.charAt(0).toUpperCase() + name.slice(1);
  return name || "Feed";
}

function PlacementBreakdownSection({ projectId, days }: { projectId: string; days: number }) {
  const { data, isLoading } = usePlacementBreakdown(projectId, days);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!data || data.placements.length === 0) return null;

  const placements = data.placements;
  const maxSpend = Math.max(...placements.map((p) => p.spend));

  // Group and sort by platform spend
  const grouped = new Map<string, PlacementInsight[]>();
  for (const p of placements) {
    const list = grouped.get(p.platform) ?? [];
    list.push(p);
    grouped.set(p.platform, list);
  }

  // Sort platforms by total spend, positions within by spend
  const sortedPlatforms = Array.from(grouped.entries())
    .map(([platform, items]) => ({
      platform,
      items: items.sort((a, b) => b.spend - a.spend),
      totalSpend: items.reduce((s, p) => s + p.spend, 0),
      totalImpressions: items.reduce((s, p) => s + p.impressions, 0),
      totalClicks: items.reduce((s, p) => s + p.clicks, 0),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold">Performance por Posicionamento</h3>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedPlatforms.map(({ platform, items, totalSpend, totalImpressions, totalClicks }) => {
          const meta = PLATFORM_META[platform] ?? PLATFORM_META.unknown;
          const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

          return (
            <div key={platform} className="rounded-lg border border-border/20 bg-muted/10 overflow-hidden">
              {/* Platform header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/15" style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground">{items.length} posições</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{fmtCurrency(totalSpend)}</span>
                  <span>CTR {fmtPercent(avgCtr)}</span>
                </div>
              </div>

              {/* Positions */}
              <div className="divide-y divide-border/10">
                {items.map((p) => {
                  const spendPct = maxSpend > 0 ? (p.spend / maxSpend) * 100 : 0;
                  const name = cleanPositionName(platform, p.position);

                  return (
                    <div key={p.position} className="px-4 py-2 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{name}</span>
                        <span className="text-xs font-semibold">{fmtCurrency(p.spend)}</span>
                      </div>
                      {/* Spend bar */}
                      <div className="h-1 rounded-full bg-muted/40 mb-1.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${spendPct}%`, backgroundColor: meta.color, opacity: 0.6 }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{fmtNumber(p.impressions)} impr</span>
                        <span>{fmtNumber(p.clicks)} clicks</span>
                        <span className="font-medium" style={{ color: p.ctr > avgCtr ? "hsl(142 70% 45%)" : undefined }}>
                          CTR {fmtPercent(p.ctr)}
                        </span>
                        <span>CPC {fmtCurrency(p.cpc)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// CSV EXPORT (Story 8.8)
// ============================================================

function exportCsv(campaigns: CampaignAnalytics[], hasCrm: boolean, hasQual: boolean, hasSales: boolean) {
  const headers = ["Nome", "Spend", "Impressoes", "Alcance", "Frequencia", "Cliques", "CTR", "CPC", "CPM"];
  if (hasCrm) headers.push("Leads", "CPL");
  if (hasQual) headers.push("Qualificados", "CPL Qual");
  if (hasSales) headers.push("Vendas", "Custo/Venda", "ROAS");

  const rows = campaigns.map((c) => {
    const row = [
      c.campaignName,
      c.spend.toFixed(2).replace(".", ","),
      String(c.impressions),
      String(c.reach),
      c.frequency > 0 ? c.frequency.toFixed(2).replace(".", ",") : "",
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
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-96 rounded-lg" /><div className="grid gap-3 grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div></div>}>
      <TrafficPageContent />
    </Suspense>
  );
}

function TrafficPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: accounts, isLoading: loadingAccounts } = useMetaAdsAccounts();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState("");
  const [isCustomPeriod, setIsCustomPeriod] = useState(false);

  // Support ?project=xxx for project-scoped access
  const forceProjectId = searchParams.get("project") ?? undefined;

  // Auto-select account: if forceProjectId, find the account linked to that project
  const autoAccountId = useMemo(() => {
    if (!forceProjectId || !accounts) return accounts?.[0]?.id ?? null;
    const match = accounts.find((a) => a.projects.some((p) => p.projectId === forceProjectId));
    return match?.id ?? accounts?.[0]?.id ?? null;
  }, [forceProjectId, accounts]);

  const activeAccountId = selectedAccountId ?? autoAccountId;

  // Get project linked to selected account
  const linkedProjects = accounts?.find((a) => a.id === activeAccountId)?.projects ?? [];
  const activeProjectId = forceProjectId ?? selectedProjectId ?? linkedProjects[0]?.projectId ?? null;

  const { data: campaignData, isLoading: loadingCampaigns } = useTrafficCampaigns(activeProjectId, days);

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

            {activeProjectId && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">Mídia</Badge>
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

            <div className="flex items-center gap-2 ml-auto">
              <Select
                value={isCustomPeriod ? "custom" : String(days)}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setIsCustomPeriod(true);
                    setCustomDays("");
                  } else {
                    setIsCustomPeriod(false);
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
              {isCustomPeriod && (
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
              {/* KPI Overview */}
              <SummaryCards data={filteredCampaignData!} />

              {/* Visual Performance */}
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  {activeAccountId && <DailyChart accountId={activeAccountId} projectId={activeProjectId} campaignId={filterCampaignId} days={days} />}
                  <FunnelChart data={filteredCampaignData!} />
                </div>
                <div>
                  {activeProjectId && <TopPerformersSection projectId={activeProjectId} days={days} campaignId={filterCampaignId} />}
                </div>
              </div>

              {/* Creative Gallery */}
              {activeProjectId && <CreativeGallerySection projectId={activeProjectId} days={days} campaignId={filterCampaignId} />}

              {/* Creative Comparison */}
              {activeProjectId && <CreativeRankingChart projectId={activeProjectId} days={days} campaignId={filterCampaignId} />}

              {/* Data Tables */}
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

        </>
      )}
    </div>
  );
}
