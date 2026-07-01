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

export type NpsInterest = "quente" | "interessado" | "duvida" | "sem" | null;

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
  /** Chave estável do respondente (pra marcar o brinde). */
  key: string;
  /** Resposta crua da pergunta de interesse. */
  interest: string | null;
  interestStatus: NpsInterest;
  interestRank: number;
  /** Brinde já entregue. */
  brindeDelivered: boolean;
  /** Telefone da pessoa (do registro casado); null se não houver. Pro link wa.me. */
  phone: string | null;
  /** Vendedor/closer atribuído no Mapa do Evento; null se não houver. */
  assignedSeller: string | null;
  /** Tipo da pessoa (comprador / 2 cadeira / iFood / fornecedor); null se não houver. */
  tipo: string | null;
  /** Nome de quem convidou (2ª cadeira); null se não houver. */
  inviterName: string | null;
  /** Telefone de quem convidou (resolvido); null se não achado. Pro link wa.me. */
  inviterPhone: string | null;
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

/** Marca/desmarca o brinde de um respondente (otimista, sem refetch das planilhas). */
export function useSetNpsBrinde(
  projectId: string,
  funnelId: string,
  stageId: string,
  datasetId: string,
) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  const key = ["nps-cross", projectId, funnelId, stageId, datasetId] as const;
  return useMutation({
    mutationFn: (vars: { respondentKey: string; delivered: boolean }) =>
      apiClient<{ ok: boolean }>(`${base(projectId, funnelId, stageId)}/${datasetId}/brinde`, {
        method: "PUT",
        body: JSON.stringify(vars),
      }),
    onMutate: async ({ respondentKey, delivered }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NpsCrossResponse>(key);
      if (prev) {
        qc.setQueryData<NpsCrossResponse>(key, {
          ...prev,
          rows: prev.rows.map((r) => (r.key === respondentKey ? { ...r, brindeDelivered: delivered } : r)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
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
