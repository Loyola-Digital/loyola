"use client";

/**
 * Story 18.44 / 18.46: Tabela única de performance de LPs.
 *
 * Story 18.46:
 * - Uma única tabela com UMA linha por LP (coluna "LP" em vez de "Dia").
 * - Sem título/identificação por LP no topo (a LP é a primeira coluna).
 * - Cliques/Impressões ocultadas (Story 18.45 AC4); Leads/CPL (free) ou Vendas/CPV (paid)
 *   logo após Investimento.
 * - O filtro de público (Hot/Cold/Todos) é controlado pela seção pai (botões temáticos).
 */

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calculatePaidMetrics,
  calculateFreeMetrics,
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/lib/utils/lp-metrics-calculator";
import type { LpRow } from "@/lib/hooks/useLpPerformanceData";

interface LpPerformanceTableProps {
  rows: LpRow[];
  stageType: "paid" | "free"; // "Captação Paga" ou "Captação Gratuita"
  isLoading?: boolean;
}

export function LpPerformanceTable({
  rows,
  stageType,
  isLoading = false,
}: LpPerformanceTableProps) {
  const isPaid = stageType === "paid";

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Carregando...</div>;
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Nenhum dado disponível.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>LP</TableHead>
            <TableHead className="text-right">Investimento (R$)</TableHead>
            {/* Story 18.45/18.46: métricas-chave logo após Investimento */}
            {!isPaid && (
              <>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
              </>
            )}
            {isPaid && (
              <>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">CPV</TableHead>
              </>
            )}
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">CTR (%)</TableHead>
            <TableHead className="text-right">LP View</TableHead>
            <TableHead className="text-right">Connect Rate (%)</TableHead>
            <TableHead className="text-right">Tx Conv. (%)</TableHead>

            {/* Colunas de resultado por stage (paid) — Faturamento/ROAS no final */}
            {isPaid && (
              <>
                <TableHead className="text-right">Faturamento (R$)</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
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
              <TableRow key={row.lpName}>
                <TableCell className="font-medium">{row.lpName}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.investimento)}
                </TableCell>
                {/* Story 18.45/18.46: métricas-chave logo após Investimento */}
                {!isPaid && (
                  <>
                    <TableCell className="text-right">{row.leads ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(metrics.cpl)}
                    </TableCell>
                  </>
                )}
                {isPaid && (
                  <>
                    <TableCell className="text-right">{row.vendas ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(metrics.cpv)}
                    </TableCell>
                  </>
                )}
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

                {/* Colunas de resultado por stage (paid) — Faturamento/ROAS no final */}
                {isPaid && (
                  <>
                    <TableCell className="text-right">
                      {formatCurrency(row.faturamento)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRatio(metrics.roas)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
