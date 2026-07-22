"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 40 / Story 40.1 — hooks da etapa Comercial (CRM kanban de compradores).

export interface CrmProduct {
  produto: string;
  valor: number;
  dataVenda: string | null;
  fonte: string;
}

export interface CrmCard {
  id: string;
  columnId: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  products: CrmProduct[];
  totalValue: number;
  firstPurchaseAt: string | null;
  notes: string | null;
  assigneeName: string | null;
  /** Rastreio de ligação: atendeu | nao_atendeu | null. */
  callStatus: "atendeu" | "nao_atendeu" | null;
  /** "Liguei X vezes". */
  callCount: number;
  /** Perfil hot/cold do lead (utm_term da venda). null = sem track. */
  temperature: "hot" | "cold" | null;
  /** Última ação manual (mover no kanban / editar card). null = sem ação ainda. */
  lastActivityAt: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface CrmColumn {
  id: string;
  name: string;
  sortOrder: number;
  isTerminal: boolean;
}

export interface CrmBoard {
  configured: boolean;
  sourceStageIds: string[];
  columns: CrmColumn[];
  cards: CrmCard[];
}

export interface CrmSyncResult {
  configured: boolean;
  created: number;
  updated: number;
  skippedNoEmail: number;
  totalBuyers?: number;
}

export interface CrmCardSurvey {
  matched: boolean;
  matchedBy?: "email" | "phone";
  answers: { label: string; answer: string }[];
}

function basePath(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/crm`;
}

function boardKey(projectId: string, funnelId: string, stageId: string) {
  return ["crm-board", projectId, funnelId, stageId] as const;
}

export function useCrmBoard(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: boardKey(projectId, funnelId, stageId),
    queryFn: () => apiClient<CrmBoard>(basePath(projectId, funnelId, stageId)),
    staleTime: 30 * 1000,
  });
}

export function useSaveCrmConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceStageIds: string[]) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/config`, {
        method: "PUT",
        body: JSON.stringify({ sourceStageIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useCrmSync(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<CrmSyncResult>(`${basePath(projectId, funnelId, stageId)}/sync`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (r) => {
      if (r.created > 0 || r.updated > 0) {
        qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) });
      }
    },
  });
}

export function useCreateCrmColumn(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; isTerminal?: boolean }) =>
      apiClient<CrmColumn>(`${basePath(projectId, funnelId, stageId)}/columns`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useUpdateCrmColumn(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, input }: { columnId: string; input: { name?: string; isTerminal?: boolean } }) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/columns/${columnId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useDeleteCrmColumn(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/columns/${columnId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useReorderCrmColumns(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnIds: string[]) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/columns-reorder`, {
        method: "PATCH",
        body: JSON.stringify({ columnIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useUpdateCrmCard(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      input,
    }: {
      cardId: string;
      input: {
        columnId?: string;
        sortOrder?: number;
        notes?: string | null;
        assigneeName?: string | null;
        callStatus?: "atendeu" | "nao_atendeu" | null;
        callCount?: number;
      };
    }) =>
      apiClient<CrmCard>(`${basePath(projectId, funnelId, stageId)}/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    // Move de card é otimista na view; aqui só garante consistência final.
    onSettled: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useDeleteCrmCard(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) =>
      apiClient<{ ok: boolean }>(`${basePath(projectId, funnelId, stageId)}/cards/${cardId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(projectId, funnelId, stageId) }),
  });
}

export function useCrmCardSurvey(
  projectId: string,
  funnelId: string,
  stageId: string,
  cardId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["crm-card-survey", projectId, funnelId, stageId, cardId],
    queryFn: () =>
      apiClient<CrmCardSurvey>(`${basePath(projectId, funnelId, stageId)}/cards/${cardId}/survey`),
    enabled: !!cardId,
    staleTime: 5 * 60 * 1000,
  });
}
