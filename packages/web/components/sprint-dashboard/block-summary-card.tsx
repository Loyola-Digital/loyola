"use client";

import { Megaphone } from "lucide-react";
import type { AutoPhase } from "./summary-utils";

interface BlockSummaryCardProps {
  /** Texto livre do manualContext. Renderiza no topo. */
  manualText?: string | null;
  /** Fases derivadas das tasks com 📢 — usadas só pra decidir se renderiza
   * (não exibidas dentro do card pra evitar duplicar com a seção "Fases"
   * do CampaignCard). */
  phases: AutoPhase[];
  accentColor: string;
}

/**
 * Story 31.8 iter — Card resumo: SÓ o texto manualContext. Fases viviam aqui
 * antes mas duplicavam visualmente com a seção "Fases" do CampaignCard, então
 * agora ficam só lá. Componente esconde quando não tem texto manual.
 */
export function BlockSummaryCard({ manualText, phases: _phases, accentColor }: BlockSummaryCardProps) {
  const hasManual = !!manualText && manualText.trim().length > 0;
  if (!hasManual) return null;

  return (
    <div
      className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2 relative overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Megaphone className="h-3 w-3" />
        Contexto do lançamento
      </div>

      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
        {manualText}
      </p>
    </div>
  );
}
