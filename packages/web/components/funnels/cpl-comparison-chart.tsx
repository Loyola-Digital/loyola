"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import type { DailyRow } from "@/lib/utils/funnel-metrics";

interface CplComparisonChartProps {
  rows: DailyRow[];
  title?: string;
}

const CPL_COLORS = { pago: "hsl(220 80% 55%)", geral: "hsl(280 60% 55%)" };

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
    leadsPagos: r.leadsPagos,
    leadsOrg: r.leadsOrg,
    leadsSemTrack: r.leadsSemTrack,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPointLabel(props: any) {
  const { x, y, value } = props as { x?: number; y?: number; value?: number | null };
  if (value == null || x == null || y == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="currentColor">
      {typeof value === "number"
        ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
        : value}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg space-y-1 text-xs">
      <div className="font-semibold">{data.date}</div>
      <div className="text-muted-foreground">Investimento: {fmtCurrency(data.Investimento)}</div>
      <div className="text-muted-foreground">CPL Pago: {fmtCurrency(data["CPL Pago"])}</div>
      <div className="text-muted-foreground">CPL Geral: {fmtCurrency(data["CPL Geral"])}</div>
      <div className="border-t border-border/30 pt-1 mt-1">
        <div className="text-muted-foreground">
          Leads: {data.leadsPagos} Pagos | {data.leadsOrg} Org | {data.leadsSemTrack} Sem origem
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBarLabel(props: any) {
  const { x, y, width, height, value } = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number | null;
  };
  if (value == null || x == null || y == null || width == null || height == null || height < 14) {
    return null;
  }
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

/**
 * Gráfico combinado: barras de Investimento + linhas de CPL Pago vs CPL Geral.
 *
 * Introduzido na Story 18.4 como componente reutilizável. Usado na aba
 * Meta Ads (LaunchDashboard).
 */
export function CplComparisonChart({
  rows,
  title = "CPL Pago vs CPL Geral",
}: CplComparisonChartProps) {
  const data = buildCplChartData(rows);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
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
          <Tooltip content={<CustomTooltip />} />
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
  );
}
