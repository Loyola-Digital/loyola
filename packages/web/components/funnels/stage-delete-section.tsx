"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFunnelStages, useDeleteStage } from "@/lib/hooks/use-funnel-stages";
import { toast } from "sonner";

interface StageDeleteSectionProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  stageName: string;
}

// Zona de perigo pra excluir a etapa de dentro da própria etapa (sheet de
// configurações). O grid do funil já tinha a opção no menu do card, mas quem
// está dentro da etapa não tinha como excluir sem voltar pro grid.
export function StageDeleteSection({ projectId, funnelId, stageId, stageName }: StageDeleteSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: stages } = useFunnelStages(projectId, funnelId);
  const deleteStage = useDeleteStage(projectId, funnelId);
  // Backend bloqueia remover a última etapa (409) — desabilita antes.
  const isLastStage = (stages?.length ?? 0) <= 1;

  async function handleDelete() {
    try {
      await deleteStage.mutateAsync(stageId);
      toast.success("Etapa removida");
      setOpen(false);
      router.push(`/projects/${projectId}/funnels/${funnelId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover etapa");
    }
  }

  return (
    <div className="border-t border-border/30 pt-4 space-y-2">
      <p className="text-sm font-medium text-destructive">Zona de perigo</p>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        disabled={isLastStage || deleteStage.isPending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir etapa
      </Button>
      {isLastStage && (
        <p className="text-xs text-muted-foreground">
          Mínimo de 1 etapa por funil — pra remover tudo, exclua o funil.
        </p>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa <strong>{stageName}</strong> será removida permanentemente, junto com
              planilhas, pesquisas e integrações conectadas a ela. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteStage.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
