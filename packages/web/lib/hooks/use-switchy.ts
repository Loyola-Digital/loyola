"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

export interface SwitchyFolder {
  id: number;
  name: string;
  order: number;
  type: string;
}

export interface SwitchyLink {
  uniq: number;
  id: string;
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  clicks: number;
  createdDate: string;
  folderId: number | null;
  tags: string[];
  pixels: { id: string; title: string; value: string; platform: string }[];
  name: string | null;
  note: string | null;
  image: string | null;
  favicon: string | null;
}

// ---- Settings (Story 33.4) ----
export interface SwitchyPixel {
  platform: "facebook" | "gtm";
  value: string;
  title: string;
}

export interface SwitchySettings {
  pixels: SwitchyPixel[];
  showGdpr: boolean;
  defaultUtmTerm: string | null;
  defaultUtmContent: string | null;
}

// ---- Presets (Story 33.4) ----
export interface SwitchyPreset {
  id: string;
  label: string;
  utmMedium: string;
  utmSource: string;
  sortOrder: number;
  enabled: boolean;
}

// ---- Generator / History (Story 33.5) ----
export interface SwitchyGenerateChannel {
  label: string;
  medium: string;
  source: string;
}

export interface SwitchyGeneratePayload {
  checkoutUrl: string;
  folderId: string;
  folderName: string;
  campaign: string;
  term?: string;
  content?: string;
  channels: SwitchyGenerateChannel[];
}

export interface SwitchyGenerateResult {
  label: string;
  medium: string;
  source: string;
  fullUrl: string;
  shortUrl: string | null;
  switchyLinkId: string | null;
  error?: string;
}

export interface SwitchyHistoryItem {
  id: string;
  channelLabel: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  shortUrl: string | null;
  fullUrl: string;
  createdAt: string;
}

// ============================================================
// HOOKS
// ============================================================

const SWITCHY_STALE_TIME = 5 * 60 * 1000;

export function useSwitchyFolders(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-folders", projectId],
    queryFn: () =>
      apiClient<{ folders: SwitchyFolder[] }>(
        `/api/projects/${projectId}/switchy/folders`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.folders,
  });
}

export function useSwitchyLinks(
  projectId: string | null,
  folderId: number | null,
) {
  const apiClient = useApiClient();
  const query = folderId ? `?folderId=${folderId}` : "";
  return useQuery({
    queryKey: ["switchy-links", projectId, folderId],
    queryFn: () =>
      apiClient<{ links: SwitchyLink[] }>(
        `/api/projects/${projectId}/switchy/links${query}`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.links,
  });
}

// ============================================================
// SETTINGS HOOKS (Story 33.4)
// Endpoints sob /switchy/ na API; rota do front é /projects/:id/switch.
// ============================================================

export function useSwitchySettings(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-settings", projectId],
    queryFn: () =>
      apiClient<SwitchySettings>(
        `/api/projects/${projectId}/switchy/settings`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
  });
}

export function useSetSwitchySettings(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SwitchySettings) =>
      apiClient<SwitchySettings>(`/api/projects/${projectId}/switchy/settings`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["switchy-settings", projectId] });
    },
  });
}

// ============================================================
// PRESETS HOOKS (Story 33.4)
// ============================================================

export function useSwitchyPresets(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-presets", projectId],
    queryFn: () =>
      apiClient<{ presets: SwitchyPreset[] }>(
        `/api/projects/${projectId}/switchy/presets`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.presets,
  });
}

export function useCreateSwitchyPreset(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { label: string; utmMedium: string; utmSource: string }) =>
      apiClient<SwitchyPreset>(`/api/projects/${projectId}/switchy/presets`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["switchy-presets", projectId] });
    },
  });
}

export function useUpdateSwitchyPreset(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      presetId,
      ...data
    }: {
      presetId: string;
      label?: string;
      utmMedium?: string;
      utmSource?: string;
      enabled?: boolean;
    }) =>
      apiClient<SwitchyPreset>(
        `/api/projects/${projectId}/switchy/presets/${presetId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["switchy-presets", projectId] });
    },
  });
}

export function useDeleteSwitchyPreset(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) =>
      apiClient<void>(
        `/api/projects/${projectId}/switchy/presets/${presetId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["switchy-presets", projectId] });
    },
  });
}

// ============================================================
// GENERATOR + HISTORY HOOKS (Story 33.5)
// ============================================================

export function useGenerateSwitchyLinks(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SwitchyGeneratePayload) =>
      apiClient<{ results: SwitchyGenerateResult[] }>(
        `/api/projects/${projectId}/switchy/generate`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["switchy-history", projectId] });
    },
  });
}

export function useSwitchyHistory(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-history", projectId],
    queryFn: () =>
      apiClient<{ links: SwitchyHistoryItem[] }>(
        `/api/projects/${projectId}/switchy/links/history`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.links,
  });
}
