import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface SalesByDayData {
  byDay: Record<string, number>;
  semDados: boolean;
}

export function useStageSalesByDay(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days?: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stageSalesByDay", projectId, funnelId, stageId, days],
    queryFn: async () => {
      const params = new URLSearchParams({ subtype: "capture" });
      if (days) params.set("days", String(days));
      return apiClient<SalesByDayData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-data-daily?${params}`,
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
  });
}
