"use client";

/**
 * Aplicações por dia — uma série por planilha de aplicação (forma) do funil.
 *
 * O time pode ter mais de uma planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket"); cada uma vira uma forma nomeada pelo
 * `label`. As séries vêm alinhadas pelo dia relativo (não pela data) porque a
 * pergunta é "estamos melhor que o lançamento passado NESTA altura?" — comparar
 * por data não responde isso, já que dois lançamentos começam em dias
 * diferentes. A comparação é casada forma a forma pelo nome.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface ApplicationDay {
  /** 1 = primeiro dia com aplicação do lançamento. */
  dia: number;
  date: string;
  aplicacoes: number;
  acumulado: number;
}

export interface ApplicationForm {
  /** id da planilha (funnel_spreadsheets) — chave estável de série. */
  sheetId: string;
  /** nome amigável da forma (label da planilha) — mostrado no tooltip/legenda. */
  label: string;
  total: number;
  points: ApplicationDay[];
  /** mesma forma (por nome) no lançamento anterior. null = sem par. */
  comparacao: {
    points: ApplicationDay[];
    total: number;
  } | null;
  /** Acumulado atual vs. o do anterior NO MESMO D-day. null = sem base. */
  deltaPercent: number | null;
}

export interface StageApplications {
  funnelName: string;
  /** nome do lançamento de comparação (compareFunnelId). null = não configurado. */
  compareFunnelName: string | null;
  /** true = nenhuma planilha do tipo "applications" vinculada. */
  semPlanilha: boolean;
  /** uma série por planilha de aplicação. */
  forms: ApplicationForm[];
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
