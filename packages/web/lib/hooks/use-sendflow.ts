"use client";

/**
 * SendFlow — os grupos de WhatsApp da campanha.
 *
 * O resumo lê o SendFlow ao vivo no servidor (MCP), então o staleTime é
 * generoso: trocar de aba não deve custar uma rodada nova de chamadas.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SendflowConnection {
  connected: boolean;
  clientId: string | null;
  updatedAt: string | null;
  /** true = veio da conexão global (o normal), não de uma do projeto. */
  global?: boolean;
}

export interface SendflowGrupo {
  id: string;
  name: string;
  gid: string;
  /** Quantas pessoas estão no grupo. */
  participantes: number;
  cheio: boolean;
  inviteCode: string | null;
}

export interface SendflowDisparo {
  id: string;
  tipo: string;
  quando: string | null;
  sucesso: boolean | null;
  erro: string | null;
}

export type SendflowSummary =
  | {
      semCampanha: true;
      /** Token usado na busca — a tela mostra pra explicar por que não casou. */
      tokenBuscado: string;
      campanhasDisponiveis: { id: string; name: string }[];
    }
  | {
      semCampanha: false;
      campanha: { id: string; name: string };
      grupos: SendflowGrupo[];
      totalParticipantes: number;
      entradas: { total: number; porDia: { date: string; valor: number }[] };
      saidas: { total: number; porDia: { date: string; valor: number }[] };
      cliques: { total: number; porDia: { date: string; valor: number }[] };
      disparos: SendflowDisparo[];
    };

// ---- Conexão GLOBAL (settings) -----------------------------------------
// Uma conta atende todos os experts, então a configuração é única.

const CHAVE_GLOBAL = ["sendflow-connection-global"] as const;

export function useSendflowGlobalConnection() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: CHAVE_GLOBAL,
    queryFn: () => apiClient<SendflowConnection>("/api/settings/sendflow/connection"),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Inicia a conexão: pede a URL de autorização e leva o navegador pra lá.
 *
 * A URL vem por POST autenticado, e não por redirect direto, porque a sessão do
 * Loyola X não acompanha uma navegação pra outro domínio.
 */
export function useConectarSendflow() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ url: string }>("/api/settings/sendflow/authorize-url", { method: "POST" }),
    onSuccess: (r) => {
      if (r?.url) window.location.href = r.url;
    },
  });
}

export function useSaveSendflowGlobalConnection() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clientId: string; clientSecret: string; refreshToken: string }) =>
      apiClient<{ connected: boolean }>("/api/settings/sendflow/connection", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_GLOBAL });
      // O card por funil também depende disto.
      qc.invalidateQueries({ queryKey: ["sendflow-connection"] });
      qc.invalidateQueries({ queryKey: ["sendflow-summary"] });
    },
  });
}

export function useDeleteSendflowGlobalConnection() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ connected: boolean }>("/api/settings/sendflow/connection", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_GLOBAL });
      qc.invalidateQueries({ queryKey: ["sendflow-connection"] });
      qc.invalidateQueries({ queryKey: ["sendflow-summary"] });
    },
  });
}

export function useSendflowConnection(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sendflow-connection", projectId],
    queryFn: () => apiClient<SendflowConnection>(`/api/projects/${projectId}/sendflow/connection`),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveSendflowConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clientId: string; clientSecret: string; refreshToken: string }) =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/sendflow/connection`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sendflow-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["sendflow-summary", projectId] });
    },
  });
}

export function useSendflowSummary(projectId: string | null, funnelId: string | null, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sendflow-summary", projectId, funnelId],
    queryFn: () =>
      apiClient<SendflowSummary>(`/api/projects/${projectId}/funnels/${funnelId}/sendflow/summary`),
    enabled: enabled && !!projectId && !!funnelId,
    staleTime: 5 * 60 * 1000,
    // 409 = projeto sem conexão. Repetir não muda nada.
    retry: false,
  });
}
