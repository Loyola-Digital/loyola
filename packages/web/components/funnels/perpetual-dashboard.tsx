"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Users,
  Target,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  LinkIcon,
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
  useTopPerformers,
  usePlacementBreakdown,
  useCampaignDailyInsights,
  type PlacementInsight,
  type TopPerformerAd,
} from "@/lib/hooks/use-traffic-analytics";
import type { Funnel } from "@loyola-x/shared";

interface PerpetualDashboardProps {
  funnel: Funnel;
  projectId: string;
}

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

const PLACEMENT_COLORS = [
  "hsl(45 90% 55%)",
  "hsl(200 80% 60%)",
  "hsl(150 60% 50%)",
  "hsl(280 60% 55%)",
  "hsl(350 70% 55%)",
  "hsl(30 80% 55%)",
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

export function PerpetualDashboard({ funnel, projectId }: PerpetualDashboardProps) {
  const [days, setDays] = useState(30);
  const campaignIds = funnel.campaigns.map((c) => c.id);
  const firstCampaignId = campaignIds[0] ?? null;

  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId,
    days,
    campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: prevOverview } = useTrafficOverview(
    projectId,
    days * 2,
    campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: topData, isLoading: topLoading } = useTopPerformers(
    projectId,
    "ctr",
    10,
    days,
    firstCampaignId,
  );
  const { data: placementData, isLoading: placementLoading } =
    usePlacementBreakdown(projectId, days, campaignIds.length > 0 ? campaignIds : null);
  const { data: dailyData, isLoading: dailyLoading } =
    useCampaignDailyInsights(projectId, firstCampaignId, days);

  // Calculate period comparison
  const comparison = useMemo(() => {
    if (!overview || !prevOverview) return null;
    const prevSpend = prevOverview.totalSpend - overview.totalSpend;
    const spendDelta = prevSpend > 0 ? ((overview.totalSpend - prevSpend) / prevSpend) * 100 : null;
    return { spendDelta };
  }, [overview, prevOverview]);

  // CPL daily trend
  const cplTrend = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.map((d) => {
      const spend = safeNum(d.spend);
      const clicks = safeNum(d.clicks);
      return {
        date: d.date_start.slice(5),
        cpl: clicks > 0 ? spend / clicks : 0,
        spend,
      };
    });
  }, [dailyData]);

  const avgCpl = useMemo(() => {
    if (cplTrend.length === 0) return 0;
    const totalCpl = cplTrend.reduce((s, d) => s + d.cpl, 0);
    return totalCpl / cplTrend.length;
  }, [cplTrend]);

  // Spend + ROAS dual data
  const spendRoasData = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.map((d) => ({
      date: d.date_start.slice(5),
      spend: safeNum(d.spend),
      roas: 0, // ROAS requires revenue data per day — placeholder
    }));
  }, [dailyData]);

  if (campaignIds.length === 0) {
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
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
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

      {/* KPI Cards with comparison */}
      {overviewLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            icon={DollarSign}
            label="Investido"
            value={fmtCurrency(overview.totalSpend)}
            delta={comparison?.spendDelta}
          />
          <KpiCard
            icon={Target}
            label="CAC"
            value={fmtCurrency(
              overview.totalSales && overview.totalSales > 0
                ? overview.totalSpend / overview.totalSales
                : null,
            )}
          />
          <KpiCard
            icon={Users}
            label="CPL"
            value={fmtCurrency(overview.avgCpl)}
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
          <KpiCard
            icon={ShoppingCart}
            label="Vendas"
            value={fmtNumber(overview.totalSales)}
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Spend Trend Chart */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Tendência de Investimento</h3>
        {dailyLoading ? (
          <Skeleton className="h-64" />
        ) : spendRoasData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={spendRoasData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
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
              <Legend />
              <Line
                type="monotone"
                dataKey="spend"
                name="Spend (R$)"
                stroke="hsl(45 90% 55%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* CPL Trend */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Tendência CPL</h3>
        <p className="text-xs text-muted-foreground">
          Custo por clique como proxy de CPL. Linha pontilhada = média do período.
        </p>
        {dailyLoading ? (
          <Skeleton className="h-48" />
        ) : cplTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={cplTrend} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${v.toFixed(1)}`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "CPL"]}
              />
              <ReferenceLine
                y={avgCpl}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{
                  value: `Média: R$${avgCpl.toFixed(2)}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <Line
                type="monotone"
                dataKey="cpl"
                stroke="hsl(200 80% 60%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Two-column: Creatives Table + Placement Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Creatives */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Criativos Ativos</h3>
          {topLoading ? (
            <Skeleton className="h-48" />
          ) : topData?.topPerformers && topData.topPerformers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 font-medium">Nome</th>
                    <th className="text-right py-2 font-medium">Spend</th>
                    <th className="text-right py-2 font-medium">CTR</th>
                    <th className="text-right py-2 font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {topData.topPerformers.map((ad, i) => (
                    <tr
                      key={ad.campaignId}
                      className={`border-b last:border-0 ${
                        i === 0
                          ? "bg-emerald-500/5"
                          : i === topData.topPerformers.length - 1
                            ? "bg-red-500/5"
                            : ""
                      }`}
                    >
                      <td className="py-1.5 truncate max-w-[150px]">{ad.campaignName}</td>
                      <td className="text-right tabular-nums">{fmtCurrency(ad.spend)}</td>
                      <td className="text-right tabular-nums">{fmtPercent(ad.ctr)}</td>
                      <td className="text-right tabular-nums">{fmtCurrency(ad.cpc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sem dados de criativos
            </p>
          )}
        </div>

        {/* Placement Distribution */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-medium">Distribuição por Placement</h3>
          {placementLoading ? (
            <Skeleton className="h-48" />
          ) : placementData?.placements && placementData.placements.length > 0 ? (
            <PlacementDonut placements={placementData.placements} />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sem dados de placement
            </p>
          )}
        </div>
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
  delta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        {delta !== null && delta !== undefined && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              delta >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function PlacementDonut({ placements }: { placements: PlacementInsight[] }) {
  const data = placements
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 6)
    .map((p) => ({
      name: `${p.platform} / ${p.position}`,
      value: p.spend,
    }));

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            strokeWidth={1}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={PLACEMENT_COLORS[i % PLACEMENT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "11px",
            }}
            formatter={(v) => [fmtCurrency(Number(v)), "Spend"]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1 text-xs">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: PLACEMENT_COLORS[i % PLACEMENT_COLORS.length] }}
            />
            <span className="truncate max-w-[120px]">{d.name}</span>
            <span className="text-muted-foreground tabular-nums ml-auto">
              {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
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
