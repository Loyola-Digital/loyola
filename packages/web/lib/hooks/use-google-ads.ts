"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface GoogleAdsAccount {
  id: string;
  accountName: string;
  customerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  projects: { projectId: string; projectName: string }[];
}

export interface CreateGoogleAdsAccountInput {
  accountName: string;
  customerId: string;
  developerToken: string;
  refreshToken: string;
}

export function useGoogleAdsAccounts() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-ads-accounts"],
    queryFn: () => apiClient<GoogleAdsAccount[]>("/api/google-ads/accounts"),
  });
}

export function useCreateGoogleAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGoogleAdsAccountInput) =>
      apiClient<GoogleAdsAccount>("/api/google-ads/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-ads-accounts"] });
    },
  });
}

export function useDeleteGoogleAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/google-ads/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-ads-accounts"] });
    },
  });
}

export function useLinkGoogleAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/google-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-ads-accounts"] });
    },
  });
}

export function useUnlinkGoogleAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/google-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-ads-accounts"] });
    },
  });
}
