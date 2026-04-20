"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { useFunnel, useFunnels, useUpdateFunnel } from "@/lib/hooks/use-funnels";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StageCard } from "@/components/funnels/stage-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FunnelPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const router = useRouter();
  const redirectedRef = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<"free" | "paid">("free");

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(params.id, params.funnelId);
  const { data: allFunnels } = useFunnels(params.id);
  const createStage = useCreateStage(params.id, params.funnelId);
  const updateFunnel = useUpdateFunnel(params.id, params.funnelId);

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

  const otherFunnels = allFunnels?.filter((f) => f.id !== params.funnelId) ?? [];
  const compareFunnelName = otherFunnels.find((f) => f.id === funnel.compareFunnelId)?.name;

  function handleCompareFunnelChange(value: string) {
    const id = value === "none" ? null : value;
    updateFunnel.mutate(
      { compareFunnelId: id },
      { onSuccess: () => toast.success(id ? "Funil de comparação vinculado" : "Funil de comparação removido") }
    );
  }

  async function handleCreate() {
    if (!stageName.trim()) return;
    await createStage.mutateAsync({ name: stageName.trim(), stageType });
    toast.success("Etapa criada");
    setStageName("");
    setStageType("free");
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
            {compareFunnelName && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                · Comparando com <span className="font-medium">{compareFunnelName}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 px-2">
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Funil de Comparação</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Exibe métricas do Meta Ads deste funil como benchmark.
                  </p>
                </div>
                <Select
                  value={funnel.compareFunnelId ?? "none"}
                  onValueChange={handleCompareFunnelChange}
                  disabled={updateFunnel.isPending}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecionar funil..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {otherFunnels.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" className="gap-1.5" onClick={() => { setStageName(""); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" />
            Nova Etapa
          </Button>
        </div>
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
          <div className="space-y-4 py-2">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Tipo de captação</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStageType("free")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "free"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Gratuita</span>
                  <span className="text-xs text-muted-foreground">Sem planilhas de vendas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("paid")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "paid"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Paga</span>
                  <span className="text-xs text-muted-foreground">Com planilhas de vendas</span>
                </button>
              </div>
            </div>
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
