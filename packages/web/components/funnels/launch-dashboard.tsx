"use client";

import { useState } from "react";
import {
  DollarSign,
  Users,
  Target,
  ShoppingCart,
  Banknote,
  TrendingUp,
  LinkIcon,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
  useTopPerformers,
  usePlacementBreakdown,
  useCampaignDailyInsights,
  type PlacementInsight,
  type TopPerformerAd,
} from "@/lib/hooks/use-traffic-analytics";
import { ConversionFunnel } from "./conversion-funnel";
import type { Funnel } from "@loyola-x/shared";

interface LaunchDashboardProps {
  funnel: Funnel;
  projectId: string;
}

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
];

function fmtCurrency(val: number | null): string {
  if (val === null || val === 0) return "—";
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

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

export function LaunchDashboard({ funnel, projectId }: LaunchDashboardProps) {
  const [days, setDays] = useState(30);
  const campaignId = funnel.campaignId;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId,
    days,
    campaignId,
  );
  const { data: topData, isLoading: topLoading } = useTopPerformers(
    projectId,
    "ctr",
    5,
    days,
    campaignId,
  );
  const { data: placementData, isLoading: placementLoading } =
    usePlacementBreakdown(projectId, days, campaignId);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, campaignId, days);

  if (!campaignId) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center space-y-2">
        <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">
          Nenhuma campanha vinculada a este funil.
        </p>
        <p className="text-sm text-muted-foreground">
          Edite o funil para vincular uma campanha do Meta Ads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end">
        <Select
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      {overviewLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            icon={DollarSign}
            label="Investido"
            value={fmtCurrency(overview.totalSpend)}
          />
          <KpiCard
            icon={Users}
            label="Leads"
            value={fmtNumber(overview.totalLeads ?? overview.totalReach)}
          />
          <KpiCard
            icon={Target}
            label="CPL"
            value={fmtCurrency(overview.avgCpl)}
          />
          <KpiCard
            icon={ShoppingCart}
            label="Vendas"
            value={fmtNumber(overview.totalSales)}
          />
          <KpiCard
            icon={Banknote}
            label="Receita"
            value={fmtCurrency(overview.totalRevenue)}
          />
          <KpiCard
            icon={TrendingUp}
            label="ROAS"
            value={
              overview.totalRevenue && overview.totalSpend > 0
                ? `${(overview.totalRevenue / overview.totalSpend).toFixed(2)}x`
                : "—"
            }
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Spend daily chart */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Investimento Diário</h3>
        {dailyLoading ? (
          <Skeleton className="h-64" />
        ) : dailyData && dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={dailyData.map((d) => ({
                date: d.date_start.slice(5),
                spend: safeNum(d.spend),
              }))}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "Spend"]}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="hsl(45 90% 55%)"
                fill="hsl(45 90% 55% / 0.15)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Two-column: Conversion Funnel + Top Creatives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Funil de Conversão</h3>
          {overviewLoading ? (
            <Skeleton className="h-48" />
          ) : overview ? (
            <ConversionFunnel
              impressions={overview.totalReach ?? 0}
              clicks={
                overview.totalSpend > 0 && overview.avgCpl
                  ? Math.round(overview.totalSpend / overview.avgCpl)
                  : 0
              }
              leads={overview.totalLeads}
              sales={overview.totalSales}
            />
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Top Creatives */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Top Criativos (CTR)</h3>
          {topLoading ? (
            <Skeleton className="h-48" />
          ) : topData?.topPerformers && topData.topPerformers.length > 0 ? (
            <div className="space-y-2">
              {topData.topPerformers.slice(0, 5).map((ad) => (
                <CreativeRow key={ad.campaignId} ad={ad} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sem dados de criativos
            </p>
          )}
        </div>
      </div>

      {/* Placement Breakdown */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Distribuição por Placement</h3>
        {placementLoading ? (
          <Skeleton className="h-32" />
        ) : placementData?.placements && placementData.placements.length > 0 ? (
          <PlacementTable placements={placementData.placements} />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sem dados de placement
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CreativeRow({ ad }: { ad: TopPerformerAd }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-b last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{ad.campaignName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {fmtCurrency(ad.spend)} spend
        </p>
      </div>
      <div className="text-right shrink-0 ml-2">
        <p className="font-medium tabular-nums">{fmtPercent(ad.ctr)}</p>
        <p className="text-xs text-muted-foreground">
          {fmtNumber(ad.clicks)} cliques
        </p>
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
            <th className="text-right py-2 font-medium">Spend</th>
            <th className="text-right py-2 font-medium">Impressões</th>
            <th className="text-right py-2 font-medium">CTR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={`${p.platform}-${p.position}`} className="border-b last:border-0">
              <td className="py-1.5">
                <span className="capitalize">{p.platform}</span>
                <span className="text-muted-foreground"> / {p.position}</span>
              </td>
              <td className="text-right tabular-nums">{fmtCurrency(p.spend)}</td>
              <td className="text-right tabular-nums">{fmtNumber(p.impressions)}</td>
              <td className="text-right tabular-nums">{fmtPercent(p.ctr)}</td>
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
      <p className="text-sm text-muted-foreground">
        Campanha sem dados no período selecionado.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Tente selecionar um período diferente.
      </p>
    </div>
  );
}
