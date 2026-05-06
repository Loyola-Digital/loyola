"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useSheetData,
  useUpdateSurveyMapping,
  type FunnelSurvey,
  type SurveyColumnMapping,
  type SurveyQuestionConfig,
} from "@/lib/hooks/use-google-sheets";

interface SurveyMappingDialogProps {
  projectId: string;
  funnelId: string;
  survey: FunnelSurvey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldKey = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "email" | "phone" | "timestamp";

const FIELD_LABELS: Record<FieldKey, string> = {
  utm_source: "UTM Source",
  utm_medium: "UTM Medium",
  utm_campaign: "UTM Campaign",
  utm_content: "UTM Content",
  email: "Email",
  phone: "Telefone",
  timestamp: "Data/Timestamp",
};

const NONE_VALUE = "__none__";

export function SurveyMappingDialog({
  projectId,
  funnelId,
  survey,
  open,
  onOpenChange,
}: SurveyMappingDialogProps) {
  const { data: sheetData, isLoading } = useSheetData(
    open ? survey.spreadsheetId : null,
    open ? survey.sheetName : null,
  );
  const updateMapping = useUpdateSurveyMapping(projectId, funnelId);

  const headers = useMemo(
    () => (sheetData?.headers ?? []).filter((h) => typeof h === "string" && h.trim().length > 0),
    [sheetData?.headers],
  );

  // Estado local do mapping — inicia com o atual da survey
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});
  const [questions, setQuestions] = useState<SurveyQuestionConfig[]>([]);

  // Reset state quando dialog abre ou survey muda
  useEffect(() => {
    if (open) {
      const m = survey.columnMapping ?? {};
      setFields({
        utm_source: m.utm_source,
        utm_medium: m.utm_medium,
        utm_campaign: m.utm_campaign,
        utm_content: m.utm_content,
        email: m.email,
        phone: m.phone,
        timestamp: m.timestamp,
      });
      setQuestions(m.questions ?? []);
    }
  }, [open, survey]);

  // Colunas que ainda não foram usadas como campos especiais ou perguntas
  const usedColumns = useMemo(() => {
    const used = new Set<string>();
    for (const v of Object.values(fields)) {
      if (v) used.add(v);
    }
    for (const q of questions) {
      used.add(q.columnName);
    }
    return used;
  }, [fields, questions]);

  function setField(key: FieldKey, value: string) {
    setFields((prev) => ({
      ...prev,
      [key]: value === NONE_VALUE ? undefined : value,
    }));
  }

  function addQuestion() {
    // Encontra primeira coluna não usada
    const available = headers.find((h) => !usedColumns.has(h));
    if (!available) {
      toast.warning("Todas as colunas já foram mapeadas");
      return;
    }
    setQuestions((prev) => [
      ...prev,
      { columnName: available, label: available, showInDashboard: true },
    ]);
  }

  function updateQuestion(index: number, patch: Partial<SurveyQuestionConfig>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    const mapping: SurveyColumnMapping = {
      ...fields,
      questions,
    };
    // Remove undefined keys pra mapping mais limpo
    const cleanMapping: SurveyColumnMapping = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (v !== undefined && v !== "") {
        (cleanMapping as Record<string, unknown>)[k] = v;
      }
    }

    updateMapping.mutate(
      { surveyId: survey.id, mapping: cleanMapping },
      {
        onSuccess: () => {
          toast.success("Mapping salvo!");
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Erro ao salvar"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Mapear colunas da pesquisa
          </DialogTitle>
          <DialogDescription className="text-xs">
            {survey.spreadsheetName} / {survey.sheetName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : headers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Não foi possível carregar as colunas da planilha.
          </p>
        ) : (
          <div className="space-y-5 overflow-y-auto flex-1 pr-1">
            {/* Identificadores e UTMs */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                UTMs e identificadores
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Mapeie quais colunas correspondem a cada UTM e identificador. UTM
                Source é usado pra classificar respostas como Pago/Orgânico.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium">
                      {FIELD_LABELS[key]}
                    </label>
                    <Select
                      value={fields[key] ?? NONE_VALUE}
                      onValueChange={(v) => setField(key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Não mapear" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Não mapear</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {/* Perguntas exibidas no dashboard */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Perguntas exibidas no dashboard
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addQuestion}
                  className="h-7 gap-1 text-xs"
                  disabled={headers.length === 0}
                >
                  <Plus className="h-3 w-3" />
                  Adicionar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Selecione as colunas da planilha que você quer ver agregadas como
                gráficos no dashboard. Customize o label como vai aparecer.
              </p>

              {questions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  Nenhuma pergunta mapeada ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border/30 p-3 space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Coluna
                          </label>
                          <Select
                            value={q.columnName}
                            onValueChange={(v) =>
                              updateQuestion(i, { columnName: v })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {headers.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Label no dashboard
                          </label>
                          <Input
                            value={q.label}
                            onChange={(e) =>
                              updateQuestion(i, { label: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.showInDashboard}
                            onChange={(e) =>
                              updateQuestion(i, {
                                showInDashboard: e.target.checked,
                              })
                            }
                            className="h-3.5 w-3.5"
                          />
                          Exibir no dashboard
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeQuestion(i)}
                          className="h-7 px-2 text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMapping.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMapping.isPending || isLoading}
          >
            {updateMapping.isPending ? "Salvando..." : "Salvar mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
