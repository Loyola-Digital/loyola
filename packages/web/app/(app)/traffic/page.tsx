"use client";

import { useState } from "react";
import {
  TrendingUp,
  Settings,
  DollarSign,
  Eye,
  MousePointerClick,
  Percent,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  useMetaAdsAccounts,
  useMetaAdsCampaignInsights,
  useMetaAdsDailyInsights,
  useMetaAdsAdSets,
  useMetaAdsAds,
  type MetaCampaignInsight,
} from "@/lib/hooks/use-meta-ads";
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

// ============================================================
// HELPERS
// ============================================================

function fmtCurrency(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}K`;
  return `R$ ${val.toFixed(2)}`;
}

function fmtNumber(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number): string {
  return `${val.toFixed(2)}%`;
}

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

// ============================================================
// PERIOD OPTIONS
// ============================================================

const PERIOD_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
] as const;

// ============================================================
// SUMMARY CARDS
// ============================================================

function SummaryCards({ insights }: { insights: MetaCampaignInsight[] }) {
  const totals = insights.reduce(
    (acc, i) => ({
      spend: acc.spend + safeNum(i.spend),
      impressions: acc.impressions + safeNum(i.impressions),
      clicks: acc.clicks + safeNum(i.clicks),
    }),
    { spend: 0, impressions: 0, clicks: 0 }
  );

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpm = totals.impressions > 0 ? (totals.spend * 1000) / totals.impressions : 0;

  const cards = [
    { label: "Spend Total", value: fmtCurrency(totals.spend), icon: DollarSign },
    { label: "Impressões", value: fmtNumber(totals.impressions), icon: Eye },
    { label: "Cliques", value: fmtNumber(totals.clicks), icon: MousePointerClick },
    { label: "CTR Médio", value: fmtPercent(ctr), icon: Percent },
    { label: "CPC Médio", value: fmtCurrency(cpc), icon: DollarSign },
    { label: "CPM Médio", value: fmtCurrency(cpm), icon: DollarSign },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border/30 bg-card/60 p-4"
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <card.icon className="h-3.5 w-3.5" />
            <span className="text-xs">{card.label}</span>
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

function DailyChart({
  accountId,
  days,
}: {
  accountId: string;
  days: number;
}) {
  const { data: dailyData, isLoading } = useMetaAdsDailyInsights(accountId, days);

  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  if (!dailyData || dailyData.length === 0) {
    return null;
  }

  const chartData = dailyData.map((d) => ({
    date: d.date_start.slice(5, 10), // MM-DD
    spend: safeNum(d.spend),
    clicks: safeNum(d.clicks),
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5">
      <h3 className="text-sm font-semibold mb-4">Spend & Cliques Diários</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            yAxisId="spend"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(v) => `R$${v}`}
          />
          <YAxis
            yAxisId="clicks"
            orientation="right"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend />
          <Line
            yAxisId="spend"
            type="monotone"
            dataKey="spend"
            stroke="hsl(47 98% 54%)"
            strokeWidth={2}
            dot={false}
            name="Spend (R$)"
          />
          <Line
            yAxisId="clicks"
            type="monotone"
            dataKey="clicks"
            stroke="hsl(200 80% 60%)"
            strokeWidth={2}
            dot={false}
            name="Cliques"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// AD SET / AD ROWS
// ============================================================

function AdSetRows({
  accountId,
  campaignId,
  days,
}: {
  accountId: string;
  campaignId: string;
  days: number;
}) {
  const { data: adsets, isLoading } = useMetaAdsAdSets(accountId, campaignId, days);
  const [expandedAdSet, setExpandedAdSet] = useState<string | null>(null);

  if (isLoading) return <tr><td colSpan={9} className="py-2 px-4"><Skeleton className="h-8" /></td></tr>;
  if (!adsets || adsets.length === 0) return <tr><td colSpan={9} className="py-2 px-8 text-xs text-muted-foreground">Nenhum ad set encontrado</td></tr>;

  return (
    <>
      {adsets.map((as) => {
        const ins = as.insights;
        const isExpanded = expandedAdSet === as.id;
        return (
          <AdSetRow
            key={as.id}
            adset={as}
            ins={ins}
            isExpanded={isExpanded}
            onToggle={() => setExpandedAdSet(isExpanded ? null : as.id)}
            accountId={accountId}
            days={days}
          />
        );
      })}
    </>
  );
}

function AdSetRow({
  adset,
  ins,
  isExpanded,
  onToggle,
  accountId,
  days,
}: {
  adset: { id: string; name: string; status: string };
  ins: { impressions: string; clicks: string; spend: string; ctr: string; cpc: string; cpm: string } | null;
  isExpanded: boolean;
  onToggle: () => void;
  accountId: string;
  days: number;
}) {
  return (
    <>
      <tr
        className="border-t border-border/20 bg-muted/20 hover:bg-muted/40 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2 px-4 text-xs pl-10">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {adset.name}
          </span>
        </td>
        <td className="py-2 px-3 text-xs">
          <Badge variant={adset.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
            {adset.status}
          </Badge>
        </td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.spend)) : "—"}</td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtNumber(safeNum(ins.impressions)) : "—"}</td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtNumber(safeNum(ins.clicks)) : "—"}</td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtPercent(safeNum(ins.ctr)) : "—"}</td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.cpc)) : "—"}</td>
        <td className="py-2 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.cpm)) : "—"}</td>
      </tr>
      {isExpanded && (
        <AdRows accountId={accountId} adsetId={adset.id} days={days} />
      )}
    </>
  );
}

function AdRows({
  accountId,
  adsetId,
  days,
}: {
  accountId: string;
  adsetId: string;
  days: number;
}) {
  const { data: ads, isLoading } = useMetaAdsAds(accountId, adsetId, days);

  if (isLoading) return <tr><td colSpan={9} className="py-2 px-4"><Skeleton className="h-6" /></td></tr>;
  if (!ads || ads.length === 0) return <tr><td colSpan={9} className="py-1 px-12 text-xs text-muted-foreground">Nenhum ad encontrado</td></tr>;

  return (
    <>
      {ads.map((ad) => {
        const ins = ad.insights;
        return (
          <tr key={ad.id} className="border-t border-border/10 bg-muted/10">
            <td className="py-1.5 px-4 text-xs pl-16 text-muted-foreground">{ad.name}</td>
            <td className="py-1.5 px-3 text-xs">
              <Badge variant={ad.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                {ad.status}
              </Badge>
            </td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.spend)) : "—"}</td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtNumber(safeNum(ins.impressions)) : "—"}</td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtNumber(safeNum(ins.clicks)) : "—"}</td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtPercent(safeNum(ins.ctr)) : "—"}</td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.cpc)) : "—"}</td>
            <td className="py-1.5 px-3 text-xs text-right">{ins ? fmtCurrency(safeNum(ins.cpm)) : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}

// ============================================================
// CAMPAIGN TABLE
// ============================================================

function CampaignTable({
  insights,
  accountId,
  days,
}: {
  insights: MetaCampaignInsight[];
  accountId: string;
  days: number;
}) {
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-8 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma campanha ativa neste período</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">Campanhas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-xs font-medium text-muted-foreground py-2.5 px-4">Nome</th>
              <th className="text-left text-xs font-medium text-muted-foreground py-2.5 px-3">Status</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">Spend</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">Impressões</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">Cliques</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">CTR</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">CPC</th>
              <th className="text-right text-xs font-medium text-muted-foreground py-2.5 px-3">CPM</th>
            </tr>
          </thead>
          <tbody>
            {insights.map((campaign) => {
              const isExpanded = expandedCampaign === campaign.campaign_id;
              const impressions = safeNum(campaign.impressions);
              const clicks = safeNum(campaign.clicks);
              const spend = safeNum(campaign.spend);
              const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
              const cpc = clicks > 0 ? spend / clicks : 0;
              const cpm = impressions > 0 ? (spend * 1000) / impressions : 0;

              return (
                <CampaignRow
                  key={campaign.campaign_id}
                  campaign={campaign}
                  spend={spend}
                  impressions={impressions}
                  clicks={clicks}
                  ctr={ctr}
                  cpc={cpc}
                  cpm={cpm}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpandedCampaign(isExpanded ? null : campaign.campaign_id)
                  }
                  accountId={accountId}
                  days={days}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  spend,
  impressions,
  clicks,
  ctr,
  cpc,
  cpm,
  isExpanded,
  onToggle,
  accountId,
  days,
}: {
  campaign: MetaCampaignInsight;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  isExpanded: boolean;
  onToggle: () => void;
  accountId: string;
  days: number;
}) {
  return (
    <>
      <tr
        className="border-t border-border/20 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {campaign.campaign_name}
          </span>
        </td>
        <td className="py-2.5 px-3">
          <Badge variant="default" className="text-[10px]">ACTIVE</Badge>
        </td>
        <td className="py-2.5 px-3 text-sm text-right font-medium">{fmtCurrency(spend)}</td>
        <td className="py-2.5 px-3 text-sm text-right">{fmtNumber(impressions)}</td>
        <td className="py-2.5 px-3 text-sm text-right">{fmtNumber(clicks)}</td>
        <td className="py-2.5 px-3 text-sm text-right">{fmtPercent(ctr)}</td>
        <td className="py-2.5 px-3 text-sm text-right">{fmtCurrency(cpc)}</td>
        <td className="py-2.5 px-3 text-sm text-right">{fmtCurrency(cpm)}</td>
      </tr>
      {isExpanded && (
        <AdSetRows accountId={accountId} campaignId={campaign.campaign_id} days={days} />
      )}
    </>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function TrafficPage() {
  const { data: accounts, isLoading: loadingAccounts } = useMetaAdsAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Auto-select first account
  const activeAccountId = selectedAccountId ?? accounts?.[0]?.id ?? null;

  const { data: campaignInsights, isLoading: loadingInsights } =
    useMetaAdsCampaignInsights(activeAccountId, days);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand/60 mb-0.5">
            Loyola X · Tráfego
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        </div>
        <Link
          href="/settings/traffic"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Gerenciar contas
        </Link>
      </div>

      {/* Loading accounts */}
      {loadingAccounts && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-80 rounded-lg" />
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}

      {/* Empty state */}
      {!loadingAccounts && (!accounts || accounts.length === 0) && (
        <div className="rounded-2xl border border-border/30 bg-card/60 p-12 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium text-lg">Nenhuma conta de anúncios</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Conecte uma conta Meta Ads para começar a acompanhar campanhas.
          </p>
          <Link
            href="/settings/traffic"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Ir para Settings
          </Link>
        </div>
      )}

      {/* Dashboard */}
      {accounts && accounts.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Account selector */}
            <select
              value={activeAccountId ?? ""}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded-lg border border-border/40 bg-card px-3 py-2 text-sm"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} (act_{acc.metaAccountId})
                </option>
              ))}
            </select>

            {/* Period filter */}
            <div className="flex rounded-lg border border-border/40 overflow-hidden">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    days === opt.value
                      ? "bg-brand text-brand-foreground"
                      : "bg-card hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          {loadingInsights && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          )}
          {campaignInsights && <SummaryCards insights={campaignInsights} />}

          {/* Daily Chart */}
          {activeAccountId && (
            <DailyChart accountId={activeAccountId} days={days} />
          )}

          {/* Campaign Table */}
          {loadingInsights && <Skeleton className="h-60 rounded-xl" />}
          {campaignInsights && activeAccountId && (
            <CampaignTable
              insights={campaignInsights}
              accountId={activeAccountId}
              days={days}
            />
          )}
        </>
      )}
    </div>
  );
}
