"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

// Epic 37 — hooks da aba global Debriefing (Story 37.1).
// Lista NÃO traz o html (payload leve); detalhe traz. Upload de arquivo usa
// fetch direto com FormData (o api-client força Content-Type: application/json
// quando há body, o que quebraria o boundary do multipart — mesmo racional do
// upload do chat em chat-input.tsx). JSON/DELETE usam o apiClient normal.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const STALE = 60 * 1000;

// ---- Tipos (espelham routes/debriefings.ts) ----

export interface DebriefingListItem {
  id: string;
  campaignName: string;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** nome de quem editou por último — null se nunca editado */
  editorName: string | null;
  commentCount: number;
}

export interface DebriefingDetail {
  id: string;
  campaignName: string;
  html: string;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorAvatarUrl: string | null;
  editorName: string | null;
}

export interface DebriefingComment {
  id: string;
  text: string;
  createdAt: string;
  userName: string;
  userAvatarUrl: string | null;
  /** true quando o comentário é do usuário logado (computado no backend) */
  mine: boolean;
}

// ---- Upload multipart (fetch direto — ver nota no topo) ----

async function uploadDebriefing(
  token: string | null,
  method: "POST" | "PUT",
  path: string,
  fields: { campaignName?: string; file: File }
): Promise<{ id?: string }> {
  const formData = new FormData();
  if (fields.campaignName) formData.append("campaignName", fields.campaignName);
  formData.append("file", fields.file);

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as { id?: string };
}

// ---- Queries ----

// GET /api/debriefings -> { debriefings }
export function useDebriefings() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["debriefings"],
    queryFn: () =>
      apiClient<{ debriefings: DebriefingListItem[] }>("/api/debriefings"),
    staleTime: STALE,
  });
}

// GET /api/debriefings/:id -> DebriefingDetail
export function useDebriefing(id: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["debriefing", id],
    queryFn: () => apiClient<DebriefingDetail>(`/api/debriefings/${id}`),
    staleTime: STALE,
  });
}

// GET /api/debriefings/:id/comments -> { comments }
export function useDebriefingComments(id: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["debriefing-comments", id],
    queryFn: () =>
      apiClient<{ comments: DebriefingComment[] }>(
        `/api/debriefings/${id}/comments`
      ),
    staleTime: 30 * 1000,
  });
}

// ---- Mutations ----

// POST /api/debriefings (multipart: campaignName + file)
export function useCreateDebriefing() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { campaignName: string; file: File }) =>
      uploadDebriefing(await getToken(), "POST", "/api/debriefings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debriefings"] });
    },
  });
}

// PUT /api/debriefings/:id — com file → multipart; sem file → JSON
export function useUpdateDebriefing(id: string) {
  const { getToken } = useAuth();
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      campaignName?: string;
      html?: string;
      file?: File | null;
    }) => {
      if (data.file) {
        return uploadDebriefing(await getToken(), "PUT", `/api/debriefings/${id}`, {
          campaignName: data.campaignName,
          file: data.file,
        });
      }
      return apiClient<{ ok: boolean }>(`/api/debriefings/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          campaignName: data.campaignName,
          html: data.html,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debriefings"] });
      qc.invalidateQueries({ queryKey: ["debriefing", id] });
    },
  });
}

// DELETE /api/debriefings/:id
export function useDeleteDebriefing() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: boolean }>(`/api/debriefings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debriefings"] });
    },
  });
}

// POST /api/debriefings/:id/comments
export function useAddDebriefingComment(id: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      apiClient<{ id: string }>(`/api/debriefings/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debriefing-comments", id] });
      qc.invalidateQueries({ queryKey: ["debriefings"] });
    },
  });
}

// DELETE /api/debriefings/:id/comments/:commentId
export function useDeleteDebriefingComment(id: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiClient<{ ok: boolean }>(
        `/api/debriefings/${id}/comments/${commentId}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debriefing-comments", id] });
      qc.invalidateQueries({ queryKey: ["debriefings"] });
    },
  });
}
