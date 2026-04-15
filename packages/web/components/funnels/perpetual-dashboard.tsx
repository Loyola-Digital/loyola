"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  LinkIcon,
  ShoppingCart,
  Target,
  BarChart3,
  Filter,
  Settings2,
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
  BarChart,
  Bar,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  useCampaignDailyInsights,
  useAllAdSets,
  useAllAds,
  type CampaignAnalytics,
} from "@/lib/hooks/use-traffic-analytics";
import { CampaignSelector } from "./campaign-selector";
import { TopCreativesGallery } from "./top-creatives-gallery";
import type { Funnel, FunnelCampaign } from "@loyola-x/shared";
import { useCampaignPicker, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import {
  buildFunnelRoasFormula,
  buildFunnelSpendFormula,
  buildFunnelSalesCountFormula,
  buildFunnelRevenueFormula,
  buildFunnelCacFormula,
  buildFunnelMarginFormula,
  buildFunnelMarginPercentFormula,
  buildFunnelRateFormula,
  buildFunnelDailyFormula,
} from "@/lib/formulas/funnels";

interface PerpetualDashboardProps {
  funnel: Funnel;
  projectId: string;
}

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

function fmtRoas(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}x`;
}

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PerpetualDashboard({ funnel, projectId }: PerpetualDashboardProps) {
  const [days, setDays] = useState(30);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const [tableFilter, setTableFilter] = useState<"campaign" | "adset" | "ad">("campaign");
  const { data: pickerData } = useCampaignPicker(showCampaignManager ? projectId : null);
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  const firstCampaignId = campaignIds[0] ?? null;

  // Data hooks
  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: campaignData, isLoading: campaignsLoading } = useTrafficCampaigns(projectId, days);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, firstCampaignId, days);
  const { data: adSetsData } = useAllAdSets(projectId, days, campaignIds.length > 0 ? campaignIds : null);
  const { data: adsData } = useAllAds(projectId, days, campaignIds.length > 0 ? campaignIds : null);

  // Filtered campaigns for this funnel
  const funnelCampaigns = useMemo(() => {
    if (!campaignData) return [];
    return campaignData.campaigns.filter((c) => campaignIdSet.has(c.campaignId));
  }, [campaignData, campaignIdSet]);

  // Daily chart data: investment + margin
  const dailyChartData = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.map((d) => {
      const spend = safeNum(d.spend);
      const purchases = d.actions?.find((a) =>
        a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
      );
      const revenueEntry = d.action_values?.find((a) =>
        a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase"
      );
      const revenue = revenueEntry ? parseFloat(revenueEntry.value) : 0;
      const margin = revenue - spend;
      const dateLabel = d.date_start.slice(5, 10);
      return {
        date: dateLabel,
        spend,
        revenue,
        margin,
        sales: purchases ? parseInt(purchases.value) : 0,
        formulasByKey: {
          spend: buildFunnelDailyFormula("Investimento", "Meta Ads API · spend (time series)", spend, true, dateLabel),
          revenue: buildFunnelDailyFormula("Receita", "Meta Ads API · action_values.purchase (time series)", revenue, true, dateLabel),
          margin: buildFunnelDailyFormula("Margem (Receita − Spend)", "Derivado · revenue − spend", margin, true, dateLabel),
        },
      };
    });
  }, [dailyData]);

  // Revenue by audience (ad sets)
  const revenueByAudience = useMemo(() => {
    if (!adSetsData?.adsets) return [];
    return adSetsData.adsets
      .filter((a) => a.revenue && a.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((a) => ({ name: a.campaignName, revenue: a.revenue ?? 0 }));
  }, [adSetsData]);

  // Revenue by creative (ads)
  const revenueByCreative = useMemo(() => {
    if (!adsData?.ads) return [];
    return adsData.ads
      .filter((a) => a.revenue && a.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((a) => ({ name: a.campaignName.length > 25 ? a.campaignName.slice(0, 25) + "..." : a.campaignName, revenue: a.revenue ?? 0 }));
  }, [adsData]);

  // Revenue by channel (campaigns)
  const revenueByCampaign = useMemo(() => {
    return funnelCampaigns
      .filter((c) => c.revenue && c.revenue > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 8)
      .map((c) => ({ name: c.campaignName.length > 25 ? c.campaignName.slice(0, 25) + "..." : c.campaignName, revenue: c.revenue ?? 0 }));
  }, [funnelCampaigns]);

  // Table data based on filter
  const tableData = useMemo((): CampaignAnalytics[] => {
    switch (tableFilter) {
      case "campaign": return funnelCampaigns;
      case "adset": return adSetsData?.adsets ?? [];
      case "ad": return adsData?.ads ?? [];
      default: return [];
    }
  }, [tableFilter, funnelCampaigns, adSetsData, adsData]);

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
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DayRangePicker days={days} onDaysChange={setDays} />
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowCampaignManager(!showCampaignManager)}>
          <Settings2 className="h-3.5 w-3.5" />
          {funnel.campaigns.length} campanha{funnel.campaigns.length !== 1 ? "s" : ""}
        </Button>
      </div>

      {showCampaignManager && pickerData && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Gerenciar campanhas do funil</p>
          <CampaignSelector
            campaigns={pickerData.campaigns ?? []}
            accountLinked={pickerData.accountLinked}
            value={funnel.campaigns}
            onChange={(campaigns: FunnelCampaign[]) => {
              updateFunnel.mutate({ campaigns }, { onSuccess: () => toast.success("Campanhas atualizadas!") });
            }}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* KPIs PRINCIPAIS                                                  */}
      {/* ================================================================ */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        (() => {
          const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
          return (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              <MetricTooltip label="ROAS" value={fmtRoas(overview.roas)} formula={buildFunnelRoasFormula(overview.roas, f)}>
                <KpiCard icon={Target} label="ROAS" value={fmtRoas(overview.roas)} target={2} actual={overview.roas} />
              </MetricTooltip>
              <MetricTooltip label="Investimento" value={fmtCurrency(overview.totalSpend)} formula={buildFunnelSpendFormula(overview.totalSpend, f)}>
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
              </MetricTooltip>
              <MetricTooltip label="Vendas" value={fmtNumber(overview.totalSales)} formula={buildFunnelSalesCountFormula(overview.totalSales, f)}>
                <KpiCard icon={ShoppingCart} label="Vendas" value={fmtNumber(overview.totalSales)} />
              </MetricTooltip>
              <MetricTooltip label="Receita" value={fmtCurrency(overview.totalRevenue)} formula={buildFunnelRevenueFormula(overview.totalRevenue, f)}>
                <KpiCard icon={DollarSign} label="Receita" value={fmtCurrency(overview.totalRevenue)} />
              </MetricTooltip>
              <MetricTooltip label="CAC" value={fmtCurrency(overview.cac)} formula={buildFunnelCacFormula(overview.cac, f)}>
                <KpiCard icon={DollarSign} label="CAC" value={fmtCurrency(overview.cac)} />
              </MetricTooltip>
              <MetricTooltip label="Margem" value={fmtCurrency(overview.margin)} formula={buildFunnelMarginFormula(overview.margin, f)}>
                <KpiCard icon={DollarSign} label="Margem" value={fmtCurrency(overview.margin)} />
              </MetricTooltip>
              <MetricTooltip label="Margem %" value={fmtPercent(overview.marginPercent)} formula={buildFunnelMarginPercentFormula(overview.marginPercent, f)}>
                <KpiCard icon={BarChart3} label="Margem %" value={fmtPercent(overview.marginPercent)} />
              </MetricTooltip>
            </div>
          );
        })()
      ) : <EmptyState />}

      {/* ================================================================ */}
      {/* TAXAS DE CONVERSÃO                                               */}
      {/* ================================================================ */}
      {overview && (overview.connectRate || overview.checkoutRate || overview.checkoutConversionRate) && (() => {
        const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
        return (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <MetricTooltip label="Connect Rate" value={overview.connectRate != null ? `${overview.connectRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Connect Rate", "Landing Page Views ÷ Link Clicks × 100", overview.connectRate, f)}>
              <RateCard label="Connect Rate" sublabel="Landing Page / Link Clicks" value={overview.connectRate} />
            </MetricTooltip>
            <MetricTooltip label="Taxa Visita Checkout" value={overview.checkoutRate != null ? `${overview.checkoutRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Visita Checkout", "Checkout ÷ Link Clicks × 100", overview.checkoutRate, f)}>
              <RateCard label="Taxa Visita Checkout" sublabel="Checkout / Link Clicks" value={overview.checkoutRate} />
            </MetricTooltip>
            <MetricTooltip label="Taxa Conversão Checkout" value={overview.checkoutConversionRate != null ? `${overview.checkoutConversionRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Conversão Checkout", "Compra ÷ Checkout × 100", overview.checkoutConversionRate, f)}>
              <RateCard label="Taxa Conversao Checkout" sublabel="Compra / Checkout" value={overview.checkoutConversionRate} />
            </MetricTooltip>
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* DESEMPENHO POR CAMPANHA (CANAL)                                  */}
      {/* ================================================================ */}
      {!campaignsLoading && funnelCampaigns.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-3">Desempenho por Canal (Campanha)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/20">
                  <th className="text-left py-2 pr-3">Campanha</th>
                  <th className="text-right px-2">Invest.</th>
                  <th className="text-right px-2">Receita</th>
                  <th className="text-right px-2">Vendas</th>
                  <th className="text-right px-2">ROAS</th>
                  <th className="text-right px-2">CAC</th>
                  <th className="text-right pl-2">CTR</th>
                </tr>
              </thead>
              <tbody>
                {funnelCampaigns.map((c) => (
                  <tr key={c.campaignId} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-2 pr-3 font-medium truncate max-w-[200px]">{c.campaignName}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(c.spend)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(c.revenue)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtNumber(c.sales)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtRoas(c.roas)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(c.costPerSale)}</td>
                    <td className="text-right pl-2 tabular-nums">{fmtPercent(c.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* GRÁFICOS EM LINHA: Investimento + Margem no tempo                */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Investimento no Tempo</h3>
          {dailyLoading ? <Skeleton className="h-48" /> : dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<FormulaChartTooltip />} />
                <Legend wrapperStyle={{ color: "#fff" }} />
                <Line type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Investimento" />
                <Line type="monotone" dataKey="revenue" stroke="hsl(150 60% 50%)" strokeWidth={2} dot={false} name="Receita" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Margem no Tempo</h3>
          {dailyLoading ? <Skeleton className="h-48" /> : dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<FormulaChartTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="margin" stroke="hsl(150 60% 50%)" strokeWidth={2} dot={false} name="Margem (R$)" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
      </div>

      {/* ================================================================ */}
      {/* GRÁFICOS EM BARRAS HORIZONTAIS: Receita por canal/público/criativo */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HBarChart title="Receita por Canal" data={revenueByCampaign} />
        <HBarChart title="Receita por Publico" data={revenueByAudience} />
        <HBarChart title="Receita por Criativo" data={revenueByCreative} />
      </div>

      {/* ================================================================ */}
      {/* TOP CRIATIVOS                                                    */}
      {/* ================================================================ */}
      <TopCreativesGallery projectId={projectId} days={days} campaignIds={campaignIds} />

      {/* ================================================================ */}
      {/* TABELA DETALHADA COM FILTRO                                      */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Detalhamento
          </h3>
          <Select value={tableFilter} onValueChange={(v) => setTableFilter(v as typeof tableFilter)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign">Por Canal</SelectItem>
              <SelectItem value="adset">Por Publico</SelectItem>
              <SelectItem value="ad">Por Criativo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-2 pr-3 min-w-[150px]">Dimensao</th>
                <th className="text-right px-2">Invest.</th>
                <th className="text-right px-2">Receita</th>
                <th className="text-right px-2">CAC</th>
                <th className="text-right px-2">ROAS</th>
                <th className="text-right px-2">Margem %</th>
                <th className="text-right px-2">Margem/Venda</th>
                <th className="text-right px-2">CTR (link)</th>
                <th className="text-right px-2">CPC (link)</th>
                <th className="text-right pl-2">CPM</th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>
              ) : tableData.map((row) => {
                const margin = (row.revenue ?? 0) - row.spend;
                const marginPct = (row.revenue ?? 0) > 0 ? (margin / row.revenue!) * 100 : null;
                const marginPerSale = (row.sales ?? 0) > 0 ? margin / row.sales! : null;
                return (
                  <tr key={row.campaignId} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-2 pr-3 font-medium truncate max-w-[200px]">{row.campaignName}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(row.spend)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(row.revenue)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(row.costPerSale)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtRoas(row.roas)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtPercent(marginPct)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(marginPerSale)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtPercent(row.ctr)}</td>
                    <td className="text-right px-2 tabular-nums">{fmtCurrency(row.cpc)}</td>
                    <td className="text-right pl-2 tabular-nums">{fmtCurrency(row.cpm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function KpiCard({ icon: Icon, label, value, target, actual }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  target?: number; actual?: number | null;
}) {
  const isRoas = target !== undefined;
  const roasOk = isRoas && actual != null && actual >= target;
  const roasBad = isRoas && actual != null && actual < target;

  return (
    <div className={`rounded-xl border p-3 hover:border-border/50 transition-colors ${
      roasOk ? "border-emerald-500/30 bg-emerald-500/5" : roasBad ? "border-red-500/30 bg-red-500/5" : "border-border/30 bg-gradient-to-br from-card/80 to-card/40"
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {isRoas && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          Meta: {target}x {roasOk ? <span className="text-emerald-500">OK</span> : <span className="text-red-400">Abaixo</span>}
        </p>
      )}
    </div>
  );
}

function RateCard({ label, sublabel, value }: { label: string; sublabel: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground mb-2">{sublabel}</p>
      <p className="text-2xl font-bold">{fmtPercent(value)}</p>
    </div>
  );
}

function HBarChart({ title, data }: { title: string; data: { name: string; revenue: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">{title}</h3>
        <p className="text-xs text-muted-foreground py-4 text-center">Sem dados de receita</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#fff" }} tickFormatter={(v) => fmtCurrency(v)} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#fff" }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmtCurrency(Number(v)), "Receita"]} />
          <Bar dataKey="revenue" fill="hsl(150 60% 50%)" radius={[0, 4, 4, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">Sem dados no periodo selecionado.</p>
      <p className="text-xs text-muted-foreground mt-1">Tente selecionar um periodo diferente.</p>
    </div>
  );
}
