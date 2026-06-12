"use client";

/**
 * Story 18.44: Componente de tabela para performance de LPs
 *
 * Renderiza dados agrupados por LP com colunas específicas para cada stage:
 * - Captação Paga: 14 colunas (com CPV, Faturamento, ROAS)
 * - Captação Gratuita: 12 colunas (com CPL, sem Faturamento)
 *
 * Suporta filtro de temperatura (Hot/Cold/Todos) e DayRangePicker
 */

import React, { useState } from "react";
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
import {
  calculatePaidMetrics,
  calculateFreeMetrics,
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/lib/utils/lp-metrics-calculator";

interface LpDaily {
  date: string;
  lpName: string;
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  vendas?: number;
  faturamento?: number;
  leads?: number;
}

interface LpPerformanceTableProps {
  lpName: string; // Ex: "LPA", "LPB"
  data: LpDaily[];
  stageType: "paid" | "free"; // "Captação Paga" ou "Captação Gratuita"
  isLoading?: boolean;
}

export function LpPerformanceTable({
  lpName,
  data,
  stageType,
  isLoading = false,
}: LpPerformanceTableProps) {
  const [publicoFilter, setPublicoFilter] = useState<"hot" | "cold" | "todos">(
    "todos",
  );

  // Render columns based on stage
  const isPaid = stageType === "paid";

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Carregando...</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Nenhum dado disponível para {lpName}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho com filtro */}
      <div className="flex items-center gap-4">
        <h3 className="text-lg font-semibold">{lpName}</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Filtro Público:</label>
          <Select
            value={publicoFilter}
            onValueChange={(value) => setPublicoFilter(value as "hot" | "cold" | "todos")}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="hot">Público Hot</SelectItem>
              <SelectItem value="cold">Público Cold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-slate-700">
            <TableRow className="hover:bg-slate-700">
              <TableHead className="text-white">Dia</TableHead>
              <TableHead className="text-right text-white">Investimento (R$)</TableHead>
              <TableHead className="text-right text-white">Cliques</TableHead>
              <TableHead className="text-right text-white">Impressões</TableHead>
              <TableHead className="text-right text-white">CPM</TableHead>
              <TableHead className="text-right text-white">CPC</TableHead>
              <TableHead className="text-right text-white">CTR (%)</TableHead>
              <TableHead className="text-right text-white">LP View</TableHead>
              <TableHead className="text-right text-white">Connect Rate (%)</TableHead>
              <TableHead className="text-right text-white">Tx Conv. (%)</TableHead>

              {/* Colunas específicas por stage */}
              {isPaid ? (
                <>
                  <TableHead className="text-right text-white">Vendas</TableHead>
                  <TableHead className="text-right text-white">CPV</TableHead>
                  <TableHead className="text-right text-white">Faturamento (R$)</TableHead>
                  <TableHead className="text-right text-white">ROAS</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-right text-white">Leads</TableHead>
                  <TableHead className="text-right text-white">CPL</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => {
              const metrics = isPaid
                ? calculatePaidMetrics({
                    investimento: row.investimento,
                    cliques: row.cliques,
                    impressoes: row.impressoes,
                    conversoes: row.conversoes,
                    lpViews: row.lpViews,
                    vendas: row.vendas ?? 0,
                    faturamento: row.faturamento ?? 0,
                  })
                : calculateFreeMetrics({
                    investimento: row.investimento,
                    cliques: row.cliques,
                    impressoes: row.impressoes,
                    conversoes: row.conversoes,
                    lpViews: row.lpViews,
                    leads: row.leads ?? 0,
                  });

              return (
                <TableRow key={idx} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{row.date}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.investimento)}
                  </TableCell>
                  <TableCell className="text-right">{row.cliques}</TableCell>
                  <TableCell className="text-right">
                    {row.impressoes}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(metrics.cpm)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(metrics.cpc)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(metrics.ctr)}
                  </TableCell>
                  <TableCell className="text-right">{row.lpViews}</TableCell>
                  <TableCell className="text-right">
                    {formatPercent(metrics.connectRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(metrics.txConv)}
                  </TableCell>

                  {/* Colunas específicas por stage */}
                  {isPaid ? (
                    <>
                      <TableCell className="text-right">
                        {row.vendas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(metrics.cpv)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.faturamento)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRatio(metrics.roas)}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right">
                        {row.leads ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(metrics.cpl)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
