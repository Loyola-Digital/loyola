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
  projectId?: string;
  funnelId: string;
  stageId: string;
  days?: number;
  stageType?: 'paid' | 'free' | 'sales' | 'cpl';
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
  | "roas"
  // Story 18.55 (Captação Paga)
  | "ingressosUnicos"
  | "ingressosTotais"
  | "revenueTotal"
  | "revenueUnico";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const COLUMNS: Array<{ key: SortableCol; label: string; title?: string }> = [
  { key: "spend", label: "Invest." },
  { key: "spendPercent", label: "%" },
  { key: "leads", label: "Leads" },
  { key: "cpl", label: "CPL" },
  // Story 18.46 (AC1): Impressões/Cliques ocultadas da tabela (CTR/CPC/CPM
  // continuam sendo calculados internamente a partir desses valores).
  // Story 18.59: cliques = cliques no link (link_click da Meta), como na tabela de LPs.
  { key: "ctr", label: "CTR", title: "Cliques no link ÷ Impressões × 100 (Meta Ads · action link_click)" },
  { key: "cpc", label: "CPC", title: "Investimento ÷ Cliques no link" },
  { key: "cpm", label: "CPM", title: "Investimento ÷ Impressões × 1000" },
  { key: "revenue", label: "Faturamento" },
  { key: "roas", label: "ROAS" },
];

// Story 18.55: na Captação Paga, Leads → Ing. Únicos/Totais e Faturamento →
// Fat. Total/Único (vendas atribuídas ao criativo via co= da venda; vendas
// sem co= — orgânico/recuperação/manual — ficam fora da tabela).
const PAID_COLUMNS: Array<{ key: SortableCol; label: string; title?: string }> = [
  { key: "spend", label: "Invest." },
  { key: "spendPercent", label: "%" },
  {
    key: "ingressosUnicos",
    label: "Ing. Únicos",
    title: "Compradores únicos de ingresso (dedup por email, sem order bump), atribuídos ao criativo via co= da venda",
  },
  {
    key: "ingressosTotais",
    label: "Ing. Totais",
    title: "Todas as vendas (ingresso + order bump) atribuídas ao criativo via co= da venda",
  },
  {
    key: "cpl",
    label: "CPL",
    title: "Invest ÷ Ingressos Únicos (vendas atribuídas ao criativo via co=)",
  },
  // Story 18.59: cliques = cliques no link (link_click da Meta), como na tabela de LPs.
  { key: "ctr", label: "CTR", title: "Cliques no link ÷ Impressões × 100 (Meta Ads · action link_click)" },
  { key: "cpc", label: "CPC", title: "Investimento ÷ Cliques no link" },
  { key: "cpm", label: "CPM", title: "Investimento ÷ Impressões × 1000" },
  {
    key: "revenueTotal",
    label: "Fat. Total",
    title: "Faturamento bruto de todas as vendas (ingresso + order bump) atribuídas via co=",
  },
  {
    key: "revenueUnico",
    label: "Fat. Único",
    title: "Faturamento das compras únicas de captação (dedup por email, sem order bump)",
  },
  { key: "roas", label: "ROAS", title: "Fat. Total ÷ Investimento" },
];

