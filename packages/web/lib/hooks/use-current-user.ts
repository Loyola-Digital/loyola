"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "pending" | "blocked";
  avatarUrl: string | null;
}

export function useCurrentUser() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient<CurrentUser>("/api/me"),
    retry: false,
    staleTime: 60 * 1000,
  });
}
