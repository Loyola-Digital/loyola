"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface WebhookLeadsFonte {
  id: string;
  sourceId: string;
  /** Caminho; a tela prefixa com a base da API para formar a URL. */
  path: string;
  /** `null` para convidado — o token autoriza escrever lead na etapa. */
  token: string | null;
  recebidos: number;
  ultimoEm: string | null;
}

function chave(projectId: string, funnelId: string, id: string) {
  return ["webhook-leads", projectId, funnelId, id] as const;
}

export function useWebhookLeadsFonte(
  projectId: string,
  funnelId: string,
  spreadsheetId: string | null | undefined,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: chave(projectId, funnelId, spreadsheetId ?? ""),
    queryFn: () =>
      apiClient<WebhookLeadsFonte>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-leads/${spreadsheetId}`,
      ),
    enabled: Boolean(projectId && funnelId && spreadsheetId),
  });
}

export function useCriarWebhookLeads(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { stageId?: string; label: string }) =>
      apiClient<WebhookLeadsFonte>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-leads`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      // A fonte aparece na lista de planilhas do funil — é uma planilha virtual.
      qc.invalidateQueries({ queryKey: ["funnel-spreadsheets", projectId, funnelId] });
    },
  });
}

export function useRotacionarWebhookLeads(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spreadsheetId: string) =>
      apiClient<WebhookLeadsFonte>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-leads/${spreadsheetId}/rotate`,
        { method: "POST" },
      ),
    onSuccess: (_data, spreadsheetId) => {
      qc.invalidateQueries({ queryKey: chave(projectId, funnelId, spreadsheetId) });
    },
  });
}
