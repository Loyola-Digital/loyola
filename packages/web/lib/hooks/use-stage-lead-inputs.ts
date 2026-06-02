"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
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

function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function validateLeadInputs(inputs: LeadInputs): { valid: boolean; error?: string } {
  if (inputs.projectionEndDate) {
    const today = toLocalYMD(new Date());
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
  const [stateByStage, setStateByStage] = useState<StageLeadInputsState>({});
  const [errors, setErrors] = useState<{ [stageId: string]: string }>({});

  // Carregar dados do localStorage quando funnelId muda
  useEffect(() => {
    if (!funnelId || typeof window === "undefined") return;

    const loaded: StageLeadInputsState = {};
    const allKeys = Object.keys(localStorage);

    allKeys.forEach((key) => {
      if (key.startsWith(`stageInputs_${funnelId}_`)) {
        const stageId = key.replace(`stageInputs_${funnelId}_`, "");
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            loaded[stageId] = JSON.parse(saved);
          } catch (e) {
            console.error("Failed to parse saved inputs", e);
          }
        }
      }
    });

    if (Object.keys(loaded).length > 0) {
      setStateByStage(loaded);
    }
  }, [funnelId]);

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
      // Atualizar estado local com sucesso
      setStateByStage((prev) => ({
        ...prev,
        [variables.stageId]: variables.data,
      }));
      setErrors((prev) => ({
        ...prev,
        [variables.stageId]: "",
      }));
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

      // Salvar no localStorage também como fallback
      if (typeof window !== "undefined") {
        const storageKey = `stageInputs_${funnelId}_${stageId}`;
        localStorage.setItem(storageKey, JSON.stringify(inputs));
      }

      // Tentar salvar na API
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
    // Tentar estado primeiro, depois localStorage
    if (stateByStage[stageId]) {
      return stateByStage[stageId];
    }

    if (typeof window !== "undefined" && funnelId) {
      const storageKey = `stageInputs_${funnelId}_${stageId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved inputs", e);
        }
      }
    }

    return {};
  }, [stateByStage, funnelId]);

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
