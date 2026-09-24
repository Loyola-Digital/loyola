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
import { useParams } from "next/navigation";
import { ChevronDown, Video } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { VturbStageTab } from "./vturb-stage-tab";

export function VslCollapsibleSection({
  projectId,
  stageId,
}: {
  projectId: string;
  stageId: string;
}) {
  const [aberto, setAberto] = useState(false);
  // Story 29.78 (PO-02) — o bloco precisa saber o FUNIL e o tipo dele: a
  // tabela das VSLs é só do perpétuo e lê os vídeos do funil inteiro. Vêm da
  // URL e do `useFunnel` que a página da etapa já carregou (mesma chave do
  // React Query — sem chamada nova), sem mudar quem chama o bloco.
  const params = useParams<{ funnelId?: string }>();
  const funnelId = typeof params?.funnelId === "string" ? params.funnelId : null;
  const { data: funnelData } = useFunnel(projectId, funnelId);

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
        <VturbStageTab
          projectId={projectId}
          stageId={stageId}
          funnelId={funnelId}
          funnelType={funnelData?.funnelType ?? null}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
