"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type UserRole = "copywriter" | "strategist" | "manager" | "admin" | "guest";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "pending" | "blocked";
  /** Aparece nos seletores de pessoa (atribuir PDI, escolher vendedor…). */
  listed: boolean;
  createdAt: string;
}

export function useAdminUsers(status?: string) {
  const apiClient = useApiClient();
  const url = status ? `/api/admin/users?status=${status}` : "/api/admin/users";
  return useQuery({
    queryKey: ["admin-users", status ?? "all"],
    queryFn: () => apiClient<AdminUser[]>(url),
  });
}

export function useUpdateUserStatus() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "active" | "pending" | "blocked" }) =>
      apiClient<{ id: string; status: string }>(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function useSyncUsers() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ total: number; updated: number; errors: string[] }>("/api/admin/sync-users", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

/**
 * Papel e visibilidade nas listas. Um PATCH só pros dois porque a tela edita os
 * dois no mesmo lugar — e o backend aceita qualquer um dos campos isolado.
 */
export function useUpdateUser() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...patch
    }: {
      userId: string;
      role?: UserRole;
      listed?: boolean;
    }) =>
      apiClient<{ id: string; role: string; listed: boolean }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      // Os seletores de pessoa mudam junto — PDI e vendedores leem `listed`.
      queryClient.invalidateQueries({ queryKey: ["pdi"] });
      queryClient.invalidateQueries({ queryKey: ["manual-sale-sellers"] });
    },
  });
}
