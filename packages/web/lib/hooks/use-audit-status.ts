import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface AuditStatusData {
  lastAuditAt: string | null;
  lastAuditBy: {
    id: string;
    name: string;
  } | null;
  auditStatus: "pending" | "audited";
}

interface FunnelAuditFields {
  lastAuditAt?: string | null;
  lastAuditBy?: { id: string; name: string } | null;
  auditStatus?: "pending" | "audited";
}

interface UseAuditStatusResult {
  data: AuditStatusData | undefined;
  isLoading: boolean;
  isError: boolean;
  audit: () => Promise<void>;
  isAuditing: boolean;
}

export function useAuditStatus(
  funnelId: string | null,
  projectId: string | null,
): UseAuditStatusResult {
  const apiClient = useApiClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["auditStatus", projectId, funnelId],
    queryFn: async () => {
      if (!funnelId || !projectId) return undefined;

      const funnel = await apiClient<FunnelAuditFields>(
        `/api/projects/${projectId}/funnels/${funnelId}`,
      );
      return {
        lastAuditAt: funnel.lastAuditAt ?? null,
        lastAuditBy: funnel.lastAuditBy ?? null,
        auditStatus: funnel.auditStatus ?? "pending",
      } as AuditStatusData;
    },
    enabled: !!funnelId && !!projectId,
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      if (!funnelId) throw new Error("Funil não encontrado");

      return apiClient<{ lastAuditAt: string; lastAuditBy: { id: string; name: string } }>(
        `/api/funnels/${funnelId}/audit`,
        { method: "POST", body: JSON.stringify({}) },
      );
    },
    onSuccess: () => {
      refetch();
    },
  });

  const audit = useCallback(async () => {
    try {
      await auditMutation.mutateAsync();
    } catch (error) {
      console.error("Erro ao auditar:", error);
      throw error;
    }
  }, [auditMutation]);

  return {
    data,
    isLoading,
    isError,
    audit,
    isAuditing: auditMutation.isPending,
  };
}
