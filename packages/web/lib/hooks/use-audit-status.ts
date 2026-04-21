import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

interface AuditStatusData {
  lastAuditAt: string | null;
  lastAuditBy: {
    id: string;
    name: string;
  } | null;
  auditStatus: "pending" | "audited";
}

interface UseAuditStatusResult {
  data: AuditStatusData | undefined;
  isLoading: boolean;
  isError: boolean;
  audit: () => Promise<void>;
  isAuditing: boolean;
}

export function useAuditStatus(funnelId: string | null): UseAuditStatusResult {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["auditStatus", funnelId],
    queryFn: async () => {
      if (!funnelId) return undefined;

      const response = await fetch(`/api/funnels/${funnelId}`);
      if (!response.ok) throw new Error("Falha ao carregar status de auditoria");

      const funnel = await response.json();
      return {
        lastAuditAt: funnel.lastAuditAt || null,
        lastAuditBy: funnel.lastAuditBy || null,
        auditStatus: funnel.auditStatus || "pending",
      } as AuditStatusData;
    },
    enabled: !!funnelId,
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      if (!funnelId) throw new Error("Funil não encontrado");

      const response = await fetch(`/api/funnels/${funnelId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Falha ao registrar auditoria");
      }

      return response.json();
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
