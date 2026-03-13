"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { createApiFetcher } from "@/lib/api-client";

/**
 * Client-side API client hook.
 * Automatically injects Clerk JWT token from useAuth().
 *
 * Usage:
 *   const apiClient = useApiClient();
 *   const data = await apiClient<Mind[]>("/api/minds");
 */
export function useApiClient() {
  const { getToken } = useAuth();

  return useCallback(
    <T>(path: string, options?: RequestInit) => {
      const fetcher = createApiFetcher(getToken);
      return fetcher<T>(path, options);
    },
    [getToken],
  );
}
