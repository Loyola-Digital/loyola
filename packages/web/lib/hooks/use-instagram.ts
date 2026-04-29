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
  /** (likes + comments + saves) / reach × 100, ou null se reach indisponível */
  engagement_rate?: number | null;
  /** Seguidores ganhos via este post (Graph API limita: FEED retorna; Reels/Video/Stories costumam vir null). */
  follows?: number | null;
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
