"use client";

import { useMemo } from "react";
import { Loader2, FileSpreadsheet } from "lucide-react";
import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import type { Funnel } from "@loyola-x/shared";
import { useCrossedFunnelMetrics } from "@/lib/hooks/use-crossed-funnel-metrics";
import type { DailyRow } from "@/lib/utils/funnel-metrics";
import { CrossedFunnelDailyTable } from "./crossed-funnel-daily-table";

interface MetaAdsSpreadsheetTabProps {
  funnel: Funnel;
  projectId: string;
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function buildCplChartData(rows: DailyRow[]) {
  return rows.map((r) => ({
    date: formatDateShort(r.date),
    "CPL Pago": r.cplPg != null ? parseFloat(r.cplPg.toFixed(2)) : null,
    "CPL Geral": r.cplG != null ? parseFloat(r.cplG.toFixed(2)) : null,
    Investimento: parseFloat(r.spend.toFixed(2)),
  }));
}

function buildLeadsCumulativeData(rows: DailyRow[]) {
  let cumPagos = 0;
  let cumOrg = 0;
  let cumSemTrack = 0;
  return rows.map((r) => {
    cumPagos += r.leadsPagos;
    cumOrg += r.leadsOrg;
    cumSemTrack += r.leadsSemTrack;
    return {
      date: formatDateShort(r.date),
      "Leads Pagos": cumPagos,
      "Leads Org": cumOrg,
      "Leads s/ Track": cumSemTrack,
      "Total Leads": cumPagos + cumOrg + cumSemTrack,
    };
  });
}

const CPL_COLORS = { pago: "hsl(220 80% 55%)", geral: "hsl(280 60% 55%)" };
const LEADS_COLORS = { pagos: "hsl(220 80% 55%)", org: "hsl(150 60% 50%)", semTrack: "hsl(40 90% 55%)" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPointLabel(props: any) {
  const { x, y, value } = props as { x?: number; y?: number; value?: number | null };
  if (value == null || x == null || y == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="currentColor">
      {typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBarLabel(props: any) {
  const { x, y, width, height, value } = props as {
    x?: number; y?: number; width?: number; height?: number; value?: number | null;
  };
  if (value == null || x == null || y == null || width == null || height == null || height < 14) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height - 4}
      textAnchor="middle"
      fontSize={9}
      fill="hsl(220 15% 45%)"
    >
      {Math.round(value).toLocaleString("pt-BR")}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetaAdsSpreadsheetTab({ funnel, projectId }: MetaAdsSpreadsheetTabProps) {
  const days = 30;
  const metrics = useCrossedFunnelMetrics(projectId, funnel, days);

  const cplChartData = useMemo(() => buildCplChartData(metrics.rows), [metrics.rows]);
  const leadsChartData = useMemo(() => buildLeadsCumulativeData(metrics.rows), [metrics.rows]);

  if (metrics.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (funnel.campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma campanha Meta Ads vinculada a este funil.</p>
        <p className="text-xs">Configure as campanhas na aba Meta Ads para ver os dados cruzados.</p>
      </div>
    );
  }

  if (!metrics.hasLinkedSheet) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Nenhuma planilha vinculada a este funil.</p>
        <p className="text-xs">Vincule uma planilha na aba Planilhas para ver dados cruzados.</p>
      </div>
    );
  }

  if (metrics.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileSpreadsheet className="h-8 w-8" />
        <p>Sem dados para o periodo selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CrossedFunnelDailyTable rows={metrics.rows} totals={metrics.totals} />

      {/* Charts — stacked vertically (Story 18.4 reorganiza esse bloco) */}
      <div className="space-y-6">
        {/* CPL + Investimento Chart */}
        <div className="rounded-md border p-4 space-y-2">
          <h4 className="text-sm font-semibold">CPL Pago vs CPL Geral</h4>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={cplChartData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="cpl"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `R$${v}`}
                domain={[0, "auto"]}
                allowDataOverflow={false}
              />
              <YAxis
                yAxisId="invest"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `R$${v}`}
                domain={[0, "auto"]}
                allowDataOverflow={false}
              />
              <Tooltip
                formatter={(value) => fmtCurrency(Number(value))}
                labelFormatter={(label) => `Dia ${label}`}
              />
              <Legend />
              <Bar
                yAxisId="invest"
                dataKey="Investimento"
                fill="hsl(220 15% 70%)"
                fillOpacity={0.2}
                radius={[3, 3, 0, 0]}
              >
                <LabelList content={renderBarLabel} />
              </Bar>
              <Line
                yAxisId="cpl"
                type="monotone"
                dataKey="CPL Pago"
                stroke={CPL_COLORS.pago}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                yAxisId="cpl"
                type="monotone"
                dataKey="CPL Geral"
                stroke={CPL_COLORS.geral}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              >
                <LabelList content={renderPointLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Leads Cumulative Chart */}
        <div className="rounded-md border p-4 space-y-2">
          <h4 className="text-sm font-semibold">Leads Acumulados</h4>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={leadsChartData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={[0, "auto"]}
                allowDecimals={false}
                allowDataOverflow={false}
              />
              <Tooltip labelFormatter={(label) => `Dia ${label}`} />
              <Legend />
              <Area
                type="monotone"
                dataKey="Total Leads"
                fill="hsl(220 15% 70%)"
                fillOpacity={0.12}
                stroke="hsl(220 15% 60%)"
                strokeWidth={1}
                strokeDasharray="4 3"
                dot={false}
              >
                <LabelList content={renderPointLabel} />
              </Area>
              <Line
                type="monotone"
                dataKey="Leads Pagos"
                stroke={LEADS_COLORS.pagos}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                type="monotone"
                dataKey="Leads Org"
                stroke={LEADS_COLORS.org}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
              <Line
                type="monotone"
                dataKey="Leads s/ Track"
                stroke={LEADS_COLORS.semTrack}
                strokeWidth={2}
                dot={{ r: 3 }}
              >
                <LabelList content={renderPointLabel} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
