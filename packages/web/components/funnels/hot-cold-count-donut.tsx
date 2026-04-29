"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { HotColdAggregate } from "@/lib/utils/funnel-metrics";

interface HotColdCountDonutProps {
  aggregate: HotColdAggregate;
  title: string;
  /** Singular/plural to show in legend rows ("lead" / "leads", "comprador" / "compradores"). */
  noun: { singular: string; plural: string };
}

const HOT_COLD_COLORS = {
  hot: "hsl(10 80% 55%)",
  cold: "hsl(210 80% 55%)",
  outros: "hsl(220 10% 55%)",
} as const;

type Category = "hot" | "cold" | "outros";

interface DonutDatum {
  key: Category;
  name: string;
  value: number;
  items: string[];
}

function buildDonutData(agg: HotColdAggregate): DonutDatum[] {
  return [
    { key: "hot", name: "Hot", value: agg.hot, items: agg.items.hot },
    { key: "cold", name: "Cold", value: agg.cold, items: agg.items.cold },
    { key: "outros", name: "Outros", value: agg.outros, items: agg.items.outros },
  ];
}

function fmtInt(v: number): string {
  return v.toLocaleString("pt-BR");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSliceLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, value } = props as {
    cx: number;
    cy: number;
    midAngle: number;
    innerRadius: number;
    outerRadius: number;
    percent: number;
    value: number;
  };
  if (percent < 0.15) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill="#fff"
      >
        {fmtInt(value)}
      </text>
      <text
        x={x}
        y={y + 8}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fill="#fff"
      >
        {`(${(percent * 100).toFixed(0)}%)`}
      </text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload } = props as {
    active?: boolean;
    payload?: Array<{ payload: DonutDatum }>;
  };
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  const MAX = 15;
  const items = datum.items.slice(0, MAX);
  const remaining = datum.items.length - items.length;
  return (
    <div className="rounded-lg border border-border/40 bg-card/95 backdrop-blur-sm p-3 text-xs shadow-xl max-w-[280px]">
      <p className="font-semibold mb-1">{datum.name}</p>
      <p className="text-muted-foreground mb-2">{fmtInt(datum.value)}</p>
      {items.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-[10px] text-muted-foreground mb-1">
            Termos encontrados ({datum.items.length}):
          </p>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {items.map((n, i) => (
              <li key={`${n}-${i}`} className="text-[10px] truncate">
                • {n}
              </li>
            ))}
            {remaining > 0 && (
              <li className="text-[10px] text-muted-foreground">+{remaining} mais</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Donut Hot/Cold/Outros baseado em contagem (leads, compradores, etc).
 * Categorização é feita upstream em `aggregateHotColdByUtmTerm`.
 */
export function HotColdCountDonut({
  aggregate,
  title,
  noun,
}: HotColdCountDonutProps) {
  const data = buildDonutData(aggregate);
  const total = aggregate.total;
  const chartData = data.filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem {noun.plural} no período selecionado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      <div className="flex justify-center w-full">
        <div className="w-full aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="35%"
                outerRadius="85%"
                strokeWidth={1}
                label={renderSliceLabel}
                labelLine={false}
              >
                {chartData.map((d) => (
                  <Cell key={d.key} fill={HOT_COLD_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {data.map((d) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          const label = d.value === 1 ? noun.singular : noun.plural;
          return (
            <div key={d.key} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: HOT_COLD_COLORS[d.key] }}
              />
              <span className="font-medium w-16 shrink-0">{d.name}</span>
              <span className="text-muted-foreground tabular-nums flex-1">
                {d.value > 0 ? `${fmtInt(d.value)} ${label}` : "—"}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0 w-12 text-right">
                {pct > 0 ? `${pct.toFixed(0)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
