"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SellerAlias {
  id: string;
  projectId: string;
  canonicalName: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SellerAliasInput {
  canonicalName: string;
  aliases: string[];
}

function aliasesKey(projectId: string | null) {
  return ["seller-aliases", projectId] as const;
}

export function useSellerAliases(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: aliasesKey(projectId),
    queryFn: () => apiClient<SellerAlias[]>(`/api/projects/${projectId}/seller-aliases`),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

export function useCreateSellerAlias(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SellerAliasInput) =>
      apiClient<SellerAlias>(`/api/projects/${projectId}/seller-aliases`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useUpdateSellerAlias(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SellerAliasInput> }) =>
      apiClient<SellerAlias>(`/api/projects/${projectId}/seller-aliases/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

export function useDeleteSellerAlias(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: true }>(`/api/projects/${projectId}/seller-aliases/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidate(queryClient, projectId),
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: aliasesKey(projectId) });
  // O breakdown depende dos aliases — força refetch pra refletir o merge.
  queryClient.invalidateQueries({ queryKey: ["sellers-breakdown"] });
}
