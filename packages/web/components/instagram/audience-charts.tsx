"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { InsightEntry } from "@/lib/hooks/use-instagram";

interface AudienceChartsProps {
  data?: InsightEntry[];
  isLoading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface BarPoint {
  name: string;
  value: number;
}

function parseBreakdown(entry?: InsightEntry): BarPoint[] {
  if (!entry || entry.values.length === 0) return [];
  const v = entry.values[0].value;
  if (typeof v !== "object" || v === null) return [];
  return Object.entries(v as Record<string, number>)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function AudienceCharts({ data, isLoading, error, onRefresh, isRefreshing }: AudienceChartsProps) {
  const cityEntry = data?.find((e) => e.name === "audience_city");
  const countryEntry = data?.find((e) => e.name === "audience_country");
  const genderAgeEntry = data?.find((e) => e.name === "audience_gender_age");

  const cities = parseBreakdown(cityEntry);
  const countries = parseBreakdown(countryEntry);
  const genderAge = parseBreakdown(genderAgeEntry);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Audiência</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <>
            <Skeleton className="h-[180px] w-full" />
            <Skeleton className="h-[180px] w-full" />
          </>
        ) : error ? (
          <p className="text-sm text-destructive py-4 text-center">{error.message}</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de audiência</p>
        ) : (
          <>
            {genderAge.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Idade / Gênero</p>
                <div className="overflow-x-auto">
                  <div className="min-w-[300px]">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={genderAge} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={35} />
                        <Tooltip />
                        <Bar dataKey="value" name="Seguidores" fill="#d4a843" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {countries.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Países</p>
                <div className="overflow-x-auto">
                  <div className="min-w-[300px]">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={countries} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={40} />
                        <Tooltip />
                        <Bar dataKey="value" name="Seguidores" fill="#94a3b8" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {cities.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Cidades</p>
                <div className="overflow-x-auto">
                  <div className="min-w-[300px]">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={cities} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={60} />
                        <Tooltip />
                        <Bar dataKey="value" name="Seguidores" fill="#d4a843" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
