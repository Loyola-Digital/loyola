"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { MindDetail } from "@loyola-x/shared";

export function useMind(mindId: string) {
  const apiClient = useApiClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["mind", mindId],
    queryFn: () => apiClient<MindDetail>(`/api/minds/${mindId}`),
    enabled: !!mindId,
  });

  return {
    mind: data,
    isLoading,
    error,
  };
}