export function StageCreativePerformanceTable({
  projectId,
  funnelId,
  stageId,
  days = 30,
  stageType,
}: StageCreativePerformanceTableProps) {
  const [temperatureFilter, setTemperatureFilter] = useState<TemperatureFilter>("all");
  const [sortCol, setSortCol] = useState<SortableCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const { data, isLoading, error, bandsByAdName: rawBandsByAdName, bandLabels: rawBandLabels } =
    useStageCreativePerformance({
      projectId,
      funnelId,
      stageId,
      days,
    });

  // Story 18.41: Filter columns based on stage type
  // For free stages, suppress revenue and ROAS columns
  // Story 18.55: paid stages usam o conjunto Ingressos/Faturamento Único-Total
  const visibleColumns = useMemo(() => {
    if (stageType === 'paid') {
      return PAID_COLUMNS;
    }
    if (stageType === 'free') {
      return COLUMNS.filter(col => !['revenue', 'roas'].includes(col.key));
    }
    return COLUMNS;
  }, [stageType]);

  // Story 18.47: faixas (A/B/C/D…) por criativo, vindas da aba de pesquisa
  // (cruzadas por utm_content → Ad Name no crossref). Converte a contagem crua
  // em contagem + % do total de leads classificados do criativo.
  const { bandLabels, bandsByAdName } = useMemo(() => {
    const labels = rawBandLabels ?? [];
    const result = new Map<string, Record<string, { count: number; pct: number }>>();
    for (const [adName, counts] of Object.entries(rawBandsByAdName ?? {})) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const rec: Record<string, { count: number; pct: number }> = {};
      for (const faixa of labels) {
        const count = counts[faixa] ?? 0;
        rec[faixa] = { count, pct: total > 0 ? (count / total) * 100 : 0 };
      }
      result.set(adName.trim().toLowerCase(), rec);
    }
    return { bandLabels: labels, bandsByAdName: result };
  }, [rawBandsByAdName, rawBandLabels]);

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
          // Story 18.55: só na Paga — repassar Único/Total muda CPL (÷ Ing.
          // Únicos) e ROAS (Fat. Total ÷ Invest) dentro do calculator. Nas
          // demais etapas os campos ficam de fora e nada muda (AC8).
          ...(stageType === 'paid' && creative.ingressosUnicos != null
            ? {
                ingressosUnicos: creative.ingressosUnicos,
                ingressosTotais: creative.ingressosTotais,
                revenueTotal: creative.revenueTotal,
                revenueUnico: creative.revenueUnico,
              }
            : {}),
        };
        return calculateCreativeMetrics(metricsInput);
      });

    // AC2: Compilar quando filtro é "all"
    if (isAllFiltersSelected(temperatureFilter)) {
      const compiled = compileCreativeMetricsByName(metrics);
      // Story 18.45 (AC3): recalcular spendPercent no modo compilado.
      // compileCreativeMetricsByName zera spendPercent como placeholder; aqui
      // reaplicamos o rateio sobre o gasto total para a coluna "%" não ficar zerada.
      return compiled.map((row) => ({
        ...row,
        spendPercent: totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0,
      }));
    }

    // Modo normal: filtrar por temperatura (hot/cold)
    return metrics.filter((m) => m.temperature === temperatureFilter);
  }, [data, temperatureFilter, stageType]);

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

  function renderCellValue(row: any, colKey: SortableCol): React.ReactNode {
    switch (colKey) {
      case "spend":
        return formatMetricValue(row.spend, "currency", { compact: true });
      case "spendPercent":
        return formatMetricValue(row.spendPercent, "percentage");
      case "impressions":
        return formatMetricValue(row.impressions, "number", { compact: true });
      case "clicks":
        return formatMetricValue(row.clicks, "number", { compact: true });
      case "ctr":
        return formatMetricValue(row.ctr, "percentage");
      case "cpc":
        return formatMetricValue(row.cpc, "currency");
      case "cpm":
        return formatMetricValue(row.cpm, "currency");
      case "leads":
        return formatMetricValue(row.leads, "number");
      case "cpl":
        return formatMetricValue(row.cpl, "currency");
      case "revenue":
        return formatMetricValue(row.revenue, "currency", { compact: true });
      case "roas":
        return row.roas != null ? `${row.roas.toFixed(2)}x` : "—";
      // Story 18.55 (Captação Paga)
      case "ingressosUnicos":
        return formatMetricValue(row.ingressosUnicos, "number");
      case "ingressosTotais":
        return formatMetricValue(row.ingressosTotais, "number");
      case "revenueTotal":
        return formatMetricValue(row.revenueTotal, "currency", { compact: true });
      case "revenueUnico":
        return formatMetricValue(row.revenueUnico, "currency", { compact: true });
      default:
        return "—";
    }
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
            {visibleColumns.find((c) => c.key === sortCol)?.label.toLowerCase() ?? sortCol} (
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
              {visibleColumns.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  title={c.title}
                  className="text-right text-xs font-semibold cursor-pointer select-none hover:text-foreground"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {c.label}
                    <SortIcon col={c.key} />
                  </span>
                </TableHead>
              ))}
              {/* Story 18.47: colunas dinâmicas de faixa (contagem + %) */}
              {bandLabels.map((band) => (
                <TableHead
                  key={`band-${band}`}
                  className="text-right text-xs font-semibold"
                  title={`Leads da Faixa ${band} (contagem e % do total de leads do criativo)`}
                >
                  Faixa {band}
                </TableHead>
              ))}
              <TableHead className="text-center text-xs font-semibold">Preview</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + bandLabels.length + 2} className="py-10 text-center text-xs text-muted-foreground">
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
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`text-right tabular-nums ${
                        col.key === "roas" ? "font-semibold" : col.key === "spendPercent" ? "text-muted-foreground" : ""
                      }`}
                    >
                      {renderCellValue(row, col.key)}
                    </TableCell>
                  ))}
                  {/* Story 18.47: células de faixa — contagem + % do total de leads do criativo */}
                  {bandLabels.map((band) => {
                    const cell = bandsByAdName.get(row.adName.trim().toLowerCase())?.[band];
                    return (
                      <TableCell key={`band-${band}`} className="text-right tabular-nums">
                        {cell && cell.count > 0 ? (
                          <span className="inline-flex flex-col items-end leading-tight">
                            <span>{cell.count}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {cell.pct.toFixed(0)}%
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
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
      {/* Story 18.55 (AC7): na Paga, "Leads totais" vira "Ingressos únicos" e
          o faturamento soma o Fat. Total dos criativos (vendas com co=) */}
      {data && totalRows > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Gasto total</p>
            <p className="text-base font-bold tabular-nums">{formatMetricValue(data.summary.totalSpend, "currency")}</p>
          </div>
          {stageType === 'paid' ? (
            <div
              className="rounded-lg border border-border/30 bg-muted/20 p-3"
              title="Compradores únicos de ingresso atribuídos aos criativos via co= da venda"
            >
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Ingressos únicos</p>
              <p className="text-base font-bold tabular-nums">
                {formatMetricValue(
                  data.creatives.reduce((s, c) => s + (c.ingressosUnicos ?? 0), 0),
                  "number",
                )}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Leads totais</p>
              <p className="text-base font-bold tabular-nums">{formatMetricValue(data.summary.totalLeads, "number")}</p>
            </div>
          )}
          <div
            className="rounded-lg border border-border/30 bg-muted/20 p-3"
            title={stageType === 'paid' ? "Soma do Fat. Total (ingresso + order bump) das vendas atribuídas via co=" : undefined}
          >
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Faturamento total</p>
            <p className="text-base font-bold tabular-nums">
              {formatMetricValue(
                stageType === 'paid'
                  ? data.creatives.reduce((s, c) => s + (c.revenueTotal ?? 0), 0)
                  : data.summary.totalRevenue,
                "currency",
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
