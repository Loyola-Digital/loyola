"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 38 — hooks NPS. Dataset de NPS por etapa (planilha + mapeamento de colunas,
// igual às pesquisas) cruzado por e-mail/nome com as respostas do Loyola da etapa.

export interface NpsColumnMapping {
  name?: string;
  email?: string;
  score?: string;
  timestamp?: string;
}

export interface NpsDataset {
  id: string;
  funnelId: string;
  stageId: string | null;
  label: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: NpsColumnMapping;
  createdAt: string;
}

export interface NpsCrossRow {
  name: string | null;
  email: string | null;
  score: number | null;
  sentiment: "promotor" | "neutro" | "detrator" | null;
  positive: boolean;
  timestamp: string | null;
  matched: boolean;
  matchedBy: "email" | "nome" | null;
  loyola: Record<string, string> | null;
}

export interface NpsCrossResponse {
  label: string;
  rows: NpsCrossRow[];
  summary: {
    total: number;
    promotores: number;
    neutros: number;
    detratores: number;
    semNota: number;
    matched: number;
    npsScore: number;
  };
  loyolaColumns: string[];
  surveysFound: number;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/nps`;
}

export function useNpsDatasets(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nps-datasets", projectId, funnelId, stageId],
    queryFn: () => apiClient<{ datasets: NpsDataset[] }>(base(projectId, funnelId, stageId)),
  });
}

export function useCreateNpsDataset(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { label: string; spreadsheetId: string; spreadsheetName: string; sheetName: string }) =>
      apiClient<NpsDataset>(base(projectId, funnelId, stageId), { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nps-datasets", projectId, funnelId, stageId] }),
  });
}

export function useDeleteNpsDataset(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datasetId: string) =>
      apiClient<{ success: boolean }>(`${base(projectId, funnelId, stageId)}/${datasetId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nps-datasets", projectId, funnelId, stageId] }),
  });
}

export function usePatchNpsMapping(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, mapping }: { datasetId: string; mapping: NpsColumnMapping }) =>
      apiClient<NpsDataset>(`${base(projectId, funnelId, stageId)}/${datasetId}/mapping`, {
        method: "PATCH",
        body: JSON.stringify(mapping),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nps-datasets", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["nps-cross", projectId, funnelId, stageId] });
    },
  });
}

export function useNpsCross(
  projectId: string,
  funnelId: string,
  stageId: string,
  datasetId: string | null,
  enabled: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nps-cross", projectId, funnelId, stageId, datasetId],
    queryFn: () => apiClient<NpsCrossResponse>(`${base(projectId, funnelId, stageId)}/${datasetId}/cross`),
    enabled: enabled && !!datasetId,
  });
}
