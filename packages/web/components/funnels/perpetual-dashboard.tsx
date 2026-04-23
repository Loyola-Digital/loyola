"use client";

import * as React from "react";
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
import { RefreshDataButton } from "./refresh-data-button";
import type { Funnel, FunnelCampaign, StageType } from "@loyola-x/shared";
import { StageSalesSection } from "./stage-sales-section";
import { useCampaignPicker, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { useMetaAdsComparison } from "@/lib/hooks/use-meta-ads-comparison";
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
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  buildFunnelCpmFormula,
  enrichFormulaForEntity,
  type EntityPath,
} from "@/lib/formulas/funnels";

interface PerpetualDashboardProps {
  funnel: Funnel;
  projectId: string;
  stageId?: string;
  stageType?: StageType;
  onCampaignsChange?: (campaigns: FunnelCampaign[]) => void;
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

// ============================================================
// MAIN COMPONENT
// ============================================================

export function PerpetualDashboard({ funnel, projectId, stageId, stageType, onCampaignsChange }: PerpetualDashboardProps) {
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

  const { data: compData } = useMetaAdsComparison(
    projectId, funnel.id, stageId ?? null, funnel.compareFunnelId, days,
  );
  const hasComparison = !!(compData && !compData.semDados);
  const compSpend = hasComparison ? compData!.totals.spend : null;

  function calcDelta(current: number | null | undefined, comparison: number | null): number {
    if (current == null || comparison == null || comparison === 0) return 0;
    return ((current - comparison) / Math.abs(comparison)) * 100;
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          <DayRangePicker days={days} onDaysChange={setDays} />
          <RefreshDataButton />
        </div>
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
              if (onCampaignsChange) {
                onCampaignsChange(campaigns);
              } else {
                updateFunnel.mutate({ campaigns }, { onSuccess: () => toast.success("Campanhas atualizadas!") });
              }
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
                <KpiCard icon={Target} label="ROAS" value={fmtRoas(overview.roas)} target={2} actual={overview.roas} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="Investimento" value={fmtCurrency(overview.totalSpend)} formula={buildFunnelSpendFormula(overview.totalSpend, f)}>
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} hintTooltip
                  comparison={compSpend !== null && overview.totalSpend != null ? {
                    display: fmtCurrency(compSpend),
                    delta: calcDelta(overview.totalSpend, compSpend),
                    higherIsBetter: false,
                  } : undefined}
                />
              </MetricTooltip>
              <MetricTooltip label="Vendas" value={fmtNumber(overview.totalSales)} formula={buildFunnelSalesCountFormula(overview.totalSales, f)}>
                <KpiCard icon={ShoppingCart} label="Vendas" value={fmtNumber(overview.totalSales)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="Receita" value={fmtCurrency(overview.totalRevenue)} formula={buildFunnelRevenueFormula(overview.totalRevenue, f)}>
                <KpiCard icon={DollarSign} label="Receita" value={fmtCurrency(overview.totalRevenue)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="CAC" value={fmtCurrency(overview.cac)} formula={buildFunnelCacFormula(overview.cac, f)}>
                <KpiCard icon={DollarSign} label="CAC" value={fmtCurrency(overview.cac)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="Margem" value={fmtCurrency(overview.margin)} formula={buildFunnelMarginFormula(overview.margin, f)}>
                <KpiCard icon={DollarSign} label="Margem" value={fmtCurrency(overview.margin)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="Margem %" value={fmtPercent(overview.marginPercent)} formula={buildFunnelMarginPercentFormula(overview.marginPercent, f)}>
                <KpiCard icon={BarChart3} label="Margem %" value={fmtPercent(overview.marginPercent)} hintTooltip />
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
              <RateCard label="Connect Rate" sublabel="Landing Page / Link Clicks" value={overview.connectRate} hintTooltip />
            </MetricTooltip>
            <MetricTooltip label="Taxa Visita Checkout" value={overview.checkoutRate != null ? `${overview.checkoutRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Visita Checkout", "Checkout ÷ Link Clicks × 100", overview.checkoutRate, f)}>
              <RateCard label="Taxa Visita Checkout" sublabel="Checkout / Link Clicks" value={overview.checkoutRate} hintTooltip />
            </MetricTooltip>
            <MetricTooltip label="Taxa Conversão Checkout" value={overview.checkoutConversionRate != null ? `${overview.checkoutConversionRate.toFixed(2)}%` : "—"} formula={buildFunnelRateFormula("Taxa Conversão Checkout", "Compra ÷ Checkout × 100", overview.checkoutConversionRate, f)}>
              <RateCard label="Taxa Conversao Checkout" sublabel="Compra / Checkout" value={overview.checkoutConversionRate} hintTooltip />
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
        <HBarChart
          title="Receita por Canal"
          data={revenueByCampaign}
          funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
          entityType="campaign"
        />
        <HBarChart
          title="Receita por Publico"
          data={revenueByAudience}
          funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
          entityType="adset"
        />
        <HBarChart
          title="Receita por Criativo"
          data={revenueByCreative}
          funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
          entityType="ad"
        />
      </div>

      {/* ================================================================ */}
      {/* TOP CRIATIVOS                                                    */}
      {/* ================================================================ */}
      <TopCreativesGallery
        projectId={projectId}
        days={days}
        campaignIds={campaignIds}
        funnelId={funnel.id}
        stageId={stageId}
        funnelContext={{ days, funnelType: "perpetual", funnelName: funnel?.name }}
      />

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
                const f = { days, funnelType: "perpetual" as const, funnelName: funnel?.name };
                const margin = (row.revenue ?? 0) - row.spend;
                const marginPct = (row.revenue ?? 0) > 0 ? (margin / row.revenue!) * 100 : null;
                const marginPerSale = (row.sales ?? 0) > 0 ? margin / row.sales! : null;
                const path: EntityPath =
                  tableFilter === "campaign" ? { campaign: row.campaignName }
                  : tableFilter === "adset" ? { adset: row.campaignName }
                  : { ad: row.campaignName };
                const renderCell = (
                  col: string,
                  label: string,
                  value: string,
                  formula: ReturnType<typeof enrichFormulaForEntity>,
                  className: string,
                ) => {
                  if (!formula) return <td key={col} className={className}>{value}</td>;
                  return (
                    <td key={col} className={className}>
                      <MetricTooltip label={label} value={value} formula={formula}>
                        <span className="cursor-help underline decoration-dotted decoration-border/60 underline-offset-2">
                          {value}
                        </span>
                      </MetricTooltip>
                    </td>
                  );
                };
                const cells: Array<[string, string, string, ReturnType<typeof enrichFormulaForEntity>, string]> = [
                  ["spend", "Investimento", fmtCurrency(row.spend), enrichFormulaForEntity(buildFunnelSpendFormula(row.spend, f), path), "text-right px-2 tabular-nums"],
                  ["revenue", "Receita", fmtCurrency(row.revenue), enrichFormulaForEntity(buildFunnelRevenueFormula(row.revenue, f), path), "text-right px-2 tabular-nums"],
                  ["cac", "CAC", fmtCurrency(row.costPerSale), enrichFormulaForEntity(buildFunnelCacFormula(row.costPerSale ?? null, f), path), "text-right px-2 tabular-nums"],
                  ["roas", "ROAS", fmtRoas(row.roas), enrichFormulaForEntity(buildFunnelRoasFormula(row.roas ?? null, f), path), "text-right px-2 tabular-nums"],
                  ["marginPct", "Margem %", fmtPercent(marginPct), enrichFormulaForEntity(buildFunnelMarginPercentFormula(marginPct, f), path), "text-right px-2 tabular-nums"],
                  ["marginPerSale", "Margem/Venda", fmtCurrency(marginPerSale), enrichFormulaForEntity(buildFunnelMarginFormula(marginPerSale, f), path), "text-right px-2 tabular-nums"],
                  ["ctr", "CTR", fmtPercent(row.ctr), enrichFormulaForEntity(buildFunnelCtrFormula(row.ctr, f), path), "text-right px-2 tabular-nums"],
                  ["cpc", "CPC", fmtCurrency(row.cpc), enrichFormulaForEntity(buildFunnelCpcFormula(row.cpc, f), path), "text-right px-2 tabular-nums"],
                  ["cpm", "CPM", fmtCurrency(row.cpm), enrichFormulaForEntity(buildFunnelCpmFormula(row.cpm, f), path), "text-right pl-2 tabular-nums"],
                ];
                return (
                  <tr key={row.campaignId} className="border-b border-border/10 hover:bg-muted/5">
                    <td className="py-2 pr-3 font-medium truncate max-w-[200px]">{row.campaignName}</td>
                    {cells.map(([col, label, value, formula, cls]) => renderCell(col, label, value, formula, cls))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dashboard Financeiro — apenas etapas pagas (Story 19.6) */}
      {stageType === "paid" && stageId && (
        <div className="space-y-6 pt-2 border-t border-border/30">
          <h3 className="text-base font-semibold">Vendas</h3>
          <StageSalesSection
            projectId={projectId}
            funnelId={funnel.id}
            stageId={stageId}
            subtype="capture"
            title="Vendas de Captação"
            days={days}
          />
          <div className="border-t border-border/20" />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnel.id}
            stageId={stageId}
            subtype="main_product"
            title="Produto Principal"
            days={days}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

const KpiCard = React.forwardRef<HTMLDivElement, {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  target?: number; actual?: number | null; hintTooltip?: boolean;
  comparison?: { display: string; delta: number; higherIsBetter: boolean };
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, target, actual, hintTooltip, comparison, className, ...rest },
  ref,
) {
  const isRoas = target !== undefined;
  const roasOk = isRoas && actual != null && actual >= target;
  const roasBad = isRoas && actual != null && actual < target;

  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border p-3 hover:border-border/50 transition-colors ${hintTooltip ? "cursor-help" : ""} ${
        roasOk ? "border-emerald-500/30 bg-emerald-500/5" : roasBad ? "border-red-500/30 bg-red-500/5" : "border-border/30 bg-gradient-to-br from-card/80 to-card/40"
      } ${className ?? ""}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className={`text-xl font-bold tracking-tight ${hintTooltip ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{value}</p>
      {comparison && (
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 leading-tight">
          <span>vs {comparison.display}</span>
          {comparison.delta !== 0 && (
            <span className={
              (comparison.delta > 0) === comparison.higherIsBetter
                ? "text-emerald-400"
                : "text-red-400"
            }>
              {comparison.delta > 0 ? "▲" : "▼"} {Math.abs(comparison.delta).toFixed(1)}%
            </span>
          )}
        </div>
      )}
      {isRoas && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          Meta: {target}x {roasOk ? <span className="text-emerald-500">OK</span> : <span className="text-red-400">Abaixo</span>}
        </p>
      )}
    </div>
  );
});

const RateCard = React.forwardRef<
  HTMLDivElement,
  { label: string; sublabel: string; value: number | null; hintTooltip?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(function RateCard({ label, sublabel, value, hintTooltip, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border border-border/30 bg-card/60 p-4 ${hintTooltip ? "cursor-help" : ""} ${className ?? ""}`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground mb-2">{sublabel}</p>
      <p className={`text-2xl font-bold ${hintTooltip ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}>{fmtPercent(value)}</p>
    </div>
  );
});

function HBarChart({ title, data, funnelContext, entityType }: {
  title: string;
  data: { name: string; revenue: number }[];
  funnelContext: { days: number; funnelType: "perpetual"; funnelName?: string };
  entityType: "campaign" | "adset" | "ad";
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">{title}</h3>
        <p className="text-xs text-muted-foreground py-4 text-center">Sem dados de receita</p>
      </div>
    );
  }
  const enrichedData = data.map((d) => {
    const path: EntityPath =
      entityType === "campaign" ? { campaign: d.name }
      : entityType === "adset" ? { adset: d.name }
      : { ad: d.name };
    return {
      ...d,
      formula: enrichFormulaForEntity(buildFunnelRevenueFormula(d.revenue, funnelContext), path),
    };
  });
  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
        <BarChart data={enrichedData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#fff" }} tickFormatter={(v) => fmtCurrency(v)} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#fff" }} />
          <Tooltip content={<FormulaChartTooltip />} />
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
