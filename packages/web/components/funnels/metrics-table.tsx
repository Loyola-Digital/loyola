"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import type { CampaignAnalytics } from "@/lib/hooks/use-traffic-analytics";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelLeadsFormula,
  buildFunnelCplFormula,
  buildFunnelConnectRateFormula,
  buildFunnelCtrFormula,
  buildFunnelCpcFormula,
  buildFunnelCpmFormula,
  enrichFormulaForEntity,
  type FunnelFilters,
} from "@/lib/formulas/funnels";

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

interface MetricsTableProps {
  title: string;
  rows: CampaignAnalytics[];
  funnel?: FunnelFilters;
  entityType?: "adset" | "ad";
}

type SortableCol = "spend" | "leads" | "cpl" | "connectRate" | "ctr" | "cpc" | "cpm";

interface ColumnDef {
  label: string;
  col: SortableCol;
  fmt: (row: CampaignAnalytics) => string;
  formula: (row: CampaignAnalytics, f: FunnelFilters) => ReturnType<typeof buildFunnelSpendFormula>;
}

const columns: ColumnDef[] = [
  {
    label: "Investimento",
    col: "spend",
    fmt: (r) => fmtCurrency(r.spend),
    formula: (r, f) => buildFunnelSpendFormula(r.spend, f),
  },
  {
    label: "Leads",
    col: "leads",
    fmt: (r) => fmtNumber(r.leads),
    formula: (r, f) => buildFunnelLeadsFormula(r.leads, f),
  },
  {
    label: "CPL",
    col: "cpl",
    fmt: (r) => fmtCurrency(r.cpl),
    formula: (r, f) => buildFunnelCplFormula(r.spend, r.leads, f),
  },
  {
    label: "Connect Rate",
    col: "connectRate",
    fmt: (r) => fmtPercent(r.connectRate),
    formula: (r, f) => buildFunnelConnectRateFormula(r.connectRate, f),
  },
  {
    label: "CTR",
    col: "ctr",
    fmt: (r) => fmtPercent(r.ctr),
    formula: (r, f) => buildFunnelCtrFormula(r.ctr, f),
  },
  {
    label: "CPC",
    col: "cpc",
    fmt: (r) => fmtCurrency(r.cpc),
    formula: (r, f) => buildFunnelCpcFormula(r.cpc, f),
  },
  {
    label: "CPM",
    col: "cpm",
    fmt: (r) => fmtCurrency(r.cpm),
    formula: (r, f) => buildFunnelCpmFormula(r.cpm, f),
  },
];

export function MetricsTable({ title, rows, funnel, entityType }: MetricsTableProps) {
  const [sortCol, setSortCol] = useState<SortableCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const derivedEntityType: "adset" | "ad" = entityType
    ?? (title.toLowerCase().includes("públic") || title.toLowerCase().includes("public") ? "adset" : "ad");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortCol, sortDir]);

  function handleSort(col: SortableCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left text-[11px] font-medium text-muted-foreground py-2 px-3 whitespace-nowrap">Nome</th>
              {columns.map((c) => (
                <th
                  key={c.col}
                  className="text-right text-[11px] font-medium text-muted-foreground py-2 px-2 cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                  onClick={() => handleSort(c.col)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {c.label}
                    {sortCol === c.col && <ArrowUpDown className="h-2.5 w-2.5" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const entityPath = derivedEntityType === "adset"
                ? { adset: row.campaignName }
                : { ad: row.campaignName };
              return (
                <tr key={row.campaignId} className="border-t border-border/20 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 text-xs font-medium whitespace-nowrap">
                    <span className="truncate max-w-[260px] inline-block">{row.campaignName}</span>
                  </td>
                  {columns.map((c) => {
                    const formattedValue = c.fmt(row);
                    const cellClasses = `py-2 px-2 text-xs text-right ${c.col === "spend" ? "font-medium" : ""}`;
                    if (!funnel) {
                      return <td key={c.col} className={cellClasses}>{formattedValue}</td>;
                    }
                    const baseFormula = c.formula(row, funnel);
                    const enriched = enrichFormulaForEntity(baseFormula, entityPath);
                    return (
                      <td key={c.col} className={cellClasses}>
                        <MetricTooltip label={c.label} value={formattedValue} formula={enriched}>
                          <span className={enriched ? "cursor-help underline decoration-dotted decoration-border/60 underline-offset-2" : undefined}>
                            {formattedValue}
                          </span>
                        </MetricTooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
