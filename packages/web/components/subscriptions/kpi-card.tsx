"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Card de KPI compartilhado (Hotmart + Kiwify).
 *
 * Design: superfície neutra (bg-card + borda padrão), SEM gradiente por card.
 * A cor é semântica, não decorativa — só o ícone é tingido conforme o `tone`
 * (positivo/negativo/alerta) e apenas onde isso comunica algo. O número é o
 * herói (tabular-nums pra alinhar dígitos); label e sub ficam discretos.
 */

export type KpiTone = "default" | "positive" | "negative" | "warning";

const TONE_ICON: Record<KpiTone, string> = {
  default: "text-muted-foreground/70",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export const KpiCard = React.forwardRef<
  HTMLDivElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    tone?: KpiTone;
    /** Card de gap honesto: visual esmaecido + cadeado no lugar do ícone. */
    disabled?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
>(function KpiCard(
  { icon: Icon, label, value, sub, tone = "default", disabled = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-lg border border-border bg-card p-4 transition-colors ${
        disabled ? "opacity-55" : "hover:border-foreground/15"
      } ${className ?? ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {disabled ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        ) : (
          <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE_ICON[tone]}`} />
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  );
});

/** Envolve um card com tooltip de texto (explicação da fórmula/aproximação/gap). */
export function KpiTooltip({
  explain,
  children,
}: {
  explain: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] p-2 text-xs leading-relaxed">
        {explain}
      </TooltipContent>
    </Tooltip>
  );
}

/** Título discreto de seção pra agrupar KPIs (dá hierarquia ao dashboard). */
export function KpiSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium text-muted-foreground">{children}</p>
  );
}
