import type { MetricFormula } from "@/lib/types/metric-formula";
import { cn } from "@/lib/utils";

interface FormulaTooltipContentProps {
  /** Opcional — título/rótulo da métrica mostrado no topo. */
  label?: string;
  /** Opcional — valor final da métrica mostrado em destaque no topo. */
  value?: string | number;
  /** Memorial de cálculo completo. */
  formula: MetricFormula;
  className?: string;
}

/**
 * Conteúdo visual compartilhado usado dentro do `<Tooltip>` (cards KPI)
 * e do custom Tooltip do Recharts (gráficos). Largura min 280px / max 400px.
 */
export function FormulaTooltipContent({
  label,
  value,
  formula,
  className,
}: FormulaTooltipContentProps) {
  return (
    <div
      className={cn(
        "min-w-[280px] max-w-[400px] space-y-2 p-3 text-xs text-foreground",
        className,
      )}
    >
      {(label || value !== undefined) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2">
          {label && (
            <span className="text-xs font-semibold text-foreground/90">
              {label}
            </span>
          )}
          {value !== undefined && (
            <span className="text-xs font-bold text-brand">{value}</span>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Fórmula
        </div>
        <div className="break-words font-mono text-[11px] text-foreground/90">
          {formula.expression}
        </div>
      </div>

      {formula.values.length > 0 && (
        <div className="space-y-1 border-t border-border/40 pt-2">
          {formula.values.map((v, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground/90">
                  {v.label}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {v.source}
                </div>
              </div>
              <div className="shrink-0 font-mono tabular-nums text-foreground">
                {typeof v.value === "number"
                  ? new Intl.NumberFormat("pt-BR").format(v.value)
                  : v.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1 border-t border-border/40 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resultado
          </span>
          <span className="font-mono text-[11px] font-semibold text-brand">
            {formula.result}
          </span>
        </div>
        {formula.period && (
          <div className="flex items-baseline justify-between gap-3 text-[10px] text-muted-foreground">
            <span>Período</span>
            <span className="font-mono">{formula.period}</span>
          </div>
        )}
        {formula.note && (
          <div className="text-[10px] italic text-muted-foreground">
            {formula.note}
          </div>
        )}
      </div>
    </div>
  );
}
