"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface MetaAdsAccount {
  id: string;
  accountName: string;
  metaAccountId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  projects: { projectId: string; projectName: string }[];
}

export interface CreateMetaAdsAccountInput {
  accountName: string;
  metaAccountId: string;
  accessToken: string;
}

export function useMetaAdsAccounts() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-accounts"],
    queryFn: () => apiClient<MetaAdsAccount[]>("/api/meta-ads/accounts"),
  });
}

export function useCreateMetaAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMetaAdsAccountInput) =>
      apiClient<MetaAdsAccount>("/api/meta-ads/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useDeleteMetaAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/meta-ads/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useLinkMetaAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/meta-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useUnlinkMetaAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/meta-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}
