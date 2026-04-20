"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useFunnelStages, useCreateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StageCard } from "@/components/funnels/stage-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function FunnelPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const router = useRouter();

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(params.id, params.funnelId);

  const [createOpen, setCreateOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const createStage = useCreateStage(params.id, params.funnelId);

  // Redirect automático quando há apenas 1 etapa
  useEffect(() => {
    if (stages && stages.length === 1) {
      router.replace(
        `/projects/${params.id}/funnels/${params.funnelId}/stages/${stages[0].id}`
      );
    }
  }, [stages, params.id, params.funnelId, router]);

  const isLoading = funnelLoading || stagesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!funnelData) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Funil não encontrado</p>
      </div>
    );
  }

  // Se 1 etapa: aguarda o redirect (mostra loading)
  if (stages && stages.length === 1) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { funnel, funnelType } = funnelData;

  async function handleCreateStage() {
    if (!newStageName.trim()) return;
    await createStage.mutateAsync({ name: newStageName.trim() });
    toast.success("Etapa criada");
    setNewStageName("");
    setCreateOpen(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{funnel.name}</h1>
          <p className="text-sm text-muted-foreground">
            {funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"} · {stages?.length ?? 0} etapa{(stages?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova Etapa
        </Button>
      </div>

      {stages && stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground mb-4">Nenhuma etapa cadastrada</p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Criar primeira etapa
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stages?.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              projectId={params.id}
              funnelId={params.funnelId}
              isLastStage={stages.length === 1}
            />
          ))}
        </div>
      )}

      {/* Dialog Nova Etapa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-stage-name">Nome</Label>
            <Input
              id="new-stage-name"
              placeholder="Ex: Captação Paga"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateStage()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateStage}
              disabled={createStage.isPending || !newStageName.trim()}
            >
              {createStage.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
