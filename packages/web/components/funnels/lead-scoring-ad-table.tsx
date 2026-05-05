"use client";

import { useState, useRef } from "react";
import { TrendingUp, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useLeadScoringAdBreakdown } from "@/lib/hooks/use-lead-scoring-ad-breakdown";

interface LeadScoringAdTableProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  days: number;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtPercent(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

type SortKey = "adName" | "spend" | "totalLeads" | "cpl" | "cplIdeal";
type SortDirection = "asc" | "desc" | null;

export function LeadScoringAdTable({
  projectId,
  funnelId,
  stageId,
  days,
}: LeadScoringAdTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null);

  const { data, loading, error } = useLeadScoringAdBreakdown(
    projectId,
    funnelId,
    stageId,
    days,
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const getColumnWidth = (column: string, defaultWidth: number): number => {
    return columnWidths[column] ?? defaultWidth;
  };

  const handleMouseDown = (column: string, defaultWidth: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column] ?? defaultWidth,
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const delta = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(60, resizeRef.current.startWidth + delta);
    setColumnWidths((prev) => ({
      ...prev,
      [resizeRef.current!.column]: newWidth,
    }));
  };

  const handleMouseUp = () => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const getSortedRows = () => {
    if (!data?.rows || !sortKey || !sortDirection) {
      return data?.rows ?? [];
    }

    const sorted = [...data.rows].sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;

      switch (sortKey) {
        case "adName": {
          const aName = a.adName || "";
          const bName = b.adName || "";
          return sortDirection === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
        }
        case "spend":
          aVal = a.spend ?? 0;
          bVal = b.spend ?? 0;
          break;
        case "totalLeads":
          aVal = a.totalLeads ?? 0;
          bVal = b.totalLeads ?? 0;
          break;
        case "cpl":
          aVal = a.cpl ?? 0;
          bVal = b.cpl ?? 0;
          break;
        case "cplIdeal":
          aVal = a.cplIdeal ?? 0;
          bVal = b.cplIdeal ?? 0;
          break;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  };

  const sortedRows = getSortedRows();
  const paginatedRows = sortedRows.slice(0, 10);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-4 w-4 opacity-40" />;
    if (sortDirection === "asc") return <ChevronUp className="h-4 w-4" />;
    return <ChevronDown className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-5">
        <p className="text-sm text-red-700 dark:text-red-400">
          Erro ao carregar breakdown de ads: {error}
        </p>
      </div>
    );
  }

  if (!data || data.semDados) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhum dado de utm_content encontrado na planilha de pesquisa.
        </p>
      </div>
    );
  }

  const rows = data.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhum ad com leads associados.
        </p>
      </div>
    );
  }

  const bandIds = Object.keys(rows[0]?.bands ?? {}).sort();

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Breakdown de Leads por Ad</h3>
      </div>

      {/* Tabela 1: Distribuição por Faixa */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Tabela 1: Distribuição de Leads por Faixa (%) — Mostrando 1 a {Math.min(10, sortedRows.length)} de {sortedRows.length}
        </p>
        <div className="rounded-md border overflow-y-auto max-h-[500px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 relative group" style={{ width: getColumnWidth("adName", 160) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("adName")}
                      className="h-8 gap-1"
                    >
                      Ad
                      {renderSortIcon("adName")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("adName", 160)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("spend", 100) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("spend")}
                      className="h-8 gap-1 ml-auto"
                    >
                      Investido
                      {renderSortIcon("spend")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("spend", 100)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("totalLeads", 80) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("totalLeads")}
                      className="h-8 gap-1 ml-auto"
                    >
                      Leads
                      {renderSortIcon("totalLeads")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("totalLeads", 80)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("cpl", 90) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("cpl")}
                      className="h-8 gap-1 ml-auto"
                    >
                      CPL
                      {renderSortIcon("cpl")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("cpl", 90)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("cplIdeal", 100) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("cplIdeal")}
                      className="h-8 gap-1 ml-auto"
                    >
                      CPL Ideal
                      {renderSortIcon("cplIdeal")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("cplIdeal", 100)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  {bandIds.map((bid) => (
                    <TableHead key={`${bid}-pct`} className="text-right relative group" style={{ width: getColumnWidth(`band-${bid}`, 90) }}>
                      % Band {bid}
                      <div
                        onMouseDown={handleMouseDown(`band-${bid}`, 90)}
                        className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row) => (
                  <TableRow key={row.utmContent}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                      {row.adName}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(row.spend)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmtInt(row.totalLeads)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(row.cpl)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(row.cplIdeal)}
                    </TableCell>
                    {bandIds.map((bid) => (
                      <TableCell key={`${row.utmContent}-${bid}-pct`} className="text-right text-sm">
                        {fmtPercent(row.bands[bid]?.pct)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Tabela 2: Breakdown Financeiro por Faixa */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Tabela 2: Custo por Faixa (CPL/Faixa + %) — Mostrando 1 a {Math.min(10, sortedRows.length)} de {sortedRows.length}
        </p>
        <div className="rounded-md border overflow-y-auto max-h-[500px]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 relative group" style={{ width: getColumnWidth("adName", 160) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("adName")}
                      className="h-8 gap-1"
                    >
                      Ad
                      {renderSortIcon("adName")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("adName", 160)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("spend", 100) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("spend")}
                      className="h-8 gap-1 ml-auto"
                    >
                      Investido
                      {renderSortIcon("spend")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("spend", 100)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("totalLeads", 80) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("totalLeads")}
                      className="h-8 gap-1 ml-auto"
                    >
                      Leads
                      {renderSortIcon("totalLeads")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("totalLeads", 80)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  <TableHead className="text-right relative group" style={{ width: getColumnWidth("cpl", 90) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("cpl")}
                      className="h-8 gap-1 ml-auto"
                    >
                      CPL Total
                      {renderSortIcon("cpl")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("cpl", 90)}
                      className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                    />
                  </TableHead>
                  {bandIds.map((bid) => (
                    <div key={`col-${bid}`} className="contents">
                      <TableHead className="text-right relative group" style={{ width: getColumnWidth(`cpl-${bid}`, 100) }}>
                        CPL {bid}
                        <div
                          onMouseDown={handleMouseDown(`cpl-${bid}`, 100)}
                          className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                        />
                      </TableHead>
                      <TableHead className="text-right relative group" style={{ width: getColumnWidth(`pct-${bid}`, 90) }}>
                        % {bid}
                        <div
                          onMouseDown={handleMouseDown(`pct-${bid}`, 90)}
                          className="absolute right-0 top-0 h-full w-1 bg-border opacity-0 group-hover:opacity-100 hover:opacity-100 cursor-col-resize hover:bg-primary transition-all"
                        />
                      </TableHead>
                    </div>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row) => (
                  <TableRow key={row.utmContent}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                      {row.adName}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(row.spend)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmtInt(row.totalLeads)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(row.cpl)}
                    </TableCell>
                    {bandIds.map((bid) => (
                      <div key={`row-${row.utmContent}-${bid}`} className="contents">
                        <TableCell className="text-right text-sm">
                          {fmtCurrency(row.bands[bid]?.cplFaixa)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {fmtPercent(row.bands[bid]?.pct)}
                        </TableCell>
                      </div>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
