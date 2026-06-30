"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 37 — hooks da integração GA4 (Google Analytics Data API).
// Conexão por projeto (refresh_token cifrado no backend + property selecionada).
// O frontend NUNCA renderiza o refresh_token: o GET de conexão devolve só
// { connected, propertyId, propertyName }. Cada etapa configura a página via
// use-funnel-stages (ga4PageFilter); aqui ficam conexão + analytics por etapa.

const STALE = 5 * 60 * 1000;

function projBase(projectId: string) {
  return `/api/projects/${projectId}/ga4`;
}

// ---- Tipos ----

export interface Ga4ConnectionResponse {
  connected: boolean;
  propertyId?: string;
  propertyName?: string | null;
}

export interface Ga4Property {
  propertyId: string;
  displayName: string;
  account: string;
}

export interface Ga4StageDashboard {
  totals: {
    sessions: number;
    users: number;
    engagedSessions: number;
    engagementRate: number;
    conversions: number;
    pageViews: number;
    revenue: number;
  };
  byChannel: Array<{ channel: string; sessions: number; conversions: number }>;
  topSources: Array<{ sourceMedium: string; sessions: number; conversions: number }>;
  topCampaigns: Array<{ campaign: string; sessions: number; conversions: number; revenue: number }>;
  pageFilter: string | null;
  configured: boolean;
}

// ---- Conexão (projeto) ----

// GET /api/projects/:projectId/ga4/connection
export function useGa4Connection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["ga4-connection", projectId],
    queryFn: () => apiClient<Ga4ConnectionResponse>(`${projBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

// PUT /api/projects/:projectId/ga4/connection  body { refreshToken, propertyId, propertyName? }
export function useSetGa4Connection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { refreshToken: string; propertyId: string; propertyName?: string }) =>
      apiClient<Ga4ConnectionResponse>(`${projBase(projectId)}/connection`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ga4-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["ga4-stage-analytics", projectId] });
    },
  });
}

// DELETE /api/projects/:projectId/ga4/connection
export function useDeleteGa4Connection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<Ga4ConnectionResponse>(`${projBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ga4-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["ga4-stage-analytics", projectId] });
    },
  });
}

/**
 * Fluxo OAuth (popup + postMessage, espelha Google Ads). Retorna uma função que:
 * abre o consentimento Google, troca o code e devolve { refreshToken, properties }.
 */
export function useGa4OAuth() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: async (): Promise<{ refreshToken: string; properties: Ga4Property[] }> => {
      const origin = window.location.origin;
      const { url, redirectUri } = await apiClient<{ url: string; redirectUri: string }>(
        `/api/google-analytics/auth/url?origin=${encodeURIComponent(origin)}`,
      );

      const popup = window.open(url, "ga4-oauth", "width=520,height=640");
      if (!popup) throw new Error("Pop-up bloqueado. Libere pop-ups para conectar o GA4.");

      const code = await new Promise<string>((resolve, reject) => {
        const timer = setInterval(() => {
          if (popup.closed) { clearInterval(timer); window.removeEventListener("message", onMsg); reject(new Error("Janela fechada antes de concluir.")); }
        }, 500);
        function onMsg(e: MessageEvent) {
          if (e.origin !== origin || e.data?.type !== "ga4-auth") return;
          clearInterval(timer);
          window.removeEventListener("message", onMsg);
          if (e.data.error) reject(new Error(String(e.data.error)));
          else resolve(String(e.data.code));
        }
        window.addEventListener("message", onMsg);
      });

      return apiClient<{ refreshToken: string; properties: Ga4Property[] }>(
        `/api/google-analytics/auth/callback`,
        { method: "POST", body: JSON.stringify({ code, redirectUri }) },
      );
    },
  });
}

// ---- Analytics por etapa ----

// GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/ga4-analytics?days=N
export function useGa4StageAnalytics(
  projectId: string,
  funnelId: string,
  stageId: string,
  opts: { days: number; enabled: boolean },
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["ga4-stage-analytics", projectId, funnelId, stageId, opts.days],
    queryFn: () =>
      apiClient<Ga4StageDashboard>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/ga4-analytics?days=${opts.days}`,
      ),
    enabled: opts.enabled,
    staleTime: STALE,
  });
}
