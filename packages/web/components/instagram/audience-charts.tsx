"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { InsightEntry } from "@/lib/hooks/use-instagram";

interface AudienceChartsProps {
  data?: InsightEntry[];
  isLoading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface BarItem {
  name: string;
  value: number;
  percent: number;
}

function parseBreakdown(entry?: InsightEntry): BarItem[] {
  if (!entry || !Array.isArray(entry.values) || entry.values.length === 0) return [];
  const v = entry.values[0].value;
  if (typeof v !== "object" || v === null) return [];
  const items = Object.entries(v as Record<string, number>)
    .map(([name, value]) => ({ name, value, percent: 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const max = items[0]?.value ?? 1;
  for (const item of items) {
    item.percent = (item.value / max) * 100;
  }
  return items;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function HorizontalBars({ items, color }: { items: BarItem[]; color: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Sem dados</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground text-right" title={item.name}>
            {item.name}
          </span>
          <div className="flex-1 h-6 rounded-md bg-muted/50 overflow-hidden relative">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{ width: `${Math.max(item.percent, 2)}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-right">
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function GenderAgeChart({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Sem dados</p>;
  }

  // Split by gender
  const femItems = items.filter((i) => i.name.startsWith("F."));
  const mascItems = items.filter((i) => i.name.startsWith("M."));
  const otherItems = items.filter((i) => !i.name.startsWith("F.") && !i.name.startsWith("M."));

  // Merge into age ranges with gender split
  const ageMap = new Map<string, { fem: number; masc: number; other: number }>();
  for (const item of items) {
    const age = item.name.replace(/^[FMU]\./, "");
    const entry = ageMap.get(age) ?? { fem: 0, masc: 0, other: 0 };
    if (item.name.startsWith("F.")) entry.fem = item.value;
    else if (item.name.startsWith("M.")) entry.masc = item.value;
    else entry.other = item.value;
    ageMap.set(age, entry);
  }

  const ageRanges = Array.from(ageMap.entries())
    .sort((a, b) => {
      const na = parseInt(a[0]) || 0;
      const nb = parseInt(b[0]) || 0;
      return na - nb;
    });

  const maxTotal = Math.max(...ageRanges.map(([, v]) => v.fem + v.masc + v.other), 1);

  return (
    <div className="space-y-2">
      {ageRanges.map(([age, vals]) => {
        const total = vals.fem + vals.masc + vals.other;
        const pctFem = (vals.fem / maxTotal) * 100;
        const pctMasc = (vals.masc / maxTotal) * 100;
        const pctOther = (vals.other / maxTotal) * 100;
        return (
          <div key={age} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground text-right">{age}</span>
            <div className="flex-1 h-6 rounded-md bg-muted/50 overflow-hidden flex">
              {pctFem > 0 && (
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pctFem}%`, backgroundColor: "#f472b6" }}
                  title={`Fem: ${formatNumber(vals.fem)}`}
                />
              )}
              {pctMasc > 0 && (
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pctMasc}%`, backgroundColor: "#60a5fa" }}
                  title={`Masc: ${formatNumber(vals.masc)}`}
                />
              )}
              {pctOther > 0 && (
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pctOther}%`, backgroundColor: "#94a3b8" }}
                  title={`Outro: ${formatNumber(vals.other)}`}
                />
              )}
            </div>
            <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-right">
              {formatNumber(total)}
            </span>
          </div>
        );
      })}
      {/* Legend */}
      <div className="flex gap-4 pt-1 pl-20">
        {femItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f472b6" }} />
            <span className="text-[10px] text-muted-foreground">Feminino</span>
          </div>
        )}
        {mascItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#60a5fa" }} />
            <span className="text-[10px] text-muted-foreground">Masculino</span>
          </div>
        )}
        {otherItems.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#94a3b8" }} />
            <span className="text-[10px] text-muted-foreground">Outro</span>
          </div>
        )}
      </div>
    </div>
  );
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
      <CardContent>
        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-[180px] w-full" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4 text-center">{error.message}</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de audiência</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            {/* Gender / Age — full width */}
            {genderAge.length > 0 && (
              <div className="md:col-span-2">
                <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Idade / Gênero
                </p>
                <GenderAgeChart items={genderAge} />
              </div>
            )}

            {/* Countries */}
            {countries.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Top Países
                </p>
                <HorizontalBars items={countries} color="#d4a843" />
              </div>
            )}

            {/* Cities */}
            {cities.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Top Cidades
                </p>
                <HorizontalBars items={cities} color="#60a5fa" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
