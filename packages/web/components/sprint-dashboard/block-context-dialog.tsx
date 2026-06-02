"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateSprintDashboardConfig } from "@/lib/hooks/use-sprint-dashboard";
import type { SprintDashboardBlock } from "@loyola-x/shared";

interface BlockContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: SprintDashboardBlock;
  allBlocks: SprintDashboardBlock[];
}

const MAX_LEN = 2000;

/**
 * Story 31.7 — Dialog pra editar `manualContext` de um bloco. Sobrescreve a
 * leitura automática da task com 📢. Vazio = volta a usar auto.
 */
export function BlockContextDialog({
  open,
  onOpenChange,
  block,
  allBlocks,
}: BlockContextDialogProps) {
  const [value, setValue] = useState(block.manualContext ?? "");
  const updateConfig = useUpdateSprintDashboardConfig();

  // Resync quando dialog reabre num bloco diferente
  useEffect(() => {
    if (open) setValue(block.manualContext ?? "");
  }, [open, block.manualContext]);

  async function handleSave() {
    const trimmed = value.trim();
    const nextManual = trimmed.length === 0 ? null : value.slice(0, MAX_LEN);
    const updatedBlocks = allBlocks.map((b) =>
      b.id === block.id ? { ...b, manualContext: nextManual } : b,
    );
    try {
      await updateConfig.mutateAsync(updatedBlocks);
      toast.success(nextManual ? "Contexto salvo" : "Contexto removido — voltando ao automático");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar contexto");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contexto do bloco</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{block.title}</span>
            {block.subtitle ? <> · {block.subtitle}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="block-context">Resumo executivo (texto livre)</Label>
          <Textarea
            id="block-context"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
            rows={6}
            placeholder={`Ex: Pré-lançamento iniciado segunda. Foco em captação de leads B e C. Meta: 5k leads até sexta.`}
          />
          <p className="text-[10px] text-muted-foreground flex items-center justify-between">
            <span>
              Sobrescreve a task marcada com 📢 no ClickUp. Deixe vazio pra voltar ao automático.
            </span>
            <span className="tabular-nums">{value.length}/{MAX_LEN}</span>
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateConfig.isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
