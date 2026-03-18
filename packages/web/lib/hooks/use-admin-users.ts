"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "pending" | "blocked";
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
