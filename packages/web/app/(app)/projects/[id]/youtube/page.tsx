"use client";

import * as React from "react";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  Play,
  Target,
  TrendingUp,
  Youtube,
  Settings,
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
import { Button } from "@/components/ui/button";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import Link from "next/link";
import { useGoogleAdsAccounts } from "@/lib/hooks/use-google-ads";
import {
  useGoogleAdsOverview,
  useGoogleAdsDailyInsights,
  useGoogleAdsCampaigns,
} from "@/lib/hooks/use-google-ads-analytics";
import { useGoogleAdsCampaignPicker } from "@/lib/hooks/use-funnels";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { FormulaChartTooltip } from "@/components/metrics/formula-chart-tooltip";
import {
  buildYtSpendFormula,
  buildYtViewsFormula,
  buildYtImpressionsFormula,
  buildYtConversionsFormula,
  buildYtCpvFormula,
  buildYtViewRateFormula,
  buildYtCtrFormula,
  buildYtCpcFormula,
  buildYtRetentionFormula,
  buildYtSpendDailyFormula,
  buildYtViewsDailyFormula,
} from "@/lib/formulas/youtube-ads";

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

const KpiCard = React.forwardRef<HTMLDivElement, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
} & React.HTMLAttributes<HTMLDivElement>>(function KpiCard(
  { icon: Icon, label, value, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} {...rest} className={`rounded-xl border border-border/30 bg-gradient-to-br from-card/80 to-card/40 p-3 hover:border-border/50 transition-colors ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
});

export default function ProjectYouTubePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [days, setDays] = useState(30);

  // Find Google Ads account linked to this project
  const { data: pickerData, isLoading: pickerLoading } = useGoogleAdsCampaignPicker(projectId);
  const { data: accounts } = useGoogleAdsAccounts();

  // Find the account ID linked to this project
  const linkedAccount = accounts?.find((a) =>
    a.projects.some((p) => p.projectId === projectId)
  );
  const accountId = linkedAccount?.id ?? pickerData?.accountId ?? null;

  const { data: overview, isLoading: overviewLoading } = useGoogleAdsOverview(accountId, days > 0 ? days : 30);
  const { data: dailyData, isLoading: dailyLoading } = useGoogleAdsDailyInsights(accountId, days > 0 ? days : 30);
  const { data: campaignData, isLoading: campaignsLoading } = useGoogleAdsCampaigns(accountId, days > 0 ? days : 30);

  // No account linked
  if (!pickerLoading && !pickerData?.accountLinked) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Youtube className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-lg">Nenhuma conta Google Ads vinculada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte uma conta Google Ads e vincule a esta empresa nas configuracoes.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/google-ads">
            <Settings className="h-4 w-4" />
            Ir para Configuracoes
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          YouTube Ads
        </h1>
        <DayRangePicker days={days} onDaysChange={setDays} />
      </div>

      {/* KPIs */}
      {overviewLoading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : overview ? (
        (() => {
          const filters = { days: days > 0 ? days : 30, accountName: linkedAccount?.accountName };
          return (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
              <MetricTooltip label="Investimento" value={fmtCurrency(overview.totalSpend)} formula={buildYtSpendFormula(overview.totalSpend, filters)}>
                <KpiCard icon={DollarSign} label="Investimento" value={fmtCurrency(overview.totalSpend)} />
              </MetricTooltip>
              <MetricTooltip label="Views" value={fmtNumber(overview.totalViews)} formula={buildYtViewsFormula(overview.totalViews, filters)}>
                <KpiCard icon={Play} label="Views" value={fmtNumber(overview.totalViews)} />
              </MetricTooltip>
              <MetricTooltip label="CPV" value={fmtCurrency(overview.cpv)} formula={buildYtCpvFormula(overview.totalSpend, overview.totalViews, filters)}>
                <KpiCard icon={Target} label="CPV" value={fmtCurrency(overview.cpv)} />
              </MetricTooltip>
              <MetricTooltip label="View Rate" value={fmtPercent(overview.viewRate)} formula={buildYtViewRateFormula(overview.totalViews, overview.totalImpressions, filters)}>
                <KpiCard icon={Eye} label="View Rate" value={fmtPercent(overview.viewRate)} />
              </MetricTooltip>
              <MetricTooltip label="Impressões" value={fmtNumber(overview.totalImpressions)} formula={buildYtImpressionsFormula(overview.totalImpressions, filters)}>
                <KpiCard icon={Eye} label="Impressoes" value={fmtNumber(overview.totalImpressions)} />
              </MetricTooltip>
              <MetricTooltip label="CTR" value={fmtPercent(overview.ctr)} formula={buildYtCtrFormula(overview.totalClicks, overview.totalImpressions, filters)}>
                <KpiCard icon={Percent} label="CTR" value={fmtPercent(overview.ctr)} />
              </MetricTooltip>
              <MetricTooltip label="CPC" value={fmtCurrency(overview.cpc)} formula={buildYtCpcFormula(overview.totalSpend, overview.totalClicks, filters)}>
                <KpiCard icon={MousePointerClick} label="CPC" value={fmtCurrency(overview.cpc)} />
              </MetricTooltip>
              <MetricTooltip label="Conversões" value={fmtNumber(overview.conversions)} formula={buildYtConversionsFormula(overview.conversions, filters)}>
                <KpiCard icon={TrendingUp} label="Conversoes" value={fmtNumber(overview.conversions)} />
              </MetricTooltip>
            </div>
          );
        })()
      ) : null}

      {/* Daily chart */}
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-4">Spend & Views Diarios</h3>
        {dailyLoading ? (
          <Skeleton className="h-56" />
        ) : dailyData && dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData.map((d) => {
              const dateLabel = d.date.slice(5, 10);
              return {
                date: dateLabel,
                spend: d.spend,
                views: d.views,
                formulasByKey: {
                  spend: buildYtSpendDailyFormula(d.spend, dateLabel),
                  views: buildYtViewsDailyFormula(d.views, dateLabel),
                },
              };
            })}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="spend" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
              <YAxis yAxisId="views" orientation="right" tick={{ fontSize: 11, fill: "#fff" }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<FormulaChartTooltip />} />
              <Legend wrapperStyle={{ color: "#fff" }} />
              <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="hsl(47 98% 54%)" strokeWidth={2} dot={false} name="Spend (R$)" />
              <Line yAxisId="views" type="monotone" dataKey="views" stroke="hsl(0 72% 55%)" strokeWidth={2} dot={false} name="Views" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Sem dados no periodo.</div>
        )}
      </div>

      {/* Retention */}
      {overview?.retention && (overview.retention.p25 > 0 || overview.retention.p100 > 0) && (() => {
        const filters = { days: days > 0 ? days : 30, accountName: linkedAccount?.accountName };
        return (
          <div className="rounded-xl border border-border/30 bg-card/60 p-5">
            <h3 className="text-sm font-semibold mb-4">Retencao de Video</h3>
            <div className="space-y-3">
              {([
                { label: "25%" as const, value: overview.retention.p25, color: "bg-blue-500" },
                { label: "50%" as const, value: overview.retention.p50, color: "bg-blue-400" },
                { label: "75%" as const, value: overview.retention.p75, color: "bg-amber-500" },
                { label: "100%" as const, value: overview.retention.p100, color: "bg-emerald-500" },
              ]).map((bar) => (
                <MetricTooltip key={bar.label} label={`Retenção ${bar.label}`} value={`${(bar.value * 100).toFixed(1)}%`} formula={buildYtRetentionFormula(bar.label, bar.value, filters)}>
                  <div className="flex items-center gap-3 cursor-help">
                    <span className="w-10 text-xs text-muted-foreground text-right">{bar.label}</span>
                    <div className="flex-1 h-6 rounded-md bg-muted/30 overflow-hidden">
                      <div className={`h-full rounded-md ${bar.color}`} style={{ width: `${Math.max(bar.value * 100, 2)}%` }} />
                    </div>
                    <span className="w-12 text-xs font-medium tabular-nums text-right">{(bar.value * 100).toFixed(1)}%</span>
                  </div>
                </MetricTooltip>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Campaigns table */}
      {campaignsLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : campaignData?.campaigns && campaignData.campaigns.length > 0 ? (
        <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-border/20">
            <h3 className="text-sm font-semibold">Campanhas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3">Nome</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Spend</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Views</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPV</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">View Rate</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Impr</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CTR</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">CPC</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2">Conv</th>
                </tr>
              </thead>
              <tbody>
                {campaignData.campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-border/20 hover:bg-muted/30">
                    <td className="py-2 px-3 text-xs font-medium">{c.name}</td>
                    <td className="py-2 px-2 text-xs text-right font-medium">{fmtCurrency(c.spend)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.views)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpv)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.viewRate)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.impressions)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtPercent(c.ctr)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtCurrency(c.cpc)}</td>
                    <td className="py-2 px-2 text-xs text-right">{fmtNumber(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
