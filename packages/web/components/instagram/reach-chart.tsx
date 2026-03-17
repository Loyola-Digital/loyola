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
}

function buildChartData(entries: InsightEntry[]): ChartPoint[] {
  const reachEntry = entries.find((e) => e.name === "reach");
  // v21.0: accounts_engaged replaces impressions/views
  const viewsEntry = entries.find((e) => e.name === "accounts_engaged" || e.name === "views" || e.name === "impressions");

  if (!reachEntry) return [];

  return reachEntry.values.map((v, i) => ({
    date: v.end_time ? format(parseISO(v.end_time), "dd/MM", { locale: ptBR }) : String(i),
    reach: typeof v.value === "number" ? v.value : 0,
    impressions:
      viewsEntry && typeof viewsEntry.values[i]?.value === "number"
        ? (viewsEntry.values[i].value as number)
        : 0,
  }));
}

export function ReachChart({ data, isLoading, error, onRefresh, isRefreshing }: ReachChartProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Alcance & Impressões</CardTitle>
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
                <LineChart data={buildChartData(data)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="reach" name="Alcance" stroke="#d4a843" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="impressions" name="Engajamento" stroke="#94a3b8" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
