"use client";

/**
 * Etapa do tipo Mapa — o desenho do funil, em tela cheia.
 *
 * É uma etapa como as outras (aparece na lista, tem nome próprio) e por isso
 * ganha render dedicado, como `sales`, `cpl` e `event`: aqui não há KPI, aba de
 * tráfego nem planilha para mostrar — a tela inteira é o quadro.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { FunnelMapCanvas } from "@/components/funnels/funnel-map/funnel-map-canvas";

interface Props {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: { id: string; name: string };
}

export function MapStageView({ projectId, funnelId, funnelName, stage }: Props) {
  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/projects/${projectId}/funnels/${funnelId}`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> {funnelName}
          </Link>
          <h1 className="truncate text-2xl font-bold">{stage.name}</h1>
          <p className="text-sm text-muted-foreground">
            As peças do lançamento — anúncio, página, checkout, e-mail — e como elas se ligam.
          </p>
        </div>
      </div>

      <FunnelMapCanvas projectId={projectId} funnelId={funnelId} stageId={stage.id} altura={640} />
    </div>
  );
}
