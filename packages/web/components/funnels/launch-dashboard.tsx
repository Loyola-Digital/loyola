"use client";

import * as React from "react";
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
  Banknote,
  UserCheck,
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
import { DayRangePicker } from "@/components/ui/day-range-picker";
import {
  useTrafficOverview,
  useTrafficCampaigns,
  useCampaignDailyInsightsBulk,
  type CampaignDailyInsight,
} from "@/lib/hooks/use-traffic-analytics";
import { ConversionFunnel } from "./conversion-funnel";
import { CrossedFunnelDailyTable } from "./crossed-funnel-daily-table";
import { CplComparisonChart } from "./cpl-comparison-chart";
import { LeadsCumulativeChart } from "./leads-cumulative-chart";
import { LeadsTrendAndGoalChart } from "./leads-trend-and-goal-chart";
import { LeadsProjectionCostBasedChart } from "./leads-projection-cost-based-chart";
import { HotColdSpendDonut } from "./hot-cold-spend-donut";
import { HotColdCountDonut } from "./hot-cold-count-donut";
import { TopCreativesGallery } from "./top-creatives-gallery";
import { RefreshDataButton } from "./refresh-data-button";
import { CampaignSelector } from "./campaign-selector";
import type { Funnel, FunnelCampaign, StageType, ComparisonDayMetrics } from "@loyola-x/shared";
import { useMetaAdsComparison } from "@/lib/hooks/use-meta-ads-comparison";
import { StageSalesSection } from "./stage-sales-section";
import { StageCreativePerformanceTable } from "./stage-creative-performance-table";
import { useCampaignPicker, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import { useSurveyAggregation } from "@/lib/hooks/use-survey-aggregation";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";
import { useStageSalesByDay } from "@/lib/hooks/use-stage-sales-by-day";
import { useStageHotColdBuyers } from "@/lib/hooks/use-stage-hot-cold-buyers";
import {
  useFunnelGroupsLink,
  useFunnelGroupsDaily,
} from "@/lib/hooks/use-funnel-groups";
import { useOrganicLeadsByDay } from "@/lib/hooks/use-organic-leads-by-day";
import { useFunnelAdsetsMap } from "@/lib/hooks/use-funnel-adsets-map";
import { SurveyQualificationSection } from "./survey-qualification-section";
import { GroupsDashboardSection } from "./groups-dashboard-section";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelLeadsFormula,
  buildFunnelCplFormula,
  buildFunnelConnectRateFormula,
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  buildFunnelCpmFormula,
  buildFunnelSurveyFormula,
  buildFunnelDailyFormula,
} from "@/lib/formulas/funnels";
import { ClipboardList, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LaunchDashboardProps {
  funnel: Funnel;
  projectId: string;
  stageId?: string;
  stageType?: StageType;
  onCampaignsChange?: (campaigns: FunnelCampaign[]) => void;
}

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

export function LaunchDashboard({ funnel, projectId, stageId, stageType, onCampaignsChange }: LaunchDashboardProps) {
  const [days, setDays] = useState(90);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const { data: pickerData } = useCampaignPicker(showCampaignManager ? projectId : null);
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: salesData } = useStageSalesData(
    stageType === "paid" ? projectId : null,
    stageType === "paid" ? funnel.id : null,
    stageType === "paid" ? (stageId ?? null) : null,
    "capture",
    days,
  );
  const { data: stageHotColdBuyers } = useStageHotColdBuyers(
    stageType === "paid" ? projectId : null,
    stageType === "paid" ? funnel.id : null,
    stageType === "paid" ? (stageId ?? null) : null,
    "capture",
    days,
  );
  const { data: salesByDayData } = useStageSalesByDay(
    stageType === "paid" ? projectId : null,
    stageType === "paid" ? funnel.id : null,
    stageType === "paid" ? (stageId ?? null) : null,
    days,
  );
  const salesByDay = salesByDayData && !salesByDayData.semDados ? salesByDayData.byDay : null;
  const metrics = useCrossedFunnelMetrics(
    projectId,
    funnel,
    days,
    stageId ?? null,
    salesData && !salesData.semDados ? salesData : null,
    salesByDay,
  );
  const survey = useSurveyAggregation(projectId, funnel.id, stageId ?? null);
  const { data: campaignData } = useTrafficCampaigns(projectId, days);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsightsBulk(projectId, campaignIds.length > 0 ? campaignIds : null, days);
  const { data: compData } = useMetaAdsComparison(
    projectId, funnel.id, stageId ?? null, funnel.compareFunnelId, days,
  );

  // Grupos: card "Pessoas no grupo" (último relatório). Renderiza só se vinculado.
  const groupsLinkQuery = useFunnelGroupsLink(projectId, funnel.id);
  const isGroupsLinked = !!groupsLinkQuery.data;
  const groupsDateRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, [days]);
  const groupsDailyQuery = useFunnelGroupsDaily(projectId, funnel.id, {
    from: groupsDateRange.from,
    to: groupsDateRange.to,
    enabled: isGroupsLinked,
  });
  const groupsKpis = groupsDailyQuery.data?.kpis ?? null;
  const showGroupParticipants = isGroupsLinked && groupsKpis !== null && groupsKpis.participants > 0;

  // Breakdown por campanha (cada campanha = "grupo" no contexto Loyola) pra
  // mostrar no tooltip do card "Pessoas no grupo". Pega o último ponto da
  // série de cada campanha e ordena por participantes desc.
  const groupsBreakdownRows = useMemo(() => {
    const campaigns = groupsDailyQuery.data?.campaigns ?? [];
    if (campaigns.length === 0) return [];
    return campaigns
      .map((c) => {
        const last = c.series[c.series.length - 1];
        return { name: c.campaignName, participants: last?.participants ?? 0 };
      })
      .filter((r) => r.participants > 0)
      .sort((a, b) => b.participants - a.participants);
  }, [groupsDailyQuery.data]);

  // Pesquisas orgânicas: linha "Leads Gratuitos" no chart de Leads Acumulados
  const organicLeads = useOrganicLeadsByDay(projectId, funnel.id, stageId ?? null);

  // Map adset_id → adset_name pra resolver utm_medium nos tooltips e tabelas.
  // utm_medium na planilha de leads/vendas armazena o adset_id; aqui resolvemos
  // pro nome humano e re-agrupamos pelos mesmos nomes.
  const { adsetsMap } = useFunnelAdsetsMap(projectId, campaignIds, days);

  const hasComparison = !!(compData && !compData.semDados);
  const compTotals = hasComparison ? compData!.totals : null;
  const compDays = hasComparison ? compData!.days : null;

  function calcDelta(current: number | null | undefined, comparison: number | null): number {
    if (current == null || comparison == null || comparison === 0) return 0;
    return ((current - comparison) / Math.abs(comparison)) * 100;
  }

  const compSpend = compTotals ? compTotals.spend : null;
  const compCtr = compTotals && compTotals.impressions > 0
    ? (compTotals.clicks / compTotals.impressions) * 100
    : null;
  const compCpc = compTotals && compTotals.clicks > 0
    ? compTotals.spend / compTotals.clicks
    : null;
  const compCpm = compTotals && compTotals.impressions > 0
    ? (compTotals.spend / compTotals.impressions) * 1000
    : null;
  const surveyResponseRate = survey && survey.matchedResponses > 0 && metrics.totalLeads > 0
    ? Math.min((survey.matchedResponses / metrics.totalLeads) * 100, 100)
    : null;

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
      {/* Header: period selector + refresh + campaign manager */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <DayRangePicker days={days} onDaysChange={setDays} />
          <RefreshDataButton />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowCampaignManager(!showCampaignManager)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {funnel.campaigns.length} campanha{funnel.campaigns.length !== 1 ? "s" : ""}
        </Button>
      </div>

      {/* Campaign manager (expandable) */}
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
                updateFunnel.mutate(
                  { campaigns },
                  { onSuccess: () => toast.success("Campanhas atualizadas!") }
                );
              }
            }}
          />
        </div>
      )}

      {/* Aviso: etapa equivalente não encontrada no funil de comparação */}
      {compData && compData.semDados && compData.reason === "no_matching_stage" && (
        <p className="text-xs text-muted-foreground/70 border border-border/20 rounded-lg px-3 py-2">
          Nenhuma etapa do tipo equivalente encontrada no funil de comparação.
        </p>
      )}

      {/* KPI Cards — Meta only.
          Se overview vier null (Meta API sem dados pro range escolhido — comum em
          filtros estreitos como "Hoje" antes do dado processar), renderiza cards
          com zeros em vez de esconder a seção. */}
      {overviewLoading || metrics.isLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        (() => {
          const f = { days, funnelType: "launch" as const, funnelName: funnel?.name };
          const showFaturamento = stageType === "paid" && !!stageId && !!salesData && !salesData.semDados;
          const showVendaIngressos = metrics.totalVendas !== null;
          const showTaxaCheckout = metrics.checkoutConversionRate !== null;
          let colCount = 7; // base: Investimento, Leads, CPL, Connect, CTR, CPC, CPM
          if (showFaturamento) colCount++;
          if (showVendaIngressos) colCount++;
          if (showTaxaCheckout) colCount++;
          if (surveyResponseRate !== null) colCount++;
          if (showGroupParticipants) colCount++;
          // Mapa estático — Tailwind JIT não detecta classes dinâmicas em template strings.
          // Breakpoints: xl (1280px) pra grids até 8 cols, 2xl (1536px) pra 9-12 cols.
          // Em telas < xl (notebooks comuns 1024-1279) quebra em sm:grid-cols-4 pra evitar scroll horizontal.
          const gridClass =
            colCount <= 7 ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-7"
              : colCount === 8 ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-8"
                : colCount === 9 ? "grid-cols-2 sm:grid-cols-4 2xl:grid-cols-9"
                  : colCount === 10 ? "grid-cols-2 sm:grid-cols-4 2xl:grid-cols-10"
                    : colCount === 11 ? "grid-cols-2 sm:grid-cols-4 2xl:grid-cols-11"
                      : "grid-cols-2 sm:grid-cols-4 2xl:grid-cols-12";
          return (
            <div className={`grid gap-3 ${gridClass}`}>
              <MetricTooltip label="Investimento" value={fmtCurrency(metrics.spend)} formula={buildFunnelSpendFormula(metrics.spend, f)}>
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(metrics.spend)} hintTooltip
                  comparison={compSpend !== null && metrics.spend != null ? {
                    display: fmtCurrency(compSpend),
                    delta: calcDelta(metrics.spend, compSpend),
                    higherIsBetter: false,
                  } : undefined}
                />
              </MetricTooltip>
              {showFaturamento && (
                <KpiCard
                  icon={Banknote}
                  label="Faturamento"
                  value={fmtCurrency(salesData!.faturamentoBruto)}
                  subValue={
                    (() => {
                      const total = salesData!.faturamentoBruto;
                      const byFonte = new Map(
                        (salesData?.porUtmSource ?? []).map(item => [item.fonte, item])
                      );
                      const order = ["Pago", "Orgânico", "Sem Track"];
                      return (
                        <>
                          {order.map(fonte => {
                            const item = byFonte.get(fonte);
                            const bruto = item?.bruto ?? 0;
                            const pct = total > 0 ? ((bruto / total) * 100).toFixed(0) : "0";
                            return (
                              <div key={fonte}>
                                {fonte}: {fmtCurrency(bruto)} ({pct}%)
                              </div>
                            );
                          })}
                        </>
                      );
                    })()
                  }
                  hintTooltip
                />
              )}
              <MetricTooltip label="Leads" value={metrics.hasLinkedSheet ? fmtNumber(metrics.totalLeads) : "—"} formula={metrics.hasLinkedSheet ? buildFunnelLeadsFormula(metrics.totalLeads, f, { pagos: metrics.leadsPagos, org: metrics.leadsOrg, semTrack: metrics.leadsSemTrack }) : undefined}>
                <KpiCard
                  icon={Users}
                  label={stageType === "paid" ? "Leads Popup" : "Leads únicos"}
                  value={metrics.hasLinkedSheet ? fmtNumber(metrics.totalLeads) : "—"}
                  subValue={metrics.hasLinkedSheet
                    ? (
                      <>
                        <div>Pagos: {fmtNumber(metrics.leadsPagos)}</div>
                        <div>Org: {fmtNumber(metrics.leadsOrg)}</div>
                        <div>S/ Track: {fmtNumber(metrics.leadsSemTrack)}</div>
                      </>
                    )
                    : "Vincule uma planilha"}
                  hintTooltip={metrics.hasLinkedSheet}
                />
              </MetricTooltip>
              {stageType === "paid" && metrics.totalVendas !== null && (
                <KpiCard
                  icon={Banknote}
                  label="Venda ingressos"
                  value={fmtNumber(metrics.totalVendas)}
                  subValue={`${metrics.checkoutVisits ? fmtNumber(metrics.checkoutVisits) : "—"} visitas checkout`}
                />
              )}
              <MetricTooltip label="CPL" value={metrics.hasLinkedSheet ? fmtCurrency(metrics.cplPago) : "—"} formula={metrics.hasLinkedSheet ? buildFunnelCplFormula(metrics.spend, metrics.leadsPagos, f, "pago") : undefined}>
                <KpiCard
                  icon={Target}
                  label="CPL Pago"
                  value={metrics.hasLinkedSheet ? fmtCurrency(metrics.cplPago) : "—"}
                  subValue={metrics.hasLinkedSheet
                    ? `Geral: ${fmtCurrency(metrics.cplGeral)}`
                    : "Vincule uma planilha"}
                  hintTooltip={metrics.hasLinkedSheet}
                />
              </MetricTooltip>
              <MetricTooltip label="Connect Rate" value={fmtPercent(metrics.connectRate)} formula={buildFunnelConnectRateFormula(metrics.connectRate, f)}>
                <KpiCard icon={Link2} label="Connect Rate" value={fmtPercent(metrics.connectRate)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="CTR" value={fmtPercent(metrics.ctr)} formula={buildFunnelCtrFormula(metrics.ctr, f)}>
                <KpiCard icon={Percent} label="CTR" value={fmtPercent(metrics.ctr)} hintTooltip
                  comparison={compCtr !== null && metrics.ctr != null ? {
                    display: fmtPercent(compCtr),
                    delta: calcDelta(metrics.ctr, compCtr),
                    higherIsBetter: true,
                  } : undefined}
                />
              </MetricTooltip>
              <MetricTooltip label="CPC" value={fmtCurrency(metrics.cpc)} formula={buildFunnelCpcFormula(metrics.cpc, f)}>
                <KpiCard icon={MousePointerClick} label="CPC" value={fmtCurrency(metrics.cpc)} hintTooltip
                  comparison={compCpc !== null && metrics.cpc != null ? {
                    display: fmtCurrency(compCpc),
                    delta: calcDelta(metrics.cpc, compCpc),
                    higherIsBetter: false,
                  } : undefined}
                />
              </MetricTooltip>
              <MetricTooltip label="CPM" value={fmtCurrency(metrics.cpm)} formula={buildFunnelCpmFormula(metrics.cpm, f)}>
                <KpiCard icon={BarChart3} label="CPM" value={fmtCurrency(metrics.cpm)} hintTooltip
                  comparison={compCpm !== null && metrics.cpm != null ? {
                    display: fmtCurrency(compCpm),
                    delta: calcDelta(metrics.cpm, compCpm),
                    higherIsBetter: false,
                  } : undefined}
                />
              </MetricTooltip>
              {stageType === "paid" && metrics.checkoutConversionRate !== null && (
                <KpiCard
                  icon={Percent}
                  label="Taxa Checkout"
                  value={fmtPercent(metrics.checkoutConversionRate)}
                  subValue={metrics.vendasPago !== null && metrics.checkoutVisits ? `${fmtNumber(metrics.vendasPago)} ÷ ${fmtNumber(metrics.checkoutVisits)}` : "—"}
                />
              )}
              {surveyResponseRate !== null && survey && (
                <MetricTooltip
                  label="Pesquisa"
                  value={`${surveyResponseRate.toFixed(1)}%`}
                  formula={buildFunnelSurveyFormula(survey.matchedResponses, metrics.totalLeads)}
                >
                  <div className={`rounded-xl border p-3 hover:border-border/50 transition-colors cursor-help ${surveyResponseRate >= 30 ? "border-emerald-500/30 bg-emerald-500/5" : surveyResponseRate >= 10 ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pesquisa</span>
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                    <p className="text-xl font-bold tracking-tight underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">{surveyResponseRate.toFixed(1)}%</p>
                    <p className="text-[9px] text-muted-foreground">{metrics.totalLeads} leads no total</p>
                    <p className="text-[9px] text-muted-foreground">{survey.matchedResponses} com match · {survey.unmatchedResponses} sem match</p>
                  </div>
                </MetricTooltip>
              )}
              {showGroupParticipants && groupsKpis && (
                <GroupsKpiCardWithTooltip
                  participants={groupsKpis.participants}
                  deltaParticipants={groupsKpis.deltaParticipants}
                  asOf={groupsKpis.asOf}
                  rows={groupsBreakdownRows}
                />
              )}
            </div>
          );
        })()
      )}

      {/* Dados diários — tabela cruzada (Story 18.3) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <CrossedFunnelDailyTable
          rows={metrics.rows}
          totals={metrics.totals}
          surveyTotal={survey.totalResponses}
          surveyMatched={survey.matchedResponses}
          surveyUnmatched={survey.unmatchedResponses}
          salesByDay={salesByDay ?? undefined}
          adsetsMap={adsetsMap}
          projectId={projectId}
          funnelId={funnel.id}
          stageType={stageType}
        />
      ) : null}

      {/* CPL Pago vs CPL Geral (Story 18.4) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <CplComparisonChart rows={metrics.rows} />
      ) : null}

      {/* Leads Acumulados (Story 18.4) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <LeadsCumulativeChart
          rows={metrics.rows}
          leadsGratuitosByDay={organicLeads.hasOrganicSurveys ? organicLeads.byDay : undefined}
        />
      ) : null}

      {/* Leads: Tendência + Meta (Story 18.19) + Inputs por Etapa (Story 18.27) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <LeadsTrendAndGoalChart rows={metrics.rows} funnelId={funnel.id} funnel={funnel} projectId={projectId} stageId={stageId} />
      ) : null}

      {/* NOVO: Leads Projeção Baseada em Custo (Story 18.39) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <LeadsProjectionCostBasedChart rows={metrics.rows} funnelId={funnel.id} funnel={funnel} projectId={projectId} stageId={stageId} />
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
          <CtrCpmChart
            data={dailyData}
            comparisonDays={compDays ?? undefined}
            compFunnelName={compData?.compareFunnelName}
          />
        ) : <EmptyState />}
      </div>

      {/* Donut Hot/Cold/Outros + Funil de Conversão lado-a-lado 50/50 (Story 18.4) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {funnelCampaigns.length > 0 ? (
          <HotColdSpendDonut campaigns={funnelCampaigns} />
        ) : (
          <div className="rounded-xl border border-border/30 bg-card/60 p-5">
            <h3 className="text-sm font-semibold mb-4">Distribuição de Investimento</h3>
            <EmptyState />
          </div>
        )}

        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
          <h3 className="text-sm font-semibold mb-4">Funil de Conversão</h3>
          <ConversionFunnel
            impressions={overview?.totalImpressions ?? 0}
            linkClicks={overview?.totalLinkClicks ?? null}
            landingPageViews={overview?.totalLandingPageViews ?? null}
            leads={metrics.totalLeads}
            checkoutVisits={stageType === "paid" ? metrics.checkoutVisits : null}
            sales={stageType === "paid" ? metrics.totalVendas : null}
            leadsLabel={stageType === "paid" ? "Leads Popup" : undefined}
          />
        </div>
      </div>

      {/* Hot/Cold Leads (sempre) + Hot/Cold Compradores (apenas paid) — categorização por utm_term */}
      {(metrics.hotColdLeads || metrics.hotColdBuyers) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metrics.hotColdLeads ? (
            <HotColdCountDonut
              aggregate={metrics.hotColdLeads}
              title="Distribuição de Leads (Hot/Cold)"
              noun={{ singular: "lead", plural: "leads" }}
            />
          ) : (
            <div className="rounded-xl border border-border/30 bg-card/60 p-5">
              <h3 className="text-sm font-semibold mb-4">Distribuição de Leads (Hot/Cold)</h3>
              <p className="py-8 text-center text-sm text-muted-foreground">
                Mapeie a coluna <span className="font-mono">utm_term</span> na planilha de leads para ver a distribuição.
              </p>
            </div>
          )}

          {stageType === "paid" && (() => {
            // Prioriza planilha de stage_sales (Captação) — onde o usuário mapeia utm_term.
            // Fallback pra planilha funnel-spreadsheet (sales/custom) caso a stage não tenha
            // mapping mas o funil tenha.
            const stageBuyers = stageHotColdBuyers?.hasMapping
              ? {
                  hot: stageHotColdBuyers.hot,
                  cold: stageHotColdBuyers.cold,
                  outros: stageHotColdBuyers.outros,
                  total: stageHotColdBuyers.total,
                  items: stageHotColdBuyers.items,
                }
              : null;
            const buyers = stageBuyers ?? metrics.hotColdBuyers;
            return buyers ? (
              <HotColdCountDonut
                aggregate={buyers}
                title="Distribuição de Compradores (Hot/Cold)"
                noun={{ singular: "comprador", plural: "compradores" }}
              />
            ) : (
              <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                <h3 className="text-sm font-semibold mb-4">Distribuição de Compradores (Hot/Cold)</h3>
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Mapeie a coluna <span className="font-mono">utm_term</span> na planilha de vendas (Captação) para ver a distribuição.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Resultados da Pesquisa — Qualificação do público (Story 18.6 sub-feature 3.a) */}
      <SurveyQualificationSection
        isLoading={survey.isLoading}
        hasSurveys={survey.totalResponses > 0 || !!survey.fallbackReason}
        data={{
          byQuestion: survey.byQuestion,
          byQuestionByOrigin: survey.byQuestionByOrigin,
          questions: survey.questions,
          totalResponses: survey.totalResponses,
          usingFallback: survey.usingFallback,
          fallbackReason: survey.fallbackReason,
          matchedResponses: survey.matchedResponses,
          unmatchedResponses: survey.unmatchedResponses,
        }}
      />

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
            stageType={stageType}
            adsetsMap={adsetsMap}
          />
          <div className="border-t border-border/20" />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnel.id}
            stageId={stageId}
            subtype="main_product"
            title="Produto Principal"
            days={days}
            adsetsMap={adsetsMap}
          />
        </div>
      )}

      {/* Grupos — tracking de participantes via planilha (Story 26.1) */}
      <GroupsDashboardSection projectId={projectId} funnelId={funnel.id} />

      {/* Story 18.41: Creative Performance Table for Free stages */}
      {stageType === "free" && stageId && (
        <div className="space-y-4 pt-2 border-t border-border/30">
          <h3 className="text-base font-semibold">Desempenho de Criativos (Meta Ads)</h3>
          <StageCreativePerformanceTable
            funnelId={funnel.id}
            stageId={stageId}
            days={days}
            stageType={stageType}
          />
        </div>
      )}

      {/* Top Creatives Gallery (Story 18.4) */}
      <TopCreativesGallery
        projectId={projectId}
        days={days}
        campaignIds={campaignIds}
        funnelId={funnel.id}
        stageId={stageId}
        funnelContext={{ days, funnelType: "launch", funnelName: funnel?.name }}
        surveyDataByAdId={survey.byAdId}
        surveyDataByAdIdDynamic={survey.byAdIdDynamic}
        surveyQuestions={survey.questions}
      />
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

const KpiCard = React.forwardRef<HTMLDivElement, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: React.ReactNode;
  hintTooltip?: boolean;
  comparison?: { display: string; delta: number; higherIsBetter: boolean };
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, subValue, hintTooltip, comparison, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors ${hintTooltip ? "cursor-help" : ""} ${className ?? ""}`}
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
      {subValue && (
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{subValue}</div>
      )}
    </div>
  );
});

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
      <p className="text-xs text-muted-foreground mt-1">Tente selecionar um período diferente.</p>
    </div>
  );
}

/**
 * Wrapper do KpiCard "Pessoas no grupo" que mostra tooltip com breakdown
 * por grupo seguindo a posição do cursor. Usa position fixed com offset
 * pra ficar próximo do mouse (CSS-only não permite isso — precisa state).
 */
function GroupsKpiCardWithTooltip({
  participants,
  deltaParticipants,
  asOf,
  rows,
}: {
  participants: number;
  deltaParticipants: number;
  asOf: string | null;
  rows: { name: string; participants: number }[];
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const hasTooltip = rows.length > 0;

  // Clamp posição pra não cortar nas bordas direita/inferior da viewport.
  // Tooltip ~280px de largura × ~24px*N+44 de altura. Estimativa simples: se
  // cursor está no quarto direito da viewport, mostra à esquerda do cursor.
  function clampPosition(p: { x: number; y: number }): { x: number; y: number } {
    if (typeof window === "undefined") return p;
    const TOOLTIP_W = 280;
    const TOOLTIP_H = Math.max(120, 24 * rows.length + 60);
    const margin = 8;
    const x = p.x + 12 + TOOLTIP_W > window.innerWidth - margin
      ? p.x - TOOLTIP_W - 12
      : p.x + 12;
    const y = p.y + 12 + TOOLTIP_H > window.innerHeight - margin
      ? p.y - TOOLTIP_H - 12
      : p.y + 12;
    return { x: Math.max(margin, x), y: Math.max(margin, y) };
  }

  const clamped = pos ? clampPosition(pos) : null;

  return (
    <div
      onMouseMove={hasTooltip ? (e) => setPos({ x: e.clientX, y: e.clientY }) : undefined}
      onMouseLeave={() => setPos(null)}
    >
      <KpiCard
        icon={UserCheck}
        label="Pessoas no grupo"
        value={participants.toLocaleString("pt-BR")}
        hintTooltip={hasTooltip}
        subValue={
          <>
            {deltaParticipants !== 0 && (
              <div className={deltaParticipants > 0 ? "text-emerald-400" : "text-red-400"}>
                {deltaParticipants > 0 ? "▲" : "▼"} {Math.abs(deltaParticipants).toLocaleString("pt-BR")} no período
              </div>
            )}
            {asOf && (
              <div className="text-muted-foreground">
                {(() => {
                  const [y, m, d] = asOf.split("-");
                  return `Última sync: ${d}/${m}/${y.slice(2)}`;
                })()}
              </div>
            )}
          </>
        }
      />
      {hasTooltip && clamped && (
        <div
          className="fixed pointer-events-none z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3 text-xs min-w-[240px] max-w-[320px]"
          style={{ left: clamped.x, top: clamped.y }}
        >
          <div className="font-semibold mb-1.5">Por grupo</div>
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.name} className="flex justify-between gap-3">
                <span className="text-muted-foreground truncate flex-1">{r.name}</span>
                <span className="font-medium tabular-nums shrink-0">
                  {r.participants.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CTR × CPM — Saturation Chart (ref: Samuel Diogenes)
// ============================================================

function CtrCpmChart({
  data,
  comparisonDays,
  compFunnelName,
}: {
  data: CampaignDailyInsight[];
  comparisonDays?: ComparisonDayMetrics[];
  compFunnelName?: string;
}) {
  const chartData = data.map((d, idx) => {
    const dateLabel = d.date_start.slice(5, 10);
    const ctr = safeNum(d.ctr);
    const cpm = safeNum(d.cpm);
    return {
      date: dateLabel,
      ctr,
      cpm,
      compCtr: comparisonDays?.[idx]?.ctr ?? undefined,
      formulasByKey: {
        ctr: buildFunnelDailyFormula("CTR", "Meta Ads API · derivado (clicks ÷ impressions × 100)", ctr, false, dateLabel),
        cpm: buildFunnelDailyFormula("CPM", "Meta Ads API · derivado (spend ÷ impressions × 1000)", cpm, true, dateLabel),
      },
    };
  });

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
        <Tooltip content={<FormulaChartTooltip />} />
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
        {comparisonDays && (
          <Line
            yAxisId="ctr"
            type="monotone"
            dataKey="compCtr"
            stroke="hsl(30 100% 60%)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
            name={compFunnelName ? `CTR — ${compFunnelName}` : "CTR (Comparação)"}
          />
        )}
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
