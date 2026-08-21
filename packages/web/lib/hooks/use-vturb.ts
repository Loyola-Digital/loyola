"use client";

/**
 * VTurb Analytics — hooks.
 *
 * O `overview` traz números, série diária, curva de retenção e cliques numa
 * chamada só. O agrupamento é no servidor de propósito: o VTurb limita
 * requisições por minuto (60 no plano Basic) e quatro chamadas por aba aberta
 * queimariam a cota do cliente.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface VturbPlayer {
  id: string;
  name: string;
  pitch_time: number | null;
  duration: number | null;
  created_at: string;
}

/** Player já vinculado a uma etapa (registro nosso, não do VTurb). */
export interface VturbLink {
  id: string;
  playerId: string;
  playerName: string;
  duration: number | null;
  pitchTime: number | null;
}

export interface VturbStats {
  total_viewed: number;
  total_viewed_device_uniq: number;
  total_started: number;
  total_started_device_uniq: number;
  total_finished: number;
  engagement_rate: number;
  total_clicked: number;
  total_over_pitch: number;
  total_under_pitch: number;
  over_pitch_rate: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_amount_brl: number;
  total_amount_usd: number;
  play_rate: number;
}

export interface VturbOverview {
  player: {
    id: string;
    playerId: string;
    name: string;
    duration: number | null;
    pitchTime: number | null;
  };
  range: { startDate: string; endDate: string; timezone: string };
  stats: VturbStats;
  /**
   * Os totais foram somados do diário porque o agregado do VTurb veio vazio.
   * As taxas, nesse caso, são derivadas dos contadores e podem diferir alguns
   * pontos das que o VTurb calcularia — ele usa bases próprias por sessão.
   */
  statsReconstruidos?: boolean;
  byDay: (VturbStats & { date_key: string })[];
  /** null quando a VSL não tem duração cadastrada (a API exige pra calcular). */
  engagement: {
    average_watched_time: number;
    engagement_rate: number;
    grouped_timed: { timed: number; total_users: number }[];
  } | null;
  clicks: { timed: number; total_users: number }[];
}

export function useVturbConnection(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["vturb-connection", projectId],
    queryFn: () =>
      apiClient<{ connected: boolean; timezone: string | null; connectedAt: string | null }>(
        `/api/projects/${projectId}/vturb/connection`,
      ),
    enabled: !!projectId,
  });
}

export function useSaveVturbConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { apiToken: string; timezone?: string }) =>
      apiClient<{ ok: boolean }>(`/api/projects/${projectId}/vturb/connection`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vturb-connection", projectId] }),
  });
}

/** VSLs da conta VTurb — só busca quando o picker abre (custa cota). */
export function useVturbPlayers(projectId: string | null, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["vturb-players", projectId],
    queryFn: () => apiClient<{ players: VturbPlayer[] }>(`/api/projects/${projectId}/vturb/players`),
    enabled: !!projectId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVturbStagePlayers(projectId: string | null, stageId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["vturb-stage-players", projectId, stageId],
    queryFn: () =>
      apiClient<{ players: VturbLink[] }>(
        `/api/projects/${projectId}/stages/${stageId}/vturb/players`,
      ),
    enabled: !!projectId && !!stageId,
  });
}

export function useLinkVturbPlayer(projectId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      playerId: string;
      playerName: string;
      duration?: number;
      pitchTime?: number;
    }) =>
      apiClient<{ id: string }>(`/api/projects/${projectId}/stages/${stageId}/vturb/players`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vturb-stage-players", projectId, stageId] }),
  });
}

export function useUnlinkVturbPlayer(projectId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: boolean }>(
        `/api/projects/${projectId}/stages/${stageId}/vturb/players/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vturb-stage-players", projectId, stageId] }),
  });
}

export function useVturbOverview(
  projectId: string | null,
  stageId: string | null,
  linkId: string | null,
  range: { startDate: string; endDate: string },
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["vturb-overview", projectId, stageId, linkId, range.startDate, range.endDate],
    queryFn: () =>
      apiClient<VturbOverview>(
        `/api/projects/${projectId}/stages/${stageId}/vturb/players/${linkId}/overview` +
          `?startDate=${range.startDate}&endDate=${range.endDate}`,
      ),
    enabled: !!projectId && !!stageId && !!linkId,
    staleTime: 2 * 60 * 1000,
    // Segura o render anterior ao trocar de período — sem piscar skeleton.
    placeholderData: (prev) => prev,
  });
}

// ============================================================
// Story 29.41 — cadeia de conversão medida, para a aba Análise MVP.
// ============================================================

/** Taxa medida. `valor: null` significa AUSENTE, nunca zero. */
export interface TaxaMedida {
  valor: number | null;
  motivo?: string;
  numerador: number;
  denominador: number;
}

export interface VturbChain {
  player: {
    id: string;
    playerId: string;
    name: string;
    duration: number | null;
    pitchTime: number | null;
  };
  cadeia: {
    playRate: TaxaMedida;
    pitchRate: TaxaMedida;
    convPostPitchDenominador: number;
  };
  proveniencia: {
    source: string;
    windowStart: string;
    windowEnd: string;
    timezone: string;
  };
  brutos: { viewedUniq: number; startedUniq: number; overPitch: number };
}

/**
 * Story 29.41 (AC3, AC7) — a cadeia medida do funil perpétuo.
 *
 * Uma consulta por (funil, janela). O `staleTime` de 2min existe pelo rate
 * limit do VTurb (60/min no Basic), que já derrubou a integração uma vez.
 *
 * 404 com `code: NO_PLAYER` não é falha: é o estado normal de um funil sem VSL
 * vinculada, e a aba usa isso para oferecer o seletor de player. Por isso
 * `retry: false` — insistir num 404 esperado só queima cota.
 */
export function useVturbChain(
  projectId: string | null,
  funnelId: string | null,
  range: { startDate: string; endDate: string } | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["vturb-chain", projectId, funnelId, range?.startDate, range?.endDate],
    queryFn: () =>
      apiClient<VturbChain>(
        `/api/projects/${projectId}/funnels/${funnelId}/vturb/chain` +
          `?startDate=${range!.startDate}&endDate=${range!.endDate}`,
      ),
    enabled: !!projectId && !!funnelId && !!range?.startDate && !!range?.endDate,
    staleTime: 2 * 60 * 1000,
    retry: false,
    placeholderData: (prev) => prev,
  });
}
