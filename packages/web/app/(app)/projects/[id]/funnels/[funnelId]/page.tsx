"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Calculator, Pencil, Plus, Settings2 } from "lucide-react";
import { useFunnel, useFunnels, useUpdateFunnel } from "@/lib/hooks/use-funnels";
import { rotuloDoTipoDeEtapa } from "@/lib/utils/rotulos-de-etapa";
import { useUserRole } from "@/lib/hooks/use-user-role";
import { RenomearFunnel } from "@/components/funnels/renomear-funnel-dialog";
import { useFunnelStages, useCreateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { useTituloDaAba } from "@/components/layout/titulo-da-aba";
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
import { PlanejamentoCard } from "@/components/funnels/planejamento-card"; // Story 48.1
import { planejamentoHref, temPainelDePlanejamento } from "@/lib/utils/planejamento-entrada"; // Story 48.7
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
  // Lista literal em vez de `StageType`: "lyrio" não é criável por aqui (nasce
  // do funil mobile), e deixá-la no estado ofereceria uma opção que a tela não
  // desenha.
  const [stageType, setStageType] = useState<
    "free" | "paid" | "application" | "sales" | "cpl" | "event" | "event_capture" | "debriefing" | "comercial" | "mapa"
  >("free");
  const [matchCodeDraft, setMatchCodeDraft] = useState<string>("");

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  // O nome na aba: com cinco abas abertas, "Funil" em todas não distingue nada.
  useTituloDaAba(funnelData?.funnel.name);

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
  const role = useUserRole();
  const [renomeando, setRenomeando] = useState(false);

  // Auto-redirect when there is exactly one stage (no need to show the list).
  // Epic 40: NÃO redireciona mais no perpétuo — a página do funil agora tem
  // função lá (Nova Etapa: Comercial/Debriefing/etc + card do Log). Sem isso o
  // botão de criar etapa era inalcançável em funil perpétuo de etapa única.
  useEffect(() => {
    if (
      !redirectedRef.current &&
      stages &&
      stages.length === 1 &&
      funnelData?.funnelType !== "perpetual"
    ) {
      redirectedRef.current = true;
      router.replace(
        `/projects/${params.id}/funnels/${params.funnelId}/stages/${stages[0].id}`
      );
    }
    // router intentionally omitted — Next.js router reference is unstable
  }, [stages, params.id, params.funnelId, funnelData?.funnelType]);

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
  // (perpétuo não redireciona — cai no render normal com o grid).
  if (stages && stages.length === 1 && funnelData?.funnelType !== "perpetual") {
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

  // Story 19.15: o texto vem do módulo — num funil perpétuo, a etapa `free`
  // sugere "ex: Aquisição" em vez de "ex: Captação Orgânica".
  function stageTypePlaceholder(type: string): string {
    return rotuloDoTipoDeEtapa(type, funnelData?.funnelType).placeholder;
  }

  return (
    <div className="p-6 space-y-6">
      <RenomearFunnel
        open={renomeando}
        onOpenChange={setRenomeando}
        nomeAtual={funnel.name}
        matchCodeAtual={funnel.matchCode ?? null}
        updateFunnel={updateFunnel}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-1.5 text-2xl font-bold">
            {funnel.name}
            {role === "admin" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
                onClick={() => setRenomeando(true)}
                aria-label="Renomear funil"
                title="Renomear funil"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {funnelData.funnelType === "launch"
              ? "Funil de Lançamento"
              : funnelData.funnelType === "mobile"
                ? "Funil Mobile (App)"
                : "Funil Perpétuo"}
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
                {/* Story 48.7 — a entrada do Painel de Planejamento também
                    AQUI, e em primeiro lugar: é destino, não ajuste. O cartão
                    no grid continua (Story 48.1), mas foi onde o dono do
                    produto não achou — ele procurou nas Configurações do
                    Funil, que é onde o simulador (um por funil de lançamento)
                    de fato pertence. */}
                {temPainelDePlanejamento(funnelData.funnelType) && (
                  <div className="border-b border-border/30 pb-3 space-y-2">
                    <div>
                      <p className="text-sm font-medium">Painel de Planejamento</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Metas, custos, investimento e cenários — quantos leads captar e a que CPL. Um simulador por funil de lançamento.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="w-full gap-1.5 h-8" asChild>
                      <Link href={planejamentoHref(params.id, params.funnelId)}>
                        <Calculator className="h-3.5 w-3.5 text-emerald-600" />
                        Abrir Planejamento
                      </Link>
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Tipo do funil</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ["launch", "Lançamento"],
                        ["perpetual", "Perpétuo"],
                        ["mobile", "Mobile"],
                      ] as const
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        disabled={updateFunnel.isPending}
                        onClick={() =>
                          updateFunnel.mutate(
                            { type: t },
                            { onSuccess: () => toast.success(`Tipo alterado para ${label}`) },
                          )
                        }
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs transition-colors",
                          funnelData.funnelType === t
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Mobile mostra o dashboard RevenueCat + Meta (etapa Lyrio).
                  </p>
                </div>

                <div className="border-t border-border/30 pt-3">
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
          {/* Epic 40: perpétuo também cria etapas (Comercial/Debriefing/etc) —
              o dashboard único do perpétuo segue sendo a etapa principal. */}
          <Button size="sm" className="gap-1.5" onClick={() => { setStageName(""); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" />
            Nova Etapa
          </Button>
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
          funnelType={funnelData.funnelType}
        />
      )}

      {/* Log de Campanha — entrada FIXA em todo funil (Story 38.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <CampaignLogCard projectId={params.id} funnelId={params.funnelId} />
        {temPainelDePlanejamento(funnelData.funnelType) && <PlanejamentoCard projectId={params.id} funnelId={params.funnelId} />}
      </div>

      {/* Switch — Gerador de Links atrelado ao funil (Story 33.7) */}
      <SwitchyFunnelSection
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
      />

      {/* Dialog Nova Etapa — Epic 40: disponível também no perpétuo */}
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("free", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("free", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("paid", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("paid", funnelData?.funnelType).descricao}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("application")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "application"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{rotuloDoTipoDeEtapa("application", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("application", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("sales", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("sales", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("cpl", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("cpl", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("event", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("event", funnelData?.funnelType).descricao}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("event_capture")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "event_capture"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{rotuloDoTipoDeEtapa("event_capture", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("event_capture", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("debriefing", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("debriefing", funnelData?.funnelType).descricao}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStageType("mapa")}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                    stageType === "mapa"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{rotuloDoTipoDeEtapa("mapa", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("mapa", funnelData?.funnelType).descricao}</span>
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
                  <span className="font-medium">{rotuloDoTipoDeEtapa("comercial", funnelData?.funnelType).titulo}</span>
                  <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("comercial", funnelData?.funnelType).descricao}</span>
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
