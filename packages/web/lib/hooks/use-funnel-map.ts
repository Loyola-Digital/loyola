"use client";

/**
 * Mutações que o Mapa do Funil precisa e que os hooks por-etapa não cobrem.
 *
 * `useUpdateStage` fixa o stageId na criação do hook, o que não serve num canvas
 * onde a etapa alvo é a que estiver selecionada. Aqui o id vai no `mutate`.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FunnelStage } from "@loyola-x/shared";

export function useRenameStageById(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, name }: { stageId: string; name: string }) =>
      apiClient<FunnelStage>(`/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["funnel-stages", projectId, funnelId] });
      queryClient.invalidateQueries({ queryKey: ["funnel-stage", projectId, funnelId, v.stageId] });
    },
  });
}
