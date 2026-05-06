"use client";

import {
  ComposedChart,
  Area,
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

interface LeadsCumulativeChartProps {
  rows: DailyRow[];
  title?: string;
  /**
   * Map de YYYY-MM-DD para count de leads gratuitos (das pesquisas orgânicas
   * vinculadas) que entraram naquele dia. Quando informado, renderiza linha
   * adicional "Leads Gratuitos" no gráfico cumulativo.
   */
  leadsGratuitosByDay?: Record<string, number>;
}

const LEADS_COLORS = {
  pagos: "hsl(220 80% 55%)",
  org: "hsl(150 60% 50%)",
  semTrack: "hsl(40 90% 55%)",
  gratuitos: "hsl(280 70% 60%)",
};

function formatDateShort(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function buildLeadsCumulativeData(
  rows: DailyRow[],
  leadsGratuitosByDay?: Record<string, number>,
) {
  let cumPagos = 0;
  let cumOrg = 0;
  let cumSemTrack = 0;
  let cumGratuitos = 0;
  const showGratuitos = !!leadsGratuitosByDay;
  return rows.map((r) => {
    cumPagos += r.leadsPagos;
    cumOrg += r.leadsOrg;
    cumSemTrack += r.leadsSemTrack;
    if (showGratuitos) {
      cumGratuitos += leadsGratuitosByDay![r.date] ?? 0;
    }
    const totalDay = cumPagos + cumOrg + cumSemTrack + (showGratuitos ? cumGratuitos : 0);
    return {
      date: formatDateShort(r.date),
      "Leads Pagos": cumPagos,
      "Leads Org": cumOrg,
      "Leads s/ Track": cumSemTrack,
      ...(showGratuitos ? { "Leads Gratuitos": cumGratuitos } : {}),
      "Total Leads": totalDay,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPointLabel(props: any) {
  const { x, y, value } = props as { x?: number; y?: number; value?: number | null };
  if (value == null || x == null || y == null) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="currentColor">
      {typeof value === "number"
        ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
        : value}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const hasGratuitos = data["Leads Gratuitos"] !== undefined;
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg space-y-1 text-xs">
      <div className="font-semibold">{data.date}</div>
      <div className="text-muted-foreground">Total Leads: {data["Total Leads"]}</div>
      <div className="border-t border-border/30 pt-1 mt-1">
        <div className="text-muted-foreground">Leads Pagos: {data["Leads Pagos"]}</div>
        <div className="text-muted-foreground">Leads Org: {data["Leads Org"]}</div>
        <div className="text-muted-foreground">Leads s/ Track: {data["Leads s/ Track"]}</div>
        {hasGratuitos && (
          <div className="text-muted-foreground">Leads Gratuitos: {data["Leads Gratuitos"]}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Gráfico de leads acumulados ao longo do tempo: área de Total + 3 linhas
 * (Pagos / Org / Sem Track).
 *
 * Introduzido na Story 18.4 como componente reutilizável. Usado na aba
 * Meta Ads (LaunchDashboard).
 */
export function LeadsCumulativeChart({
  rows,
  title = "Leads Acumulados",
  leadsGratuitosByDay,
}: LeadsCumulativeChartProps) {
  const data = buildLeadsCumulativeData(rows, leadsGratuitosByDay);
  const showGratuitos = !!leadsGratuitosByDay;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[0, "auto"]}
            allowDecimals={false}
            allowDataOverflow={false}
          />
          <Tooltip content={<CustomTooltip />} />
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
          {showGratuitos && (
            <Line
              type="monotone"
              dataKey="Leads Gratuitos"
              stroke={LEADS_COLORS.gratuitos}
              strokeWidth={2}
              dot={{ r: 3 }}
            >
              <LabelList content={renderPointLabel} />
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
