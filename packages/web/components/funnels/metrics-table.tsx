"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import type { CampaignAnalytics } from "@/lib/hooks/use-traffic-analytics";

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
}

type SortableCol = "spend" | "leads" | "cpl" | "ctr" | "cpc" | "cpm";

const columns: { label: string; col: SortableCol; fmt: (row: CampaignAnalytics) => string }[] = [
  { label: "Investimento", col: "spend", fmt: (r) => fmtCurrency(r.spend) },
  { label: "Leads", col: "leads", fmt: (r) => fmtNumber(r.leads) },
  { label: "CPL", col: "cpl", fmt: (r) => fmtCurrency(r.cpl) },
  { label: "CTR", col: "ctr", fmt: (r) => fmtPercent(r.ctr) },
  { label: "CPC", col: "cpc", fmt: (r) => fmtCurrency(r.cpc) },
  { label: "CPM", col: "cpm", fmt: (r) => fmtCurrency(r.cpm) },
];

export function MetricsTable({ title, rows }: MetricsTableProps) {
  const [sortCol, setSortCol] = useState<SortableCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
            {sorted.map((row) => (
              <tr key={row.campaignId} className="border-t border-border/20 hover:bg-muted/30 transition-colors">
                <td className="py-2 px-3 text-xs font-medium whitespace-nowrap">
                  <span className="truncate max-w-[260px] inline-block">{row.campaignName}</span>
                </td>
                {columns.map((c) => (
                  <td key={c.col} className={`py-2 px-2 text-xs text-right ${c.col === "spend" ? "font-medium" : ""}`}>
                    {c.fmt(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
