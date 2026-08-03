"use client";

/**
 * Swipe Files — hooks da biblioteca de referências.
 *
 * Upload não passa pela API: pede uma URL assinada, envia o arquivo direto pro
 * bucket e só então cria o registro com a URL final. Isso contorna o teto de
 * 10MB do multipart da API e não ocupa memória do container.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AssetKind = "image" | "video" | "link";

export interface SwipeFile {
  id: string;
  title: string;
  notes: string | null;
  assetKind: AssetKind;
  fileUrl: string | null;
  fileMime: string | null;
  width: number | null;
  height: number | null;
  sourceUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  brand: string | null;
  niche: string | null;
  platform: string | null;
  format: string | null;
  tags: string[];
  isFavorite: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface SwipeFacets {
  platform: string[];
  format: string[];
  niche: string[];
  brand: string[];
  tags: string[];
}

export interface SwipeFilters {
  q?: string;
  platform?: string;
  format?: string;
  niche?: string;
  brand?: string;
  tag?: string;
  kind?: AssetKind;
  favorites?: boolean;
}

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const BASE = "/api/swipe-files";

export function useSwipeFiles(filters: SwipeFilters) {
  const apiClient = useApiClient();
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.platform) qs.set("platform", filters.platform);
  if (filters.format) qs.set("format", filters.format);
  if (filters.niche) qs.set("niche", filters.niche);
  if (filters.brand) qs.set("brand", filters.brand);
  if (filters.tag) qs.set("tag", filters.tag);
  if (filters.kind) qs.set("kind", filters.kind);
  if (filters.favorites) qs.set("favorites", "1");
  const suffix = qs.toString() ? `?${qs}` : "";

  return useQuery({
    queryKey: ["swipe-files", suffix],
    queryFn: () =>
      apiClient<{ items: SwipeFile[]; facets: SwipeFacets; storageReady: boolean }>(
        `${BASE}${suffix}`,
      ),
    // Segura o resultado anterior enquanto refiltra: sem isso o grid pisca a
    // cada tecla digitada na busca.
    placeholderData: (prev) => prev,
  });
}

export function useLinkPreview() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiClient<LinkPreview>(`${BASE}/preview`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
  });
}

export interface CreateSwipeInput {
  title: string;
  assetKind: AssetKind;
  notes?: string;
  fileUrl?: string;
  fileKey?: string;
  fileMime?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  sourceUrl?: string;
  brand?: string;
  niche?: string;
  platform?: string;
  format?: string;
  tags?: string[];
}

export function useCreateSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSwipeInput) =>
      apiClient<{ id: string }>(BASE, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

export function useUpdateSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateSwipeInput> & { isFavorite?: boolean } }) =>
      apiClient<{ ok: boolean }>(`${BASE}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

export function useDeleteSwipeFile() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<{ ok: boolean }>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swipe-files"] }),
  });
}

/**
 * Sobe o arquivo direto pro bucket e devolve a URL pública.
 *
 * Três passos: pede a URL assinada → PUT no bucket → devolve a URL definitiva
 * pra quem chamou criar o registro. O `onProgress` usa XHR porque `fetch` não
 * expõe progresso de upload, e um vídeo de 100MB sem barra é uma tela travada.
 */
export function useUploadToBucket() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (pct: number) => void;
    }) => {
      const { uploadUrl, publicUrl, key } = await apiClient<{
        uploadUrl: string;
        publicUrl: string;
        key: string;
      }>(`${BASE}/presign`, {
        method: "POST",
        body: JSON.stringify({ mime: file.type, sizeBytes: file.size }),
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`O bucket recusou o upload (${xhr.status}).`));
        xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo."));
        xhr.send(file);
      });

      return { publicUrl, key };
    },
  });
}

/** Lê dimensões antes do upload — o card reserva a proporção e o grid não salta. */
export function readMediaDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);

    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        cleanup();
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        cleanup();
        resolve(null);
      };
      img.src = url;
      return;
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        cleanup();
        resolve({ width: v.videoWidth, height: v.videoHeight });
      };
      v.onerror = () => {
        cleanup();
        resolve(null);
      };
      v.src = url;
      return;
    }
    cleanup();
    resolve(null);
  });
}
