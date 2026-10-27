"use client";

// ============================================================
// Story 42.14 (AC1, AC3) — o card com janela declarada e memorial, dos dois
// blocos da etapa Lyrio (Resumo mobile e Overview do RevenueCat).
//
// As duas armadilhas do Epic 42 que fazem um memorial não abrir, e que passam
// no build sem aviso nenhum (AC1d):
//  1. `<TooltipTrigger asChild>` clona o filho e injeta ref e handlers. Um card
//     que não é `forwardRef` com `{...rest}` descarta os dois — o tooltip nunca
//     abre. Por isso a superfície é `forwardRef` e espalha o resto das props.
//  2. Uma `<div>` não recebe foco: sem `tabIndex`, o memorial existiria só
//     para quem usa mouse.
// O `TooltipProvider` fica a cargo de quem renderiza o bloco (ver o Overview).
// ============================================================

import * as React from "react";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import type { MetricFormula } from "@/lib/types/metric-formula";
import type { DeclaracaoDaJanela } from "@/lib/utils/janela-dos-cards-lyrio";

/** A superfície do card. `forwardRef` + `{...rest}`: é o que o `asChild` do trigger exige. */
export const SuperficieDoCard = React.forwardRef<
  HTMLDivElement,
  {
    rotulo: string;
    valor: string;
    declaracao: DeclaracaoDaJanela;
    /** Há memorial: cursor de ajuda e sublinhado pontilhado no valor. */
    comMemorial?: boolean;
    icone?: React.ComponentType<{ className?: string }>;
    /** Classe extra no valor (ex.: vermelho para margem negativa). */
    classeDoValor?: string;
    /** Destaque de "resultado" (ROAS, Margem) — independe do âmbar da janela. */
    realce?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
>(function SuperficieDoCard(
  { rotulo, valor, declaracao, comMemorial, icone: Icone, classeDoValor, realce, className, ...rest },
  ref,
) {
  // AC3a — o âmbar é de quem NÃO segue o filtro, e só dele.
  const fundo = declaracao.destaque
    ? "border-amber-500/40 bg-amber-500/10"
    : realce
      ? "border-primary/30 bg-primary/5"
      : "border-border/40 bg-card";
  return (
    <div
      ref={ref}
      {...rest}
      data-janela={declaracao.segueOFiltro ? "segue" : "nao-segue"}
      className={`space-y-0.5 rounded-lg border p-3 ${fundo} ${comMemorial ? "cursor-help" : ""} ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icone && <Icone className="h-3.5 w-3.5" />}
        {rotulo}
      </div>
      <p
        className={`text-base font-bold tabular-nums ${realce && !declaracao.destaque ? "text-primary" : ""} ${classeDoValor ?? ""} ${
          comMemorial ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""
        }`}
      >
        {valor}
      </p>
      {/* AC3 — a janela de cada número, sempre, pela fonte única (AC2a). */}
      <p className={`text-[10px] ${declaracao.destaque ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground/70"}`}>
        {declaracao.etiqueta}
      </p>
    </div>
  );
});

/**
 * O card com memorial. Sem `formula` (ausência legítima ou carregando), o
 * `<MetricTooltip>` repassa o filho sem tooltip e o card não recebe foco (AC1c).
 */
export function CardComJanela({
  formula,
  ...props
}: {
  rotulo: string;
  valor: string;
  declaracao: DeclaracaoDaJanela;
  formula?: MetricFormula;
  icone?: React.ComponentType<{ className?: string }>;
  classeDoValor?: string;
  realce?: boolean;
}) {
  return (
    <MetricTooltip label={props.rotulo} value={props.valor} formula={formula}>
      <SuperficieDoCard {...props} comMemorial={!!formula} tabIndex={formula ? 0 : undefined} />
    </MetricTooltip>
  );
}
