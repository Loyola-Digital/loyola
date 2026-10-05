"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { DebriefingConfigGet } from "@/lib/utils/debriefing-config-form";

// Story 49.6 — config do debriefing (rotas da 49.1) e geração (rota da 49.6).
// A lógica que precisa de teste (corpo do PUT, leitura do erro) mora em
// `lib/utils/debriefing-config-form.ts`; aqui só o transporte.

const base = (projectId: string, funnelId: string, stageId: string) =>
  `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/debriefing`;
const chave = (stageId: string) => ["debriefing-config", stageId] as const;

export interface DebriefingGerado {
  id: string;
  html: string;
  alertas: { codigo: string; mensagem: string; quantidade: number }[];
}

export function useDebriefingConfig(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: chave(stageId),
    queryFn: () => apiClient<DebriefingConfigGet>(`${base(projectId, funnelId, stageId)}/config`),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSalvarDebriefingConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: Record<string, unknown>) =>
      apiClient<{ ok: true; validacaoResetada: boolean }>(`${base(projectId, funnelId, stageId)}/config`, {
        method: "PUT",
        body: JSON.stringify(corpo),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(stageId) }),
  });
}

export function useValidarDebriefingConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true; validadoEm: string }>(`${base(projectId, funnelId, stageId)}/config/validate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(stageId) }),
  });
}

export function useGerarDebriefing(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { investimentoOficial: number | null }) =>
      apiClient<DebriefingGerado>(`${base(projectId, funnelId, stageId)}/generate`, {
        method: "POST",
        body: JSON.stringify(input.investimentoOficial === null ? {} : input),
      }),
    // O card novo aparece na lista da etapa (`use-debriefings.ts`).
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debriefings", stageId] }),
  });
}
