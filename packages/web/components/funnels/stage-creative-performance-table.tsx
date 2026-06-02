"use client";

/**
 * Story 18.24: Tabela de Desempenho de Criativos
 * 13 colunas, filtro de temperatura (hot/cold), ordenacao por coluna, paginacao.
 */

import { useMemo, useState, useEffect } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  calculateCreativeMetrics,
  formatMetricValue,
  type CreativeMetrics,
} from "@/lib/utils/creative-metrics-calculator";
import {
  compileCreativeMetricsByName,
  isAllFiltersSelected,
} from "@/lib/utils/compileCreativeMetrics";
import { useStageCreativePerformance } from "@/lib/hooks/useStageCreativePerformance";
import { Badge } from "@/components/ui/badge";
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

interface StageCreativePerformanceTableProps {
  funnelId: string;
  stageId: string;
  days?: number;
}

type TemperatureFilter = "all" | "hot" | "cold";
type SortableCol =
  | "spend"
  | "spendPercent"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "leads"
  | "cpl"
  | "revenue"
  | "roas";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const COLUMNS: Array<{ key: SortableCol; label: string }> = [
  { key: "spend", label: "Invest." },
  { key: "spendPercent", label: "%" },
  { key: "impressions", label: "Impressões" },
  { key: "clicks", label: "Cliques" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "leads", label: "Leads" },
  { key: "cpl", label: "CPL" },
  { key: "revenue", label: "Faturamento" },
  { key: "roas", label: "ROAS" },
];

export function StageCreativePerformanceTable({
  funnelId,
  stageId,
  days = 30,
}: StageCreativePerformanceTableProps) {
  const [temperatureFilter, setTemperatureFilter] = useState<TemperatureFilter>("all");
  const [sortCol, setSortCol] = useState<SortableCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const { data, isLoading, error } = useStageCreativePerformance({
    funnelId,
    stageId,
    days,
  });

  // Processa: metrics + filtro de temperatura
  // Story 18.28: Quando filtro é "all", compilar por ad_name (somar métricas)
  const processedData = useMemo(() => {
    if (!data?.creatives) return [];
    const totalSpend = data.summary.totalSpend;

    const metrics = data.creatives
      .map((creative) => {
        const metricsInput: CreativeMetrics = {
          adId: creative.adId,
          adName: creative.adName,
          spend: creative.spend,
          impressions: creative.impressions,
          clicks: creative.clicks,
          leads: creative.leads,
          revenue: creative.revenue,
          utmTerm: creative.utmTerm,
          totalSpend,
        };
        return calculateCreativeMetrics(metricsInput);
      });

    // AC2: Compilar quando filtro é "all"
    if (isAllFiltersSelected(temperatureFilter)) {
      return compileCreativeMetricsByName(metrics);
    }

    // Modo normal: filtrar por temperatura (hot/cold)
    return metrics.filter((m) => m.temperature === temperatureFilter);
  }, [data, temperatureFilter]);

  const sortedData = useMemo(() => {
    return [...processedData].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [processedData, sortCol, sortDir]);

  // Volta pra pagina 0 quando filtro/sort/pageSize muda — evita ficar em pagina inexistente
  useEffect(() => {
    setPageIndex(0);
  }, [temperatureFilter, sortCol, sortDir, pageSize]);

  const totalRows = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePageIndex * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalRows);
  const pageRows = sortedData.slice(pageStart, pageEnd);

  function handleSort(col: SortableCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortableCol }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Erro ao carregar dados</p>
        <p className="text-xs text-destructive/80 mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      {/* Header: titulo + filtros */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Desempenho de Criativos</h3>
          <p className="text-[11px] text-muted-foreground">
            {totalRows} {totalRows === 1 ? "criativo" : "criativos"} · ordenado por{" "}
            {COLUMNS.find((c) => c.key === sortCol)?.label.toLowerCase() ?? sortCol} (
            {sortDir === "desc" ? "maior → menor" : "menor → maior"})
          </p>
          {/* Transparencia: mostra qual filtro de campanha esta ativo */}
          {data?.appliedFilter && data.appliedFilter.campaigns.length > 0 && (
            <p
              className="text-[10px] text-muted-foreground/80 mt-1 truncate"
              title={data.appliedFilter.campaigns.map((c) => c.name).join(" · ")}
            >
              Filtro: {data.appliedFilter.source === "stage" ? "campanhas da etapa" : "campanhas do funil"} ({data.appliedFilter.campaigns.length}) ·{" "}
              {data.appliedFilter.campaigns
                .slice(0, 2)
                .map((c) => c.name)
                .join(", ")}
              {data.appliedFilter.campaigns.length > 2 ? ` +${data.appliedFilter.campaigns.length - 2}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro temperatura */}
          <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
            {(["all", "hot", "cold"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setTemperatureFilter(opt)}
                className={`px-2.5 h-6 rounded text-[11px] font-medium transition-colors ${
                  temperatureFilter === opt
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {opt === "all" ? "Todos" : opt === "hot" ? "🔥 Hot" : "❄️ Cold"}
              </button>
            ))}
          </div>
          {/* Page size */}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border/30 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold">Ad Name</TableHead>
              {COLUMNS.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="text-right text-xs font-semibold cursor-pointer select-none hover:text-foreground"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {c.label}
                    <SortIcon col={c.key} />
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-center text-xs font-semibold">Preview</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 2} className="py-10 text-center text-xs text-muted-foreground">
                  Nenhum criativo encontrado neste período.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.adId} className="text-xs">
                  <TableCell className="font-medium max-w-[260px] truncate" title={row.adName}>
                    <span className="inline-flex items-center gap-1.5">
                      {/* AC3: Não mostrar badges em modo compilado */}
                      {'compiled' in row && row.compiled === true ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-500">
                          📊
                        </Badge>
                      ) : (
                        <>
                          {'temperature' in row && row.temperature === "hot" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/40 text-orange-500">
                              🔥
                            </Badge>
                          )}
                          {'temperature' in row && row.temperature === "cold" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-500/40 text-sky-500">
                              ❄️
                            </Badge>
                          )}
                        </>
                      )}
                      {row.adName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.spend, "currency", { compact: true })}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMetricValue(row.spendPercent, "percentage")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.impressions, "number", { compact: true })}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.clicks, "number", { compact: true })}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.ctr, "percentage")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.cpc, "currency")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.cpm, "currency")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.leads, "number")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.cpl, "currency")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(row.revenue, "currency", { compact: true })}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {row.roas != null ? `${row.roas.toFixed(2)}x` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <a
                      href={`https://www.facebook.com/ads/library/?id=${row.adId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir no Meta Ads Library"
                      className="inline-flex text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginacao */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-muted-foreground">
            Mostrando{" "}
            <span className="font-medium text-foreground">{pageStart + 1}</span>–
            <span className="font-medium text-foreground">{pageEnd}</span> de{" "}
            <span className="font-medium text-foreground">{totalRows}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              disabled={safePageIndex === 0}
              className="h-7 px-2 rounded-md border border-border/40 text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {safePageIndex + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
              disabled={safePageIndex >= totalPages - 1}
              className="h-7 px-2 rounded-md border border-border/40 text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
              aria-label="Próxima página"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      {data && totalRows > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Gasto total</p>
            <p className="text-base font-bold tabular-nums">{formatMetricValue(data.summary.totalSpend, "currency")}</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Leads totais</p>
            <p className="text-base font-bold tabular-nums">{formatMetricValue(data.summary.totalLeads, "number")}</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Faturamento total</p>
            <p className="text-base font-bold tabular-nums">{formatMetricValue(data.summary.totalRevenue, "currency")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
