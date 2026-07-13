"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Brief v5 #2 — Custos operacionais da etapa (Evento Presencial).

export const COST_CATEGORIES = [
  { value: "venue", label: "Local (venue)" },
  { value: "staff", label: "Staff" },
  { value: "logistica", label: "Logística" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "marketing", label: "Marketing" },
  { value: "outros", label: "Outros" },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]["value"];

export interface OperationalCost {
  id: string;
  category: CostCategory;
  description: string | null;
  amount: number;
  incurredAt: string | null;
  createdAt: string;
}

export interface OperationalCostsResponse {
  items: OperationalCost[];
  totalCosts: number;
}

export interface CostInput {
  category: CostCategory;
  description?: string | null;
  amount: number;
  incurredAt?: string | null;
}

function basePath(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/operational-costs`;
}

export function useOperationalCosts(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["operational-costs", projectId, funnelId, stageId],
    queryFn: () => apiClient<OperationalCostsResponse>(basePath(projectId, funnelId, stageId)),
    staleTime: 30 * 1000,
  });
}

export function useCreateOperationalCost(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CostInput) =>
      apiClient<OperationalCost>(basePath(projectId, funnelId, stageId), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-costs", projectId, funnelId, stageId] });
    },
  });
}

export function useUpdateOperationalCost(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ costId, ...input }: Partial<CostInput> & { costId: string }) =>
      apiClient<OperationalCost>(`${basePath(projectId, funnelId, stageId)}/${costId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-costs", projectId, funnelId, stageId] });
    },
  });
}

export function useDeleteOperationalCost(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (costId: string) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/${costId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-costs", projectId, funnelId, stageId] });
    },
  });
}
