"use client";

import Link from "next/link";
import { Calculator, ChevronRight } from "lucide-react";
import { planejamentoHref as href } from "@/lib/utils/planejamento-entrada";

// Story 48.1 — ponto de entrada do Painel de Planejamento (Epic 48).
// Cartão FIXO no grid do funil de LANÇAMENTO, ao lado do Log de Campanha
// (mesmo molde de `campaign-log-link.tsx`, decisão A6 do @architect): o
// simulador é uma sub-página do funil, não uma etapa.

// Story 48.7 — a função mora em `lib/utils/planejamento-entrada.ts` (lá o
// vitest do web a alcança); aqui fica a reexportação para os imports que já
// existiam não quebrarem.
export { planejamentoHref } from "@/lib/utils/planejamento-entrada";

/** Card fixo exibido no grid de etapas do funil `launch` (sem drag, sem delete). */
export function PlanejamentoCard({ projectId, funnelId }: { projectId: string; funnelId: string }) {
  return (
    <Link href={href(projectId, funnelId)} className="block group">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Calculator className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="font-semibold text-sm truncate">Planejamento</p>
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                Fixa
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Metas, custos, investimento e cenários — quantos leads captar e a que CPL para bater a margem
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}
