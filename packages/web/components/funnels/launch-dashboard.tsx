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
  useCampaignDailyInsights,
  type CampaignDailyInsight,
} from "@/lib/hooks/use-traffic-analytics";
import { ConversionFunnel } from "./conversion-funnel";
import { CrossedFunnelDailyTable } from "./crossed-funnel-daily-table";
import { CplComparisonChart } from "./cpl-comparison-chart";
import { LeadsCumulativeChart } from "./leads-cumulative-chart";
import { HotColdSpendDonut } from "./hot-cold-spend-donut";
import { TopCreativesGallery } from "./top-creatives-gallery";
import { CampaignSelector } from "./campaign-selector";
import type { Funnel, FunnelCampaign, StageType } from "@loyola-x/shared";
import { StageSalesSection } from "./stage-sales-section";
import { useCampaignPicker, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import { useSurveyAggregation } from "@/lib/hooks/use-survey-aggregation";
import { SurveyQualificationSection } from "./survey-qualification-section";
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
  const [days, setDays] = useState(30);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const { data: pickerData } = useCampaignPicker(showCampaignManager ? projectId : null);
  const updateFunnel = useUpdateFunnel(projectId, funnel.id);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const campaignIdSet = new Set(campaignIds);
  const firstCampaignId = campaignIds[0] ?? null;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId, days, campaignIds.length > 0 ? campaignIds : null,
  );
  const metrics = useCrossedFunnelMetrics(projectId, funnel, days);
  const survey = useSurveyAggregation(projectId, funnel.id, days);
  const { data: campaignData } = useTrafficCampaigns(projectId, days);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, firstCampaignId, days);

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
      {/* Header: period selector + campaign manager */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DayRangePicker days={days} onDaysChange={setDays} />
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

      {/* KPI Cards — Meta only */}
      {overviewLoading || metrics.isLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        (() => {
          const f = { days, funnelType: "launch" as const, funnelName: funnel?.name };
          return (
            <div className={`grid gap-3 grid-cols-2 sm:grid-cols-4 ${surveyResponseRate !== null ? "lg:grid-cols-8" : "lg:grid-cols-7"}`}>
              <MetricTooltip label="Investimento" value={fmtCurrency(metrics.spend)} formula={buildFunnelSpendFormula(metrics.spend, f)}>
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(metrics.spend)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="Leads" value={metrics.hasLinkedSheet ? fmtNumber(metrics.totalLeads) : "—"} formula={metrics.hasLinkedSheet ? buildFunnelLeadsFormula(metrics.totalLeads, f, { pagos: metrics.leadsPagos, org: metrics.leadsOrg, semTrack: metrics.leadsSemTrack }) : undefined}>
                <KpiCard
                  icon={Users}
                  label="Leads"
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
                <KpiCard icon={Percent} label="CTR" value={fmtPercent(metrics.ctr)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="CPC" value={fmtCurrency(metrics.cpc)} formula={buildFunnelCpcFormula(metrics.cpc, f)}>
                <KpiCard icon={MousePointerClick} label="CPC" value={fmtCurrency(metrics.cpc)} hintTooltip />
              </MetricTooltip>
              <MetricTooltip label="CPM" value={fmtCurrency(metrics.cpm)} formula={buildFunnelCpmFormula(metrics.cpm, f)}>
                <KpiCard icon={BarChart3} label="CPM" value={fmtCurrency(metrics.cpm)} hintTooltip />
              </MetricTooltip>
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
            </div>
          );
        })()
      ) : <EmptyState />}

      {/* Dados diários — tabela cruzada (Story 18.3) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <CrossedFunnelDailyTable rows={metrics.rows} totals={metrics.totals} />
      ) : null}

      {/* CPL Pago vs CPL Geral (Story 18.4) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <CplComparisonChart rows={metrics.rows} />
      ) : null}

      {/* Leads Acumulados (Story 18.4) */}
      {metrics.hasLinkedSheet && metrics.rows.length > 0 ? (
        <LeadsCumulativeChart rows={metrics.rows} />
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
          {overview ? (
            <ConversionFunnel
              impressions={overview.totalImpressions}
              linkClicks={overview.totalLinkClicks}
              landingPageViews={overview.totalLandingPageViews}
              leads={metrics.totalLeads}
            />
          ) : <EmptyState />}
        </div>
      </div>

      {/* Top Creatives Gallery — movido pro final do dashboard (Story 18.4) */}
      <TopCreativesGallery
        projectId={projectId}
        days={days}
        campaignIds={campaignIds}
        funnelId={funnel.id}
        funnelContext={{ days, funnelType: "launch", funnelName: funnel?.name }}
        surveyDataByAdId={survey.byAdId}
      />

      {/* Resultados da Pesquisa — Qualificação do público (Story 18.6 sub-feature 3.a) */}
      <SurveyQualificationSection
        isLoading={survey.isLoading}
        hasSurveys={survey.totalResponses > 0 || !!survey.fallbackReason}
        data={{
          byQuestion: survey.byQuestion,
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
// Sub-components
// ============================================================

const KpiCard = React.forwardRef<HTMLDivElement, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: React.ReactNode;
  hintTooltip?: boolean;
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, subValue, hintTooltip, className, ...rest },
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

// ============================================================
// CTR × CPM — Saturation Chart (ref: Samuel Diogenes)
// ============================================================

function CtrCpmChart({ data }: { data: CampaignDailyInsight[] }) {
  const chartData = data.map((d) => {
    const dateLabel = d.date_start.slice(5, 10);
    const ctr = safeNum(d.ctr);
    const cpm = safeNum(d.cpm);
    return {
      date: dateLabel,
      ctr,
      cpm,
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
