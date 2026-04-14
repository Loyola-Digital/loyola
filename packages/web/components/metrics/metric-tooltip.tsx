"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormulaTooltipContent } from "@/components/metrics/formula-tooltip-content";
import type { MetricFormula } from "@/lib/types/metric-formula";

interface MetricTooltipProps {
  /** Optional — label shown at the top of the tooltip body. */
  label?: string;
  /** Optional — metric final value shown at the top of the tooltip body. */
  value?: string | number;
  /**
   * Memorial de cálculo. If absent, the component passes children through
   * without rendering a tooltip — useful for loading / no-data states.
   */
  formula?: MetricFormula;
  /** Any existing card/element to be wrapped — preserved visually as-is. */
  children: ReactNode;
  /** Tooltip side. Default: `top`. */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Wraps any existing element (e.g. a custom KPI card with its own design)
 * with a formula tooltip, without replacing the child's layout.
 *
 * Unlike `<MetricWithTooltip>` (which renders its own layout),
 * `<MetricTooltip>` is render-agnostic: it only adds a hover/focus tooltip
 * around `children` when `formula` is provided.
 */
export function MetricTooltip({
  label,
  value,
  formula,
  children,
  side = "top",
}: MetricTooltipProps) {
  if (!formula) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="p-0">
        <FormulaTooltipContent label={label} value={value} formula={formula} />
      </TooltipContent>
    </Tooltip>
  );
}
