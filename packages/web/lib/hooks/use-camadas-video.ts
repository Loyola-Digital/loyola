"use client";

// Story 43.8 — as três camadas do vídeo.

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type {
  Camada,
  CriativoAvaliado,
  AvaliacaoContraAlvo,
  Remontagem,
} from "@loyola-x/shared/src/video-camadas";

export interface CamadasDeVideoResponse {
  /** Desde quando o denominador das taxas existe (AC2). */
  serieDesde: string | null;
  totalDeCriativos: number;
  acimaDoPiso: number;
  alvos: Record<Camada, AvaliacaoContraAlvo>;
  campeoes: Record<Camada, CriativoAvaliado | null>;
  ranking: Record<Camada, CriativoAvaliado[]>;
  sugestoes: Remontagem[];
  padraoOuro: CriativoAvaliado[];
  fracos: CriativoAvaliado[];
}

export function useCamadasDeVideo(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["camadas-de-video", projectId],
    queryFn: () =>
      apiClient<CamadasDeVideoResponse>(
        `/api/traffic/analytics/${projectId}/camadas-de-video`,
      ),
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
  });
}
