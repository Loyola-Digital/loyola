"use client";

import { useState, useRef } from "react";
import { TrendingUp, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLeadScoringCampaignBreakdown } from "@/lib/hooks/use-lead-scoring-campaign-breakdown";

interface LeadScoringCampaignTablesProps {
  projectId: string;
  funnelId: string;
  stageId: string;
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

const DAY_OPTIONS = [
  { value: 7, label: "Últimos 7 dias" },
  { value: 14, label: "Últimos 14 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 60, label: "Últimos 60 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

type SortKey = "campaignName" | "spend" | "totalLeads" | "cpl" | "cplIdeal";
type SortDirection = "asc" | "desc" | null;

export function LeadScoringCampaignTables({
  projectId,
  funnelId,
  stageId,
}: LeadScoringCampaignTablesProps) {
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ column: string; startX: number; startWidth: number } | null>(null);

  const { data, loading, error } = useLeadScoringCampaignBreakdown(
    projectId,
    funnelId,
    stageId,
    days,
  );

  const toggleCampaignExpansion = (utmCampaign: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(utmCampaign)) {
        next.delete(utmCampaign);
      } else {
        next.add(utmCampaign);
      }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle direction or reset
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
        case "campaignName": {
          const aName = a.campaignName || "";
          const bName = b.campaignName || "";
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
  const paginatedRows = sortedRows.slice(0, 10); // Limit to 10 rows

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
          Erro ao carregar breakdown de campanhas: {error}
        </p>
      </div>
    );
  }

  if (!data || data.semDados) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhum dado de utm_campaign encontrado na planilha de pesquisa.
        </p>
      </div>
    );
  }

  const rows = data.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5">
        <p className="text-sm text-muted-foreground">
          Nenhuma campanha com leads associados.
        </p>
      </div>
    );
  }

  // Extract band IDs from first row (assume all rows have same bands)
  const bandIds = Object.keys(rows[0]?.bands ?? {}).sort();

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Breakdown de Leads por Campanha</h3>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="days-select" className="text-xs text-muted-foreground">
            Período:
          </label>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger id="days-select" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  <TableHead className="sticky left-0 bg-background z-10 relative group" style={{ width: getColumnWidth("campaignName", 160) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("campaignName")}
                      className="h-8 gap-1"
                    >
                      Campanha
                      {renderSortIcon("campaignName")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("campaignName", 160)}
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
                {paginatedRows.map((row) => {
                  const isExpanded = expandedCampaigns.has(row.utmCampaign);
                  const adsets = data?.adsetsBycampaign?.[row.utmCampaign] ?? [];
                  return (
                    <>
                      <TableRow key={row.utmCampaign}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                          <div className="flex items-center gap-2">
                            {adsets.length > 0 && (
                              <button
                                onClick={() => toggleCampaignExpansion(row.utmCampaign)}
                                className="p-0 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                              >
                                <ChevronRight
                                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                />
                              </button>
                            )}
                            {adsets.length === 0 && <div className="w-4" />}
                            <span>{row.campaignName}</span>
                          </div>
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
                          <TableCell key={`${row.utmCampaign}-${bid}-pct`} className="text-right text-sm">
                            {fmtPercent(row.bands[bid]?.pct)}
                          </TableCell>
                        ))}
                      </TableRow>
                      {isExpanded && adsets.length > 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={5 + bandIds.length} className="p-3">
                            <div className="pl-4 space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">Adsets e Ads:</p>
                              {adsets.map((adset) => (
                                <div key={adset.id} className="pl-2 border-l border-muted">
                                  <p className="text-xs font-medium text-foreground">{adset.name}</p>
                                  <p className="text-xs text-muted-foreground">Status: {adset.status}</p>
                                  {adset.ads.length > 0 && (
                                    <div className="ml-2 mt-1 space-y-1">
                                      {adset.ads.map((ad) => (
                                        <div key={ad.id} className="text-xs text-muted-foreground">
                                          • {ad.name} ({ad.status})
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
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
                  <TableHead className="sticky left-0 bg-background z-10 relative group" style={{ width: getColumnWidth("campaignName", 160) }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("campaignName")}
                      className="h-8 gap-1"
                    >
                      Campanha
                      {renderSortIcon("campaignName")}
                    </Button>
                    <div
                      onMouseDown={handleMouseDown("campaignName", 160)}
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
                {paginatedRows.map((row) => {
                  const isExpanded = expandedCampaigns.has(row.utmCampaign);
                  const adsets = data?.adsetsBycampaign?.[row.utmCampaign] ?? [];
                  return (
                    <>
                      <TableRow key={row.utmCampaign}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium truncate">
                          <div className="flex items-center gap-2">
                            {adsets.length > 0 && (
                              <button
                                onClick={() => toggleCampaignExpansion(row.utmCampaign)}
                                className="p-0 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                              >
                                <ChevronRight
                                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                />
                              </button>
                            )}
                            {adsets.length === 0 && <div className="w-4" />}
                            <span>{row.campaignName}</span>
                          </div>
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
                          <div key={`row-${row.utmCampaign}-${bid}`} className="contents">
                            <TableCell className="text-right text-sm">
                              {fmtCurrency(row.bands[bid]?.cplFaixa)}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {fmtPercent(row.bands[bid]?.pct)}
                            </TableCell>
                          </div>
                        ))}
                      </TableRow>
                      {isExpanded && adsets.length > 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={4 + bandIds.length * 2} className="p-3">
                            <div className="pl-4 space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">Adsets e Ads:</p>
                              {adsets.map((adset) => (
                                <div key={adset.id} className="pl-2 border-l border-muted">
                                  <p className="text-xs font-medium text-foreground">{adset.name}</p>
                                  <p className="text-xs text-muted-foreground">Status: {adset.status}</p>
                                  {adset.ads.length > 0 && (
                                    <div className="ml-2 mt-1 space-y-1">
                                      {adset.ads.map((ad) => (
                                        <div key={ad.id} className="text-xs text-muted-foreground">
                                          • {ad.name} ({ad.status})
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
