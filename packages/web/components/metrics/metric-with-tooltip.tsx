"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormulaTooltipContent } from "@/components/metrics/formula-tooltip-content";
import type { MetricFormula } from "@/lib/types/metric-formula";
import { cn } from "@/lib/utils";

interface MetricWithTooltipProps {
  /** Rótulo humano da métrica — ex: "Taxa de Conversão". */
  label: string;
  /** Valor final formatado — ex: "90%", "R$ 1.200,50". */
  value: ReactNode;
  /**
   * Memorial de cálculo. Se ausente, o componente renderiza sem ícone
   * Info e sem tooltip (graceful fallback durante loading ou quando a
   * métrica é um snapshot puro).
   */
  formula?: MetricFormula;
  /** Conteúdo extra opcional abaixo do valor — ex: delta, subtítulo. */
  children?: ReactNode;
  /** Lado onde o tooltip deve aparecer. Default: `top`. */
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Wrapper padrão para cards KPI que expõe o memorial de cálculo ao hover.
 * O card inteiro é o trigger (não apenas o ícone), maximizando a área de hover.
 */
export function MetricWithTooltip({
  label,
  value,
  formula,
  children,
  side = "top",
  className,
}: MetricWithTooltipProps) {
  const hasFormula = Boolean(formula);

  const content = (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border/40 bg-card/60 p-4 transition-colors",
        hasFormula && "hover:border-border/70 hover:bg-card/80 cursor-help",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        {hasFormula && (
          <Info
            className="h-3 w-3 text-muted-foreground/60"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {children}
    </div>
  );

  if (!hasFormula || !formula) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side={side} className="p-0">
        <FormulaTooltipContent
          label={label}
          value={typeof value === "string" || typeof value === "number" ? value : undefined}
          formula={formula}
        />
      </TooltipContent>
    </Tooltip>
  );
}
