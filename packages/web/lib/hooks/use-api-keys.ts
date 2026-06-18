"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revoked: boolean;
}

/** Resposta da criação — `key` (texto puro) só vem aqui, uma única vez. */
export interface CreatedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  key: string;
}

export function useApiKeys() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiClient<ApiKey[]>("/api/api-keys"),
  });
}

export function useCreateApiKey() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, scopes }: { name: string; scopes?: string[] }) =>
      apiClient<CreatedApiKey>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, ...(scopes ? { scopes } : {}) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ id: string; revoked: boolean }>(`/api/api-keys/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
