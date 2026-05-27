"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import type { FunnelStage } from "@loyola-x/shared";

// ============================================================
// TYPES
// ============================================================

export interface LeadInputs {
  projectionEndDate?: string; // YYYY-MM-DD
  leadGoal?: number;
}

export interface SaveLeadInputsInput {
  funnelId: string;
  stageId: string;
  data: LeadInputs;
}

export interface StageLeadInputsState {
  [stageId: string]: LeadInputs;
}

// ============================================================
// VALIDATION
// ============================================================

export function validateLeadInputs(inputs: LeadInputs): { valid: boolean; error?: string } {
  if (inputs.projectionEndDate) {
    const today = new Date().toISOString().split('T')[0];
    if (inputs.projectionEndDate < today) {
      return { valid: false, error: "Data final não pode ser menor que hoje" };
    }
  }

  if (inputs.leadGoal !== undefined && inputs.leadGoal < 0) {
    return { valid: false, error: "Meta de leads não pode ser negativa" };
  }

  return { valid: true };
}

// ============================================================
// HOOK
// ============================================================

export function useStageLeadInputs(funnelId: string | null) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [stateByStage, setStateByStage] = useState<StageLeadInputsState>({});
  const [errors, setErrors] = useState<{ [stageId: string]: string }>({});

  const mutation = useMutation({
    mutationFn: async ({ funnelId, stageId, data }: SaveLeadInputsInput) => {
      const validation = validateLeadInputs(data);
      if (!validation.valid) throw new Error(validation.error);

      return apiClient<{ success: boolean; stage: FunnelStage }>(
        `/api/funnels/${funnelId}/stages/${stageId}/lead-inputs`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        }
      );
    },
    onSuccess: (_data, variables) => {
      setStateByStage((prev) => ({
        ...prev,
        [variables.stageId]: variables.data,
      }));
      setErrors((prev) => ({
        ...prev,
        [variables.stageId]: "",
      }));
      queryClient.invalidateQueries({ queryKey: ["funnels", funnelId] });
    },
    onError: (_error, variables) => {
      const errorMsg = _error instanceof Error ? _error.message : "Erro ao salvar";
      setErrors((prev) => ({
        ...prev,
        [variables.stageId]: errorMsg,
      }));
    },
  });

  const saveInputs = useCallback(
    async (stageId: string, inputs: LeadInputs) => {
      if (!funnelId) throw new Error("funnelId is required");
      await mutation.mutateAsync({ funnelId, stageId, data: inputs });
    },
    [funnelId, mutation]
  );

  const updateLocal = useCallback((stageId: string, inputs: Partial<LeadInputs>) => {
    setStateByStage((prev) => ({
      ...prev,
      [stageId]: { ...prev[stageId], ...inputs },
    }));
  }, []);

  const getInputs = useCallback((stageId: string): LeadInputs => {
    return stateByStage[stageId] || {};
  }, [stateByStage]);

  const getError = useCallback((stageId: string): string => {
    return errors[stageId] || "";
  }, [errors]);

  const clearError = useCallback((stageId: string) => {
    setErrors((prev) => ({
      ...prev,
      [stageId]: "",
    }));
  }, []);

  return {
    saveInputs,
    updateLocal,
    getInputs,
    getError,
    clearError,
    isPending: mutation.isPending,
    isError: mutation.isError,
  };
}
