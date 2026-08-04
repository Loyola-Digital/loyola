"use client";

/**
 * Aplicações por dia na Captação Paga, indexadas em D1/D2/D3.
 *
 * A série vem alinhada pelo dia relativo (não pela data) porque a pergunta do
 * time é "estamos melhor que o lançamento passado NESTA altura?" — comparar por
 * data não responde isso, já que dois lançamentos começam em dias diferentes.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface ApplicationDay {
  /** 1 = primeiro dia com aplicação daquele lançamento. */
  dia: number;
  date: string;
  aplicacoes: number;
  acumulado: number;
}

export interface StageApplications {
  funnelName: string;
  /** true = nenhuma planilha do tipo "applications" vinculada. */
  semPlanilha: boolean;
  sheetLabel: string | null;
  total: number;
  points: ApplicationDay[];
  comparacao: {
    funnelName: string;
    points: ApplicationDay[];
    total: number;
    /** O funil de comparação existe, mas não tem planilha de aplicação. */
    semPlanilha: boolean;
  } | null;
  /** Acumulado atual vs. o do anterior NO MESMO D-day. null = sem base. */
  deltaPercent: number | null;
}

export function useStageApplications(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-applications", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageApplications>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/applications-daily`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 60 * 1000,
  });
}
