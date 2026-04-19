"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { CampaignAnalytics } from "@/lib/hooks/use-traffic-analytics";

interface HotColdSpendDonutProps {
  campaigns: CampaignAnalytics[];
  title?: string;
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
  campaigns: string[];
}

function categorize(campaignName: string): Category {
  const normalized = campaignName.toLowerCase();
  if (normalized.includes("hot")) return "hot";
  if (normalized.includes("cold")) return "cold";
  return "outros";
}

function buildDonutData(campaigns: CampaignAnalytics[]): DonutDatum[] {
  const buckets: Record<Category, DonutDatum> = {
    hot: { key: "hot", name: "Hot", value: 0, campaigns: [] },
    cold: { key: "cold", name: "Cold", value: 0, campaigns: [] },
    outros: { key: "outros", name: "Outros", value: 0, campaigns: [] },
  };
  for (const c of campaigns) {
    const cat = categorize(c.campaignName);
    buckets[cat].value += c.spend;
    buckets[cat].campaigns.push(c.campaignName);
  }
  return (["hot", "cold", "outros"] as Category[])
    .map((k) => buckets[k])
    .filter((d) => d.value > 0);
}

function fmtCurrencyCompact(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

/**
 * Label dentro da fatia. Se a fatia ocupar menos de 15% do donut, retorna null
 * (cai no legend lateral). Formato: `R$ X.XXX (YY%)` em duas linhas.
 */
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
        {fmtCurrencyCompact(value)}
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

/**
 * Tooltip customizado. Pra "Outros", lista as campanhas incluídas (até 20 — se
 * houver mais, exibe "+N").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload } = props as {
    active?: boolean;
    payload?: Array<{ payload: DonutDatum }>;
  };
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  const MAX_NAMES = 20;
  const names = datum.campaigns.slice(0, MAX_NAMES);
  const remaining = datum.campaigns.length - names.length;
  return (
    <div className="rounded-lg border border-border/40 bg-card/95 backdrop-blur-sm p-3 text-xs shadow-xl max-w-[280px]">
      <p className="font-semibold mb-1">{datum.name}</p>
      <p className="text-muted-foreground mb-2">{fmtCurrencyCompact(datum.value)}</p>
      {datum.key === "outros" && datum.campaigns.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-[10px] text-muted-foreground mb-1">
            Campanhas incluídas ({datum.campaigns.length}):
          </p>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {names.map((n, i) => (
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
 * Donut de distribuição de investimento entre públicos Hot/Cold/Outros.
 *
 * Regra determinística (case-insensitive) aplicada ao `campaignName`:
 * - contém "hot" → Hot
 * - senão se contém "cold" → Cold
 * - senão → Outros
 *
 * Quando o cursor passa sobre a fatia "Outros", o tooltip lista os nomes das
 * campanhas que caíram nessa categoria (limite de 20 exibidas + "+N mais").
 *
 * Substitui o CampaignDonut anterior (top-5 por spend) na aba Meta Ads.
 */
export function HotColdSpendDonut({
  campaigns,
  title = "Distribuição de Investimento",
}: HotColdSpendDonutProps) {
  const data = buildDonutData(campaigns);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem investimento no período selecionado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={80}
              strokeWidth={1}
              label={renderSliceLabel}
              labelLine={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={HOT_COLD_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5 text-xs flex-1 min-w-0">
          {data.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: HOT_COLD_COLORS[d.key] }}
              />
              <span className="truncate flex-1 font-medium">{d.name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {fmtCurrencyCompact(d.value)}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
