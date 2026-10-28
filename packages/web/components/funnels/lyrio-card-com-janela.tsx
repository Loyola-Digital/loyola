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
import { AlertTriangle } from "lucide-react";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetricFormula } from "@/lib/types/metric-formula";
import type { DeclaracaoDaJanela } from "@/lib/utils/janela-dos-cards-lyrio";
import type { LinhaEmSegundoPlano } from "@/lib/utils/resumo-mobile-lyrio";

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
    /**
     * Story 42.15 (AC7) — as linhas em segundo plano (Meta / Google, ou o CAC
     * máximo e a faixa): menores, abaixo do valor. No celular cortam com
     * reticências (`truncate`); o texto inteiro está no memorial (AC7c).
     */
    secundarias?: readonly LinhaEmSegundoPlano[];
    /** Story 42.15 (AC2g) — a fonte ainda não respondeu: skeleton no lugar do valor. */
    carregando?: boolean;
    /** Story 42.15 (AC10h) — há alerta de distorção no memorial. */
    alerta?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
>(function SuperficieDoCard(
  { rotulo, valor, declaracao, comMemorial, icone: Icone, classeDoValor, realce, secundarias, carregando, alerta, className, ...rest },
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
      className={`min-w-0 space-y-0.5 rounded-lg border p-3 ${fundo} ${comMemorial ? "cursor-help" : ""} ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icone && <Icone className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 truncate">{rotulo}</span>
        {alerta && <AlertTriangle aria-label="Há alertas no memorial" className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />}
      </div>
      {carregando ? (
        <Skeleton data-carregando="" className="h-6 w-24" />
      ) : (
        <p
          className={`text-base font-bold tabular-nums ${realce && !declaracao.destaque ? "text-primary" : ""} ${classeDoValor ?? ""} ${
            comMemorial ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""
          }`}
        >
          {valor}
        </p>
      )}
      {secundarias && secundarias.length > 0 && (
        <ul className="min-w-0 space-y-px" data-secundarias="">
          {secundarias.map((l) => (
            <li
              key={l.id}
              className={`truncate text-[11px] tabular-nums ${l.negativo ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
            >
              {l.rotulo} {l.valor}
              {l.nota && <span className="text-muted-foreground/70"> · {l.nota}</span>}
            </li>
          ))}
        </ul>
      )}
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
  secundarias?: readonly LinhaEmSegundoPlano[];
  carregando?: boolean;
  alerta?: boolean;
}) {
  return (
    <MetricTooltip label={props.rotulo} value={props.valor} formula={formula}>
      <SuperficieDoCard {...props} comMemorial={!!formula} tabIndex={formula ? 0 : undefined} />
    </MetricTooltip>
  );
}
