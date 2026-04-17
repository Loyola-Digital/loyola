"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

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
