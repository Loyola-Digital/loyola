"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { Squad } from "@loyola-x/shared";

export function useMinds(query?: string) {
  const apiClient = useApiClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["minds", query],
    queryFn: () =>
      apiClient<{ squads: Squad[] }>(
        `/api/minds${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      ),
  });

  return {
    squads: data?.squads,
    isLoading,
    error,
  };
}
