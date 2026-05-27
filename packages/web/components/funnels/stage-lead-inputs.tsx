"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStageLeadInputs } from "@/lib/hooks/use-stage-lead-inputs";
import { toast } from "sonner";
import type { FunnelStage } from "@loyola-x/shared";

interface StageLeadInputsProps {
  funnelId: string;
  stages: FunnelStage[];
}

export function StageLeadInputs({ funnelId, stages }: StageLeadInputsProps) {
  const { saveInputs, updateLocal, getInputs, getError, clearError, isPending } =
    useStageLeadInputs(funnelId);

  const handleDateChange = (stageId: string, value: string) => {
    updateLocal(stageId, { projectionEndDate: value });
    clearError(stageId);
  };

  const handleGoalChange = (stageId: string, value: string) => {
    const num = value ? parseInt(value, 10) : undefined;
    updateLocal(stageId, { leadGoal: num });
    clearError(stageId);
  };

  const handleSave = async (stageId: string) => {
    try {
      const inputs = getInputs(stageId);
      if (!inputs.projectionEndDate && inputs.leadGoal === undefined) {
        toast.error("Preencha pelo menos um campo");
        return;
      }

      await saveInputs(stageId, inputs);
      toast.success("Dados salvos com sucesso!", { duration: 3000 });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro ao salvar";
      toast.error(errorMsg, { duration: 3000 });
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Inputs de Projeção por Etapa</h3>

      <div className="grid gap-6">
        {stages.map((stage) => {
          const inputs = getInputs(stage.id);
          const error = getError(stage.id);

          return (
            <div key={stage.id} className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-base">{stage.name}</h4>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Data Final */}
                <div className="space-y-2">
                  <Label htmlFor={`date-${stage.id}`}>Data Final</Label>
                  <Input
                    id={`date-${stage.id}`}
                    type="date"
                    value={inputs.projectionEndDate || ""}
                    onChange={(e) => handleDateChange(stage.id, e.target.value)}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fim do período de projeção
                  </p>
                </div>

                {/* Meta Total */}
                <div className="space-y-2">
                  <Label htmlFor={`goal-${stage.id}`}>Meta Total de Leads</Label>
                  <Input
                    id={`goal-${stage.id}`}
                    type="number"
                    min="0"
                    value={inputs.leadGoal ?? ""}
                    onChange={(e) => handleGoalChange(stage.id, e.target.value)}
                    disabled={isPending}
                    placeholder="Ex: 1500"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número de leads esperados
                  </p>
                </div>
              </div>

              {/* Erro */}
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                  {error}
                </div>
              )}

              {/* Botão Salvar */}
              <Button
                onClick={() => handleSave(stage.id)}
                disabled={isPending}
                className="w-full md:w-auto"
              >
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
