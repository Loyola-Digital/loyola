"use client";

import { FormulaTooltipContent } from "@/components/metrics/formula-tooltip-content";
import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Payload genérico do Recharts. Mantemos tipado de forma relaxada pois
 * Recharts passa `any` — o importante é extrair `payload[i].payload`
 * (o data item original) onde esperamos encontrar `formula` (singular,
 * comum a todas as séries) ou `formulasByKey` (por `dataKey`, uma por série).
 */
interface RechartsPayloadEntry {
  name?: string;
  dataKey?: string | number;
  value?: string | number;
  color?: string;
  payload?: Record<string, unknown> & {
    formula?: MetricFormula;
    formulasByKey?: Record<string, MetricFormula>;
  };
}

interface FormulaChartTooltipProps {
  active?: boolean;
  payload?: RechartsPayloadEntry[];
  label?: string | number;
}

/**
 * Tooltip customizado para gráficos do Recharts. Use como:
 *
 * ```tsx
 * <Tooltip content={<FormulaChartTooltip />} />
 * ```
 *
 * **Convenção:** cada item do `data` do gráfico deve incluir uma chave
 * `formula: MetricFormula`. Se uma série tiver sua própria fórmula
 * (ex: `formulaRoas`, `formulaCpl`), o payload deve usar esses nomes e
 * o tooltip vai procurar primeiro `payload.formula` e, se ausente,
 * cair no fallback simples do Recharts (label + valor).
 *
 * Quando múltiplas séries têm formulas diferentes, empilhamos um
 * `<FormulaTooltipContent>` por série.
 */
export function FormulaChartTooltip({
  active,
  payload,
  label,
}: FormulaChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  // Coleta (seriesName, value, formula) para cada série que tenha formula.
  const formulas: Array<{
    seriesName: string;
    value: string | number | undefined;
    formula: MetricFormula;
  }> = [];

  for (const entry of payload) {
    const byKey = entry.payload?.formulasByKey;
    const dataKey = entry.dataKey !== undefined ? String(entry.dataKey) : undefined;
    const perSeries = dataKey ? byKey?.[dataKey] : undefined;
    const candidate = perSeries ?? entry.payload?.formula;
    if (candidate) {
      formulas.push({
        seriesName: entry.name ?? dataKey ?? "",
        value: entry.value,
        formula: candidate,
      });
    }
  }

  // Nenhuma série carrega formula → fallback visual simples (Recharts style).
  if (formulas.length === 0) {
    return (
      <div className="rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">
        {label !== undefined && (
          <div className="mb-1 font-semibold">{label}</div>
        )}
        <div className="space-y-0.5">
          {payload.map((entry, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span
                className="text-muted-foreground"
                style={entry.color ? { color: entry.color } : undefined}
              >
                {entry.name ?? entry.dataKey}
              </span>
              <span className="font-mono tabular-nums">
                {entry.value !== undefined && typeof entry.value === "number"
                  ? new Intl.NumberFormat("pt-BR").format(entry.value)
                  : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      {label !== undefined && (
        <div className="border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px] font-semibold text-foreground/90">
          {label}
        </div>
      )}
      <div className="divide-y divide-border/30">
        {formulas.map((f, i) => (
          <FormulaTooltipContent
            key={i}
            label={f.seriesName}
            value={f.value as string | number}
            formula={f.formula}
          />
        ))}
      </div>
    </div>
  );
}
