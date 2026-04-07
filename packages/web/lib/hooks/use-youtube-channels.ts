"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface YouTubeChannel {
  id: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  projects: { projectId: string; projectName: string }[];
}

export interface YouTubeChannelInfo {
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
}

export function useYouTubeChannels() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["youtube-channels"],
    queryFn: () => apiClient<YouTubeChannel[]>("/api/youtube-channels"),
  });
}

export function useDeleteYouTubeChannel() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/api/youtube-channels/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["youtube-channels"] }); },
  });
}

export function useLinkYouTubeProject() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, projectId }: { channelId: string; projectId: string }) =>
      apiClient(`/api/youtube-channels/${channelId}/projects/${projectId}`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["youtube-channels"] }); },
  });
}

export function useUnlinkYouTubeProject() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, projectId }: { channelId: string; projectId: string }) =>
      apiClient(`/api/youtube-channels/${channelId}/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["youtube-channels"] }); },
  });
}

// OAuth
export function useYouTubeAuthUrl() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: () => apiClient<{ url: string; redirectUri: string }>(`/api/youtube-channels/auth/url?origin=${encodeURIComponent(window.location.origin)}`),
  });
}

export function useYouTubeAuthCallback() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: { code: string; redirectUri: string }) =>
      apiClient<{ refreshToken: string; channels: YouTubeChannelInfo[] }>("/api/youtube-channels/auth/callback", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useYouTubeConnect() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { channelId: string; channelName: string; thumbnailUrl: string | null; subscriberCount: number; refreshToken: string }) =>
      apiClient("/api/youtube-channels/auth/connect", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["youtube-channels"] }); },
  });
}

// Analytics
export interface YouTubeOverview {
  totalViews: number;
  watchTimeHours: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscribers: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgRetention: number;
}

export interface YouTubeDailyInsight {
  date: string;
  views: number;
  watchTimeMinutes: number;
  subscribersGained: number;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export function useYouTubeOverview(channelDbId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["youtube-overview", channelDbId, days],
    queryFn: () => apiClient<YouTubeOverview>(`/api/youtube-channels/${channelDbId}/overview?days=${days}`),
    enabled: !!channelDbId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useYouTubeDaily(channelDbId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["youtube-daily", channelDbId, days],
    queryFn: () => apiClient<YouTubeDailyInsight[]>(`/api/youtube-channels/${channelDbId}/daily?days=${days}`),
    enabled: !!channelDbId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useYouTubeVideos(channelDbId: string | null, limit: number = 20) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["youtube-videos", channelDbId, limit],
    queryFn: () => apiClient<{ videos: YouTubeVideo[] }>(`/api/youtube-channels/${channelDbId}/videos?limit=${limit}`),
    enabled: !!channelDbId,
    staleTime: 30 * 60 * 1000,
  });
}
