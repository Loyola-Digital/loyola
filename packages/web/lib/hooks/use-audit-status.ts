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

interface StageAuditFields {
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
  cancelAudit: () => Promise<void>;
  isCancelling: boolean;
}

export function useAuditStatus(
  stageId: string | null,
  funnelId: string | null,
  projectId: string | null,
): UseAuditStatusResult {
  const apiClient = useApiClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["auditStatus", projectId, funnelId, stageId],
    queryFn: async () => {
      if (!stageId || !funnelId || !projectId) return undefined;

      const stage = await apiClient<StageAuditFields>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`,
      );
      return {
        lastAuditAt: stage.lastAuditAt ?? null,
        lastAuditBy: stage.lastAuditBy ?? null,
        auditStatus: stage.auditStatus ?? "pending",
      } as AuditStatusData;
    },
    enabled: !!stageId && !!funnelId && !!projectId,
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      if (!stageId || !funnelId || !projectId) throw new Error("Parâmetros inválidos");

      return apiClient<{ lastAuditAt: string; lastAuditBy: { id: string; name: string }; auditStatus: "audited" }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/audit`,
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

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!stageId || !funnelId || !projectId) throw new Error("Parâmetros inválidos");

      return apiClient<{ lastAuditAt: null; lastAuditBy: null; auditStatus: "pending" }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/audit`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      refetch();
    },
  });

  const cancelAudit = useCallback(async () => {
    try {
      await cancelMutation.mutateAsync();
    } catch (error) {
      console.error("Erro ao cancelar auditoria:", error);
      throw error;
    }
  }, [cancelMutation]);

  return {
    data,
    isLoading,
    isError,
    audit,
    isAuditing: auditMutation.isPending,
    cancelAudit,
    isCancelling: cancelMutation.isPending,
  };
}
