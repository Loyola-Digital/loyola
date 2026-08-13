"use client";

/**
 * Bloco "VSL" do dashboard principal — o analytics do VTurb que antes vivia numa
 * aba própria.
 *
 * Fica RECOLHIDO por padrão de propósito: o dash da VSL dispara chamadas à
 * Analytics API do VTurb (cota por conta, compartilhada entre todo mundo do
 * time), então montá-lo junto com o dashboard gastaria cota de quem só veio ver
 * Meta Ads. Recolhido, o conteúdo nem monta — o Collapsible do Radix só
 * renderiza os filhos quando abre.
 */

import { useState } from "react";
import { ChevronDown, Video } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VturbStageTab } from "./vturb-stage-tab";

export function VslCollapsibleSection({
  projectId,
  stageId,
}: {
  projectId: string;
  stageId: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="mt-6">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl border border-border/40 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30">
        <Video className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">VSL</span>
        <span className="text-xs text-muted-foreground">
          retenção, play rate e ponto de pitch (VTurb)
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <VturbStageTab projectId={projectId} stageId={stageId} />
      </CollapsibleContent>
    </Collapsible>
  );
}
