"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { InsightEntry } from "@/lib/hooks/use-instagram";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReachChartProps {
  data?: InsightEntry[];
  isLoading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface ChartPoint {
  date: string;
  reach: number;
  impressions: number;
  engaged: number;
}

// Only match entries that have a time series values array (skip total_value metrics)
function hasTimeSeries(e: InsightEntry): boolean {
  return Array.isArray(e.values) && e.values.length > 0;
}

function buildChartData(entries: InsightEntry[]): ChartPoint[] {
  const reachEntry = entries.find((e) => e.name === "reach" && hasTimeSeries(e));
  const impressionsEntry = entries.find(
    (e) => ["impressions", "views", "profile_views"].includes(e.name) && hasTimeSeries(e),
  );
  // accounts_engaged may be total_value only (no time series) — skip if so
  const engagedEntry = entries.find((e) => e.name === "accounts_engaged" && hasTimeSeries(e));

  if (!reachEntry) return [];

  return reachEntry.values.map((v, i) => ({
    date: v.end_time ? format(parseISO(v.end_time), "dd/MM", { locale: ptBR }) : String(i),
    reach: typeof v.value === "number" ? v.value : 0,
    impressions:
      impressionsEntry && typeof impressionsEntry.values[i]?.value === "number"
        ? (impressionsEntry.values[i].value as number)
        : 0,
    engaged:
      engagedEntry && typeof engagedEntry.values[i]?.value === "number"
        ? (engagedEntry.values[i].value as number)
        : 0,
  }));
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function ReachChart({ data, isLoading, error, onRefresh, isRefreshing }: ReachChartProps) {
  const chartData = data ? buildChartData(data) : [];
  const hasImpressions = chartData.some((p) => p.impressions > 0);
  const hasEngaged = chartData.some((p) => p.engaged > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Alcance Diario</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-destructive text-center px-4">
            {error.message}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Sem dados disponíveis
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[400px]">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#fff" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#fff" }} width={45} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "#fff" }} formatter={(value) => formatNumber(Number(value))} />
                  <Legend wrapperStyle={{ color: "#fff" }} />
                  <Line type="monotone" dataKey="reach" name="Alcance" stroke="#d4a843" strokeWidth={2} dot={false} />
                  {hasImpressions && (
                    <Line type="monotone" dataKey="impressions" name="Impressões" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  )}
                  {hasEngaged && (
                    <Line type="monotone" dataKey="engaged" name="Engajamento" stroke="#34d399" strokeWidth={2} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
