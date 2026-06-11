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
  // id/workspaceId do pixel no Switchy — propagados pro create anexar o existente.
  id?: string;
  workspaceId?: number | string | null;
}

// ---- Account pixels (Story 33.7) ----
// Pixels já cadastrados na conta única do Switchy, buscados via GraphQL no
// backend. A conta é global (1 token) e mistura pixels de vários experts, por
// isso a UI mostra title + platform pra escolher os certos por projeto.
export interface SwitchyAccountPixel {
  id: string;
  platform: string;
  value: string;
  title: string;
  workspaceId?: number | string | null;
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
  // Domínio do shortlink escolhido no gerador (ex: links.loyoladigital.com).
  domain?: string;
  channels: SwitchyGenerateChannel[];
  // Story 33.7: links são atrelados ao funil. Implícito pela rota do funil.
  funnelId?: string;
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
  utmTerm: string | null;
  utmContent: string | null;
  checkoutBaseUrl: string;
  domain: string | null;
  shortUrl: string | null;
  fullUrl: string;
  switchyUniq: number | null;
  createdAt: string;
  // Story 33.7: presente quando o link foi gerado dentro de um funil.
  funnelId?: string | null;
}

/** Edição de um link já gerado (destino/UTMs). */
export interface SwitchyUpdateLinkPayload {
  checkoutUrl: string;
  campaign: string;
  medium: string;
  source: string;
  term?: string;
  content?: string;
  channelLabel?: string;
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

export function useSwitchyDomains(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-domains", projectId],
    queryFn: () =>
      apiClient<{ domains: string[] }>(
        `/api/projects/${projectId}/switchy/domains`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.domains,
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

// ---- Account pixels (Story 33.7) ----
// Lista os pixels já cadastrados na conta única do Switchy (via GraphQL no
// backend). Usado pelo config panel pra selecionar pixels em vez de digitá-los.
export function useSwitchyAccountPixels(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["switchy-account-pixels", projectId],
    queryFn: () =>
      apiClient<{ pixels: SwitchyAccountPixel[] }>(
        `/api/projects/${projectId}/switchy/pixels`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.pixels,
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
    onSuccess: (_data, payload) => {
      // Invalida tanto a história geral do projeto quanto a do funil (quando o
      // gerador rodou dentro de um funil — Story 33.7).
      qc.invalidateQueries({ queryKey: ["switchy-history", projectId] });
      if (payload.funnelId) {
        qc.invalidateQueries({
          queryKey: ["switchy-history", projectId, payload.funnelId],
        });
      }
    },
  });
}

/**
 * Histórico de links gerados. Quando `funnelId` é informado (Story 33.7), filtra
 * pelo funil via query param e usa uma queryKey por funil — assim a lista dentro
 * da página do funil mostra só os links daquele funil.
 */
export function useSwitchyHistory(
  projectId: string | null,
  funnelId?: string | null,
) {
  const apiClient = useApiClient();
  const query = funnelId ? `?funnelId=${encodeURIComponent(funnelId)}` : "";
  return useQuery({
    queryKey: funnelId
      ? ["switchy-history", projectId, funnelId]
      : ["switchy-history", projectId],
    queryFn: () =>
      apiClient<{ links: SwitchyHistoryItem[] }>(
        `/api/projects/${projectId}/switchy/links/history${query}`,
      ),
    enabled: !!projectId,
    staleTime: SWITCHY_STALE_TIME,
    select: (data) => data.links,
  });
}

/** Invalida o histórico (geral + do funil quando houver). */
function invalidateSwitchyHistory(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId?: string | null,
) {
  qc.invalidateQueries({ queryKey: ["switchy-history", projectId] });
  if (funnelId) {
    qc.invalidateQueries({ queryKey: ["switchy-history", projectId, funnelId] });
  }
}

export function useUpdateSwitchyHistoryLink(projectId: string, funnelId?: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, ...payload }: { linkId: string } & SwitchyUpdateLinkPayload) =>
      apiClient<{ link: SwitchyHistoryItem }>(
        `/api/projects/${projectId}/switchy/links/history/${linkId}`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => invalidateSwitchyHistory(qc, projectId, funnelId),
  });
}

export function useDeleteSwitchyHistoryLink(projectId: string, funnelId?: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiClient<{ success: true }>(
        `/api/projects/${projectId}/switchy/links/history/${linkId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => invalidateSwitchyHistory(qc, projectId, funnelId),
  });
}
