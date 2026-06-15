"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateSprintDashboardConfig } from "@/lib/hooks/use-sprint-dashboard";
import { getBlockContextSections } from "./summary-utils";
import type { SprintDashboardBlock, SprintContextSection } from "@loyola-x/shared";

interface BlockContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: SprintDashboardBlock;
  allBlocks: SprintDashboardBlock[];
}

const MAX_LEN = 2000;
const MAX_LABEL = 40;

/**
 * Dialog pra gerenciar as seções de contexto de um bloco (Calendário Macro).
 * Cada seção vira um botão (ex: "Contexto", "Bônus") cujo conteúdo aparece ao
 * clicar. Migra o `manualContext` legado pra uma seção "Contexto" ao abrir.
 */
export function BlockContextDialog({
  open,
  onOpenChange,
  block,
  allBlocks,
}: BlockContextDialogProps) {
  const [sections, setSections] = useState<SprintContextSection[]>([]);
  const updateConfig = useUpdateSprintDashboardConfig();

  // Resync quando reabre (migra manualContext legado pra seção "Contexto")
  useEffect(() => {
    if (open) setSections(getBlockContextSections(block));
  }, [open, block]);

  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "Nova seção", content: "" },
    ]);
  }
  function updateSection(id: string, partial: Partial<SprintContextSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  }
  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave() {
    // Descarta seções sem rótulo ou sem conteúdo
    const cleaned = sections
      .map((s) => ({
        id: s.id,
        label: s.label.trim().slice(0, MAX_LABEL),
        content: s.content.slice(0, MAX_LEN),
      }))
      .filter((s) => s.label.length > 0 && s.content.trim().length > 0);

    // Persiste contextSections e zera o manualContext legado (já migrado).
    const updatedBlocks = allBlocks.map((b) =>
      b.id === block.id ? { ...b, contextSections: cleaned, manualContext: null } : b,
    );
    try {
      await updateConfig.mutateAsync(updatedBlocks);
      toast.success(cleaned.length > 0 ? "Seções salvas" : "Seções removidas");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar seções");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contexto e seções</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{block.title}</span> — crie botões como
            &quot;Contexto&quot;, &quot;Bônus&quot;, &quot;Oferta&quot;. Cada um aparece no card do
            Calendário Macro e mostra o conteúdo ao ser clicado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {sections.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nenhuma seção ainda. Adicione a primeira abaixo.
            </p>
          )}

          {sections.map((s) => (
            <div key={s.id} className="space-y-1.5 rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={s.label}
                  onChange={(e) => updateSection(s.id, { label: e.target.value.slice(0, MAX_LABEL) })}
                  placeholder="Nome do botão (ex: Contexto, Bônus)"
                  className="h-7 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeSection(s.id)}
                  title="Remover seção"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={s.content}
                onChange={(e) => updateSection(s.id, { content: e.target.value.slice(0, MAX_LEN) })}
                rows={4}
                placeholder="Conteúdo da seção (texto livre)…"
                className="text-xs"
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={addSection}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar seção
          </Button>
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
