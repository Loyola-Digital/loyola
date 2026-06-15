"use client";

import { Megaphone } from "lucide-react";

interface BlockSummaryCardProps {
  /** Rótulo da seção (ex: "Contexto", "Bônus"). Default "Contexto". */
  label?: string;
  /** Texto livre da seção. Esconde quando vazio. */
  manualText?: string | null;
  accentColor: string;
}

/**
 * Card de conteúdo de uma seção do Calendário Macro (Contexto, Bônus, etc).
 * Renderiza o texto da seção com o rótulo escolhido pelo time. Esconde quando
 * não há texto.
 */
export function BlockSummaryCard({ label = "Contexto", manualText, accentColor }: BlockSummaryCardProps) {
  const hasText = !!manualText && manualText.trim().length > 0;
  if (!hasText) return null;

  return (
    <div
      className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2 relative overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Megaphone className="h-3 w-3" />
        {label}
      </div>

      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
        {manualText}
      </p>
    </div>
  );
}
