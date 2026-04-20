"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useFunnelStages, useCreateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StageCard } from "@/components/funnels/stage-card";
import { toast } from "sonner";

export default function FunnelPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const router = useRouter();
  const redirectedRef = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [stageName, setStageName] = useState("");

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(params.id, params.funnelId);
  const createStage = useCreateStage(params.id, params.funnelId);

  // Auto-redirect when there is exactly one stage (no need to show the list)
  useEffect(() => {
    if (!redirectedRef.current && stages && stages.length === 1) {
      redirectedRef.current = true;
      router.replace(
        `/projects/${params.id}/funnels/${params.funnelId}/stages/${stages[0].id}`
      );
    }
    // router intentionally omitted — Next.js router reference is unstable
  }, [stages, params.id, params.funnelId]);

  const isLoading = funnelLoading || stagesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
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

  // Single-stage funnels redirect above; show a blank skeleton while navigating
  if (stages && stages.length === 1) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  const { funnel } = funnelData;

  async function handleCreate() {
    if (!stageName.trim()) return;
    await createStage.mutateAsync({ name: stageName.trim() });
    toast.success("Etapa criada");
    setStageName("");
    setCreateOpen(false);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{funnel.name}</h1>
          <p className="text-sm text-muted-foreground">
            {funnelData.funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setStageName(""); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          Nova Etapa
        </Button>
      </div>

      {/* Stage grid */}
      {!stages || stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {stages.map((stage) => (
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
            <DialogTitle>Nova Etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-stage-name">Nome da etapa</Label>
            <Input
              id="new-stage-name"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="ex: Captação Paga"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createStage.isPending || !stageName.trim()}>
              {createStage.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
