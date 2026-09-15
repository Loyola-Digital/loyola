"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * O "i" ao lado de um título ou cabeçalho: o que o número é e de onde sai.
 *
 * Tooltip e não `title`: o texto tem várias linhas (definição, conta, limite
 * da Meta), e o `title` do navegador demora a abrir e não quebra linha.
 */
export function Dica({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="O que é isto"
          className={`inline-flex shrink-0 items-center text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground ${className ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-line text-[11px] leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
