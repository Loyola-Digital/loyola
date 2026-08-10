"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface UsdBrl {
  rate: number;
  source: "live" | "manual" | "fallback";
  asOf: string;
}

// Câmbio USD->BRL pra unificar a moeda no dashboard mobile (Meta em BRL,
// RevenueCat em USD). Cacheado 1h — o backend também cacheia.
export function useUsdBrl() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["fx-usd-brl"],
    queryFn: () => apiClient<UsdBrl>("/api/fx/usd-brl"),
    staleTime: 60 * 60 * 1000,
  });
}
