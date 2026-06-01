"use client";

import { ExternalLink, Megaphone } from "lucide-react";

interface BlockSummaryCardProps {
  origin: "manual" | "auto";
  text: string;
  link?: string | null;
  accentColor: string;
}

/**
 * Story 31.7 — Card "resumo executivo" no topo do SprintBlockCard. Conteúdo
 * vem de `block.manualContext` (origin=manual) OU da primeira task com 📢/📣
 * no nome (origin=auto).
 */
export function BlockSummaryCard({ origin, text, link, accentColor }: BlockSummaryCardProps) {
  return (
    <div
      className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5 relative overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Megaphone className="h-3 w-3" />
          Resumo
        </div>
        {origin === "manual" ? (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            manual
          </span>
        ) : link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Abrir task no ClickUp"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{text}</p>
    </div>
  );
}
