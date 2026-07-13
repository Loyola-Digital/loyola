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
import { SortableStageGrid } from "@/components/funnels/sortable-stage-grid";
import { CampaignLogCard } from "@/components/funnels/campaign-log-link";
import { OrphanCampaignsBanner } from "@/components/funnels/orphan-campaigns-banner";
import { SwitchyFunnelSection } from "@/components/funnels/switchy-funnel-section";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FunnelPage() {
  const params = useParams<{ id: string; funnelId: string }>();
  const router = useRouter();
  const redirectedRef = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageType, setStageType] = useState<"free" | "paid" | "sales" | "cpl" | "event" | "debriefing" | "comercial">("free");
  const [matchCodeDraft, setMatchCodeDraft] = useState<string>("");

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);

  // Sync draft com valor real quando funil carrega
  useEffect(() => {
    if (funnelData?.funnel) {
      setMatchCodeDraft(funnelData.funnel.matchCode ?? "");
    }
  }, [funnelData?.funnel]);
  const { data: stages, isLoading: stagesLoading } = useFunnelStages(params.id, params.funnelId);
  const { data: allFunnels } = useFunnels(params.id, "all");
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

  const otherFunnels = (allFunnels?.filter((f) => f.id !== params.funnelId) ?? [])
    .sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0)); // ativos primeiro, arquivados depois
  const compareFunnelName = otherFunnels.find((f) => f.id === funnel.compareFunnelId)?.name;

  function handleCompareFunnelChange(value: string) {
    const id = value === "none" ? null : value;
    updateFunnel.mutate(
      { compareFunnelId: id },
      { onSuccess: () => toast.success(id ? "Funil de comparação vinculado" : "Funil de comparação removido") }
    );
  }

  function handleSaveMatchCode() {
    const next = matchCodeDraft.trim();
    updateFunnel.mutate(
      { matchCode: next.length > 0 ? next.toLowerCase() : null },
      {
        onSuccess: () => toast.success(next ? "Código de match salvo" : "Código de match removido"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao salvar"),
      },
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

  function stageTypePlaceholder(type: "free" | "paid" | "sales" | "cpl" | "event" | "debriefing" | "comercial"): string {
    if (type === "paid") return "ex: Captação Paga";
    if (type === "sales") return "ex: Vendas Produto Principal";
    if (type === "cpl") return "ex: CPL Aula 1";
    if (type === "event") return "ex: Imersão Presencial";
    if (type === "debriefing") return "ex: Debriefing DGPG-03";
    if (type === "comercial") return "ex: Comercial Upsell";
    return "ex: Captação Orgânica";
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
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
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
                        {f.archivedAt ? `${f.name} (arquivado)` : f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="border-t border-border/30 pt-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">Código de match (override)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Por padrão o sistema usa o <span className="font-medium">nome do funil</span> ({" "}
                      <code className="font-mono text-[10px] bg-muted/50 px-1 rounded">{funnel.name.toLowerCase()}</code>) para detectar campanhas órfãs.
                      Use este campo só se quiser sobrescrever (ex: nome do funil longo).
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={matchCodeDraft}
                      onChange={(e) => setMatchCodeDraft(e.target.value)}
                      placeholder={`padrão: ${funnel.name.toLowerCase()}`}
                      maxLength={50}
                      className="h-8 text-sm font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveMatchCode}
                      disabled={updateFunnel.isPending || matchCodeDraft.trim().toLowerCase() === (funnel.matchCode ?? "")}
                      className="h-8"
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {funnelData.funnelType !== "perpetual" && (
            <Button size="sm" className="gap-1.5" onClick={() => { setStageName(""); setCreateOpen(true); }}>
              <Plus className="h-4 w-4" />
              Nova Etapa
            </Button>
          )}
        </div>
      </div>

      {/* Banner de campanhas órfãs (Epic 25) */}
      <OrphanCampaignsBanner projectId={params.id} funnelId={params.funnelId} />

      {/* Stage grid (drag-and-drop pra reordenar) */}
      {!stages || stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
      ) : (
        <SortableStageGrid
          stages={stages}
          projectId={params.id}
          funnelId={params.funnelId}
        />
      )}

      {/* Log de Campanha — entrada FIXA em todo funil (Story 38.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <CampaignLogCard projectId={params.id} funnelId={params.funnelId} />
      </div>

      {/* Switch — Gerador de Links atrelado ao funil (Story 33.7) */}
      <SwitchyFunnelSection
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
      />

      {/* Dialog Nova Etapa — só pra launch (perpetual não tem stages) */}
      {funnelData.funnelType !== "perpetual" && (
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
                placeholder={stageTypePlaceholder(stageType)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de etapa</Label>
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
                  <span className="text-xs text-muted-foreground">Captação orgânica</span>
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
                  <span className="text-xs text-muted-foreground">Captação + tráfego</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("sales")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "sales"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Vendas</span>
                  <span className="text-xs text-muted-foreground">Só planilha de vendas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("cpl")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "cpl"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">CPL</span>
                  <span className="text-xs text-muted-foreground">Reuniões Zoom + retenção</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("event")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "event"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Evento Presencial</span>
                  <span className="text-xs text-muted-foreground">Vendas no local + MemberKit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("debriefing")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "debriefing"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Debriefing</span>
                  <span className="text-xs text-muted-foreground">Docs HTML + comentários</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("comercial")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "comercial"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">Comercial</span>
                  <span className="text-xs text-muted-foreground">CRM kanban de compradores</span>
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
      )}
    </div>
  );
}
