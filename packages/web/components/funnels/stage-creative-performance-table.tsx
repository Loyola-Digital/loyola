"use client";

/**
 * Story 18.24: Tabela de Desempenho de Criativos
 * Renderiza 13 colunas com filtro de temperatura (hot/cold) e ordenação
 */

import { useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink } from "lucide-react";
import {
  calculateCreativeMetrics,
  formatMetricValue,
  type CreativeMetrics,
} from "@/lib/utils/creative-metrics-calculator";
import { useStageCreativePerformance } from "@/lib/hooks/useStageCreativePerformance";

interface StageCreativePerformanceTableProps {
  funnelId: string;
  stageId: string;
  days?: number;
}

type TemperatureFilter = "all" | "hot" | "cold";
type SortableCol = "spend" | "spendPercent" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "leads" | "cpl" | "revenue" | "roas";

export function StageCreativePerformanceTable({
  funnelId,
  stageId,
  days = 30,
}: StageCreativePerformanceTableProps) {
  const [temperatureFilter, setTemperatureFilter] = useState<TemperatureFilter>("all");
  const [sortCol, setSortCol] = useState<SortableCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch dados
  const { data, isLoading, error } = useStageCreativePerformance({
    funnelId,
    stageId,
    days,
  });

  // Processar dados: calcular métricas e filtrar
  const processedData = useMemo(() => {
    if (!data?.creatives) return [];

    const totalSpend = data.summary.totalSpend;

    return data.creatives
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
      })
      .filter((metric) => {
        if (temperatureFilter === "all") return true;
        return metric.temperature === temperatureFilter;
      });
  }, [data, temperatureFilter]);

  // Ordenar dados
  const sortedData = useMemo(() => {
    return [...processedData].sort((a, b) => {
      const av = (a[sortCol] as number) ?? 0;
      const bv = (b[sortCol] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [processedData, sortCol, sortDir]);

  function handleSort(col: SortableCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Carregando dados de criativos...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-800 font-semibold">Erro ao carregar dados</p>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtro de Temperatura */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Temperatura do Público:</label>
        <div className="flex gap-2">
          {(["all", "hot", "cold"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setTemperatureFilter(option)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                temperatureFilter === option
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {option === "all" ? "Todos" : option === "hot" ? "🔥 Hot" : "❄️ Cold"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-gray-700">Ad Name</th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("spend")}>
                <span className="flex items-center justify-end gap-1">
                  Invest {sortCol === "spend" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("spendPercent")}>
                <span className="flex items-center justify-end gap-1">
                  % {sortCol === "spendPercent" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("impressions")}>
                <span className="flex items-center justify-end gap-1">
                  Impressões {sortCol === "impressions" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("clicks")}>
                <span className="flex items-center justify-end gap-1">
                  Cliques {sortCol === "clicks" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("ctr")}>
                <span className="flex items-center justify-end gap-1">
                  CTR {sortCol === "ctr" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("cpc")}>
                <span className="flex items-center justify-end gap-1">
                  CPC {sortCol === "cpc" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("cpm")}>
                <span className="flex items-center justify-end gap-1">
                  CPM {sortCol === "cpm" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("leads")}>
                <span className="flex items-center justify-end gap-1">
                  Leads {sortCol === "leads" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("cpl")}>
                <span className="flex items-center justify-end gap-1">
                  CPL {sortCol === "cpl" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("revenue")}>
                <span className="flex items-center justify-end gap-1">
                  Faturamento {sortCol === "revenue" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-right px-4 py-2 font-semibold text-gray-700 cursor-pointer hover:text-blue-600"
                onClick={() => handleSort("roas")}>
                <span className="flex items-center justify-end gap-1">
                  ROAS {sortCol === "roas" && <ArrowUpDown className="w-3 h-3" />}
                </span>
              </th>
              <th className="text-center px-4 py-2 font-semibold text-gray-700">Link Preview</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                  Nenhum criativo encontrado
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr key={row.adId} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-sm max-w-xs truncate" title={row.adName}>
                    {row.adName}
                  </td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.spend, "currency")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.spendPercent, "percentage")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.impressions, "number")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.clicks, "number")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.ctr, "percentage")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.cpc, "currency")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.cpm, "currency")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.leads, "number")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.cpl, "currency")}</td>
                  <td className="text-right px-4 py-2">{formatMetricValue(row.revenue, "currency")}</td>
                  <td className="text-right px-4 py-2 font-semibold">
                    {row.roas ? `${row.roas.toFixed(2)}x` : "—"}
                  </td>
                  <td className="text-center px-4 py-2">
                    <a
                      href={`https://www.facebook.com/ads/library/?id=${row.adId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Clique para visualizar o anúncio no Meta Ads Library"
                      className="text-blue-600 hover:text-blue-800 inline-flex"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-xs text-gray-600 font-semibold">GASTO TOTAL</p>
            <p className="text-lg font-bold text-blue-600">
              {formatMetricValue(data.summary.totalSpend, "currency")}
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="text-xs text-gray-600 font-semibold">LEADS TOTAIS</p>
            <p className="text-lg font-bold text-green-600">
              {formatMetricValue(data.summary.totalLeads, "number")}
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded p-3">
            <p className="text-xs text-gray-600 font-semibold">FATURAMENTO TOTAL</p>
            <p className="text-lg font-bold text-purple-600">
              {formatMetricValue(data.summary.totalRevenue, "currency")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
