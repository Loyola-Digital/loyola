"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

// ============================================================
// TYPES
// ============================================================

export interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  reach?: number | null;
  saved?: number | null;
  /** (likes + comments + saves + shares) / reach × 100, ou null se reach indisponível */
  engagement_rate?: number | null;
  /** Qualidade de vídeo (reels): plays (views), shares e tempo médio assistido (ms). */
  views?: number | null;
  shares?: number | null;
  avg_watch_time_ms?: number | null;
  /** Link público do post. */
  permalink?: string;
  /** FEED | REELS | STORY — separa Reels de foto/carrossel melhor que `media_type`. */
  media_product_type?: string;
  /**
   * Seguidores gerados pelo post. A Meta só entrega em foto/carrossel; em
   * Reels é o número digitado do painel do Instagram (ver `follows_fonte`).
   */
  follows?: number | null;
  /** `manual` = digitado por alguém do time; `meta` = veio da API. */
  follows_fonte?: "meta" | "manual" | null;
  /** % das views do Reels que pularam nos 3 primeiros segundos (`reels_skip_rate`). Só Reels. */
  skip_rate?: number | null;
}

export interface InsightValue {
  value: number | Record<string, unknown>;
  end_time?: string;
}

export interface InsightEntry {
  name: string;
  period: string;
  values: InsightValue[];
  total_value?: { value: number | Record<string, unknown>; breakdowns?: unknown[] };
  title: string;
  description: string;
  id: string;
}

export interface AccountInsightsResponse {
  period: string;
  since: string;
  until: string;
  data: InsightEntry[];
}

export interface MediaListResponse {
  data: InstagramMedia[];
  nextCursor?: string;
}

export interface StoryMedia {
  id: string;
  media_type: string;
  media_url?: string;
  timestamp: string;
  insights?: InsightEntry[];
}

// ============================================================
// STALE TIMES
// ============================================================

const STALE = {
  profile: 5 * 60 * 1000,        // 5 min
  insights: 30 * 60 * 1000,      // 30 min
  media: 15 * 60 * 1000,         // 15 min
  demographics: 60 * 60 * 1000,  // 1 hour
  stories: 5 * 60 * 1000,        // 5 min
  reels: 15 * 60 * 1000,         // 15 min
};

// ============================================================
// HOOKS
// ============================================================

export function useInstagramProfile(accountId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-profile", accountId],
    queryFn: () => apiClient<InstagramProfile>(`/api/instagram/accounts/${accountId}/profile`),
    enabled: !!accountId,
    staleTime: STALE.profile,
  });
}

export function useInstagramInsights(
  accountId: string | null,
  period: string,
  since?: number,
  until?: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-insights", accountId, period, since, until],
    queryFn: () => {
      const params = new URLSearchParams({ period });
      if (since) params.set("since", String(since));
      if (until) params.set("until", String(until));
      return apiClient<AccountInsightsResponse>(
        `/api/instagram/accounts/${accountId}/insights?${params}`,
      );
    },
    enabled: !!accountId,
    staleTime: STALE.insights,
  });
}

export function useInstagramMedia(accountId: string | null, limit = 25) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-media", accountId, limit],
    queryFn: () =>
      apiClient<MediaListResponse>(
        `/api/instagram/accounts/${accountId}/media?limit=${limit}`,
      ),
    enabled: !!accountId,
    staleTime: STALE.media,
  });
}

export function useInstagramDemographics(accountId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-demographics", accountId],
    queryFn: () =>
      apiClient<InsightEntry[]>(`/api/instagram/accounts/${accountId}/demographics`),
    enabled: !!accountId,
    staleTime: STALE.demographics,
  });
}

export function useInstagramStories(accountId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-stories", accountId],
    queryFn: () =>
      apiClient<StoryMedia[]>(`/api/instagram/accounts/${accountId}/stories`),
    enabled: !!accountId,
    staleTime: STALE.stories,
  });
}

export function useInstagramReels(accountId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-reels", accountId],
    queryFn: () =>
      apiClient<MediaListResponse>(`/api/instagram/accounts/${accountId}/reels`),
    enabled: !!accountId,
    staleTime: STALE.reels,
  });
}

export function useRefreshInstagram(accountId: string | null) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ message: string }>(`/api/instagram/accounts/${accountId}/refresh`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-profile", accountId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-insights", accountId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-media", accountId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-demographics", accountId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-stories", accountId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-reels", accountId] });
    },
  });
}

// ============================================================
// ANÁLISE DO PERÍODO COM IA
// ============================================================

export interface DestaqueDaIa {
  post_id: string;
  por_que: string;
  fatores: string[];
}

export interface AnaliseComIa {
  analise: {
    insights: { titulo: string; explicacao: string }[];
    melhores: DestaqueDaIa[];
    piores: DestaqueDaIa[];
    padroes: string[];
  };
  geradoEm: string;
  posts: { id: string; titulo: string; permalink: string | null; formato: string }[];
}

/** A última análise guardada para o período — não gera nada. */
export function useAnaliseComIa(accountId: string | null, since: number, until: number) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-analise-ia", accountId, since, until],
    queryFn: () =>
      apiClient<{ resultado: AnaliseComIa | null }>(
        `/api/instagram/accounts/${accountId}/analise-ia?since=${since}&until=${until}`,
      ),
    enabled: !!accountId,
    staleTime: STALE.insights,
  });
}

/** Gera (ou refaz) a análise. Leva de 30 a 60 segundos. */
export function useGerarAnaliseComIa(accountId: string | null, since: number, until: number) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ resultado: AnaliseComIa }>(
        `/api/instagram/accounts/${accountId}/analise-ia?since=${since}&until=${until}`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      qc.setQueryData(["instagram-analise-ia", accountId, since, until], r);
    },
  });
}

/**
 * Grava os seguidores que um post trouxe, digitados do painel do Instagram.
 *
 * `null` apaga. Invalida a lista de posts para a tabela, a conversão em
 * seguidor e a média do perfil recalcularem com o número novo.
 */
export function useSalvarSeguidoresDoPost(accountId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, seguidores }: { mediaId: string; seguidores: number | null }) =>
      apiClient<{ seguidores: number | null }>(
        `/api/instagram/accounts/${accountId}/posts/${mediaId}/seguidores`,
        { method: "PUT", body: JSON.stringify({ seguidores }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram-media", accountId] });
    },
  });
}

// ---- Análise de UM post ---------------------------------------------------

export interface AnaliseDoPost {
  veredito: "bom" | "mediano" | "ruim";
  por_que: string;
  fatores: { nome: string; leitura: string }[];
  recomendacoes: string[];
}

/** A análise guardada deste post — não gera nada. */
export function useAnaliseDoPost(accountId: string | null, mediaId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-analise-post", accountId, mediaId],
    queryFn: () =>
      apiClient<{ analise: AnaliseDoPost | null; geradoEm: string | null }>(
        `/api/instagram/accounts/${accountId}/posts/${mediaId}/analise`,
      ),
    enabled: !!accountId && !!mediaId,
    staleTime: 60 * 60 * 1000,
  });
}

/** Gera (ou refaz) a análise do post. Fica guardada no banco. */
export function useGerarAnaliseDoPost(accountId: string | null, mediaId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ analise: AnaliseDoPost; geradoEm: string }>(
        `/api/instagram/accounts/${accountId}/posts/${mediaId}/analise`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      qc.setQueryData(["instagram-analise-post", accountId, mediaId], r);
    },
  });
}
