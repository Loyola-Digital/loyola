"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface TopPostByFollowersItem {
  id: string;
  mediaType: string | null;
  timestamp: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  caption: string | null;
  follows: number;
}

export interface TopPostsByFollowersResponse {
  days: number;
  totalEligible: number;
  totalWithData: number;
  items: TopPostByFollowersItem[];
}

const STALE_TIME = 30 * 60 * 1000; // 30min — não muda muito

export function useTopPostsByFollowers(
  accountId: string | null,
  days: number,
  limit: number = 10,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["top-posts-by-followers", accountId, days, limit],
    queryFn: () =>
      apiClient<TopPostsByFollowersResponse>(
        `/api/instagram/accounts/${accountId}/top-posts-by-followers?days=${days}&limit=${limit}`,
      ),
    enabled: !!accountId,
    staleTime: STALE_TIME,
  });
}
