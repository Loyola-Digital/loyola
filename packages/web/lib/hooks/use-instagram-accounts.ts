"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface InstagramAccount {
  id: string;
  accountName: string;
  instagramUsername: string;
  instagramUserId: string;
  profilePictureUrl: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface AddAccountInput {
  accountName: string;
  accessToken: string;
}

export interface UpdateAccountInput {
  id: string;
  accountName?: string;
  accessToken?: string;
}

// 1.2 — GET /api/instagram/accounts
export function useInstagramAccounts() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiClient<InstagramAccount[]>("/api/instagram/accounts"),
  });
}

// 1.3 — POST /api/instagram/accounts
export function useAddAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddAccountInput) =>
      apiClient<InstagramAccount>("/api/instagram/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
  });
}

// 1.4 — PUT /api/instagram/accounts/:id
export function useUpdateAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateAccountInput) =>
      apiClient<InstagramAccount>(`/api/instagram/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
  });
}

// 1.5 — DELETE /api/instagram/accounts/:id
export function useDeleteAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/instagram/accounts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
  });
}

// Refresh (cache invalidation)
export function useRefreshAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ message: string }>(
        `/api/instagram/accounts/${id}/refresh`,
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
  });
}
