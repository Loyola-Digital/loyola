"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 38 / Story 38.1 — hooks do Log de Campanha (registro por funil).

const STALE = 30 * 1000;

export interface CampaignLogEntry {
  id: string;
  funnelId: string;
  occurredAt: string;
  evento: string;
  aplicativo: string | null;
  categoria: string | null;
  notes: string | null;
  responsavel: string | null;
  createdBy: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLogFilters {
  days: number;
  evento?: string;
  aplicativo?: string;
  categoria?: string;
  q?: string;
}

export interface CampaignLogEntryInput {
  occurredAt: string; // YYYY-MM-DDTHH:mm (datetime-local) ou ISO
  evento: string;
  aplicativo?: string | null;
  categoria?: string | null;
  notes?: string | null;
  responsavel?: string | null;
}

function buildQuery(filters: CampaignLogFilters): string {
  const p = new URLSearchParams({ days: String(filters.days) });
  if (filters.evento) p.set("evento", filters.evento);
  if (filters.aplicativo) p.set("aplicativo", filters.aplicativo);
  if (filters.categoria) p.set("categoria", filters.categoria);
  if (filters.q) p.set("q", filters.q);
  return p.toString();
}

export function useCampaignLog(
  projectId: string | null,
  funnelId: string | null,
  filters: CampaignLogFilters,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["campaign-log", projectId, funnelId, filters],
    queryFn: () =>
      apiClient<{ entries: CampaignLogEntry[] }>(
        `/api/projects/${projectId}/funnels/${funnelId}/campaign-log?${buildQuery(filters)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE,
  });
}

export function useCreateLogEntry(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CampaignLogEntryInput) =>
      apiClient<CampaignLogEntry>(
        `/api/projects/${projectId}/funnels/${funnelId}/campaign-log`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-log", projectId, funnelId] });
    },
  });
}

export function useUpdateLogEntry(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: Partial<CampaignLogEntryInput> }) =>
      apiClient<CampaignLogEntry>(
        `/api/projects/${projectId}/funnels/${funnelId}/campaign-log/${entryId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-log", projectId, funnelId] });
    },
  });
}

export function useDeleteLogEntry(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiClient<{ ok: boolean }>(
        `/api/projects/${projectId}/funnels/${funnelId}/campaign-log/${entryId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-log", projectId, funnelId] });
    },
  });
}
