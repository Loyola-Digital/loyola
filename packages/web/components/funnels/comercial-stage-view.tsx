"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Handshake,
  Minus,
  Phone,
  PhoneOff,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  User,
  FileSpreadsheet,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
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
import { useFunnelStages, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import {
  useCrmBoard,
  useSaveCrmConfig,
  useCrmSync,
  useCreateCrmColumn,
  useUpdateCrmColumn,
  useDeleteCrmColumn,
  useReorderCrmColumns,
  useUpdateCrmCard,
  useDeleteCrmCard,
  useCrmCardSurvey,
  type CrmCard,
  type CrmColumn,
} from "@/lib/hooks/use-comercial-crm";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import type { FunnelStage } from "@loyola-x/shared";

interface ComercialStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** Respostas booleanas do Tally vêm como TRUE/FALSE — traduz pra Sim/Não. */
function prettyAnswer(raw: string): { text: string; bool: "sim" | "nao" | null } {
  const t = (raw ?? "").trim();
  if (/^true$/i.test(t)) return { text: "Sim", bool: "sim" };
  if (/^false$/i.test(t)) return { text: "Não", bool: "nao" };
  return { text: t, bool: null };
}

// Badge de perfil hot/cold do lead (mesma linguagem visual dos outros dashboards).
function TemperatureBadge({ temperature }: { temperature: "hot" | "cold" }) {
  const hot = temperature === "hot";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        hot
          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          : "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
      }`}
      title={hot ? "Lead quente (hot)" : "Lead frio (cold)"}
    >
      {hot ? "🔥 Hot" : "❄️ Cold"}
    </span>
  );
}

// ---- Card draggable ----
function KanbanCard({ card, onOpen }: { card: CrmCard; onOpen: (c: CrmCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  const mainProduct = card.products[0]?.produto ?? "—";
  const extra = card.products.length - 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-border/50 bg-card p-2.5 space-y-1.5 ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Arrastar card"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onOpen(card)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium hover:underline">
            {card.customerName || card.customerEmail}
          </p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {card.temperature && <TemperatureBadge temperature={card.temperature} />}
            <span className="inline-flex max-w-[150px] items-center truncate rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
              {mainProduct}
            </span>
            {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold tabular-nums text-emerald-500">{fmtBRL(card.totalValue)}</span>
            <span className="flex items-center gap-1.5">
              {((Number(card.callCount) || 0) > 0 || card.callStatus) && (
                <span
                  className={`flex items-center gap-0.5 ${
                    card.callStatus === "atendeu" ? "text-emerald-500" : card.callStatus === "nao_atendeu" ? "text-red-400" : ""
                  }`}
                  title={`${card.callCount} ligação(ões)${card.callStatus === "atendeu" ? " · atendeu" : card.callStatus === "nao_atendeu" ? " · não atendeu" : ""}`}
                >
                  {card.callStatus === "nao_atendeu" ? <PhoneOff className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                  {(Number(card.callCount) || 0) > 0 && <span className="tabular-nums">{Number(card.callCount) || 0}</span>}
                </span>
              )}
              <span>{fmtDate(card.firstPurchaseAt)}</span>
            </span>
          </div>
          {card.assigneeName && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="truncate">{card.assigneeName}</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

// ---- Coluna droppable ----
function KanbanColumn({
  column,
  cards,
  onOpenCard,
}: {
  column: CrmColumn;
  cards: CrmCard[];
  onOpenCard: (c: CrmCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column } });
  const total = cards.reduce((s, c) => s + c.totalValue, 0);
  return (
    <div
      ref={setNodeRef}
      className={`flex w-[272px] shrink-0 flex-col rounded-xl border p-2 transition-colors ${
        isOver ? "border-cyan-500/60 bg-cyan-500/5" : "border-border/30 bg-card/40"
      }`}
    >
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm font-semibold ${column.isTerminal ? "text-muted-foreground" : ""}`}>
            {column.name}
          </p>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            {cards.length}
          </span>
        </div>
        <p className="text-[10px] tabular-nums text-muted-foreground">{fmtBRL(total)}</p>
      </div>
      <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 overflow-y-auto">
        {cards.map((c) => (
          <KanbanCard key={c.id} card={c} onOpen={onOpenCard} />
        ))}
        {cards.length === 0 && (
          <p className="py-6 text-center text-[11px] text-muted-foreground/50">Solte cards aqui</p>
        )}
      </div>
    </div>
  );
}

/**
 * Epic 40 / Story 40.1 — Etapa Comercial (CRM): kanban de compradores das
 * etapas-fonte, com pesquisa no card. O sync nunca move card de coluna.
 */
export function ComercialStageView({ projectId, funnelId, funnelName, stage }: ComercialStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const updateStage = useUpdateStage(projectId, funnelId, stage.id);

  const { data: board, isLoading } = useCrmBoard(projectId, funnelId, stage.id);
  const { data: allStages } = useFunnelStages(projectId, funnelId);
  const saveConfig = useSaveCrmConfig(projectId, funnelId, stage.id);
  const sync = useCrmSync(projectId, funnelId, stage.id);
  const syncMutate = sync.mutate;
  const createColumn = useCreateCrmColumn(projectId, funnelId, stage.id);
  const updateColumn = useUpdateCrmColumn(projectId, funnelId, stage.id);
  const deleteColumn = useDeleteCrmColumn(projectId, funnelId, stage.id);
  const reorderColumns = useReorderCrmColumns(projectId, funnelId, stage.id);
  const updateCard = useUpdateCrmCard(projectId, funnelId, stage.id);
  const deleteCard = useDeleteCrmCard(projectId, funnelId, stage.id);

  // Config draft
  const [sourceDraft, setSourceDraft] = useState<string[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const sourceIdsKey = board?.sourceStageIds?.join(",") ?? "";
  useEffect(() => {
    if (board) setSourceDraft(sourceIdsKey ? sourceIdsKey.split(",") : []);
    // board é intencionalmente lido só quando as fontes mudam
  }, [sourceIdsKey]); // board fora das deps de propósito

  // Drawer do card
  const [openCard, setOpenCard] = useState<CrmCard | null>(null);
  const [cardNotes, setCardNotes] = useState("");
  const [cardAssignee, setCardAssignee] = useState("");
  const [cardCallStatus, setCardCallStatus] = useState<"atendeu" | "nao_atendeu" | null>(null);
  const [cardCallCount, setCardCallCount] = useState(0);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState<string | null>(null);
  const { data: survey, isLoading: surveyLoading } = useCrmCardSurvey(
    projectId, funnelId, stage.id, openCard?.id ?? null,
  );
  useEffect(() => {
    if (openCard) {
      setCardNotes(openCard.notes ?? "");
      setCardAssignee(openCard.assigneeName ?? "");
      // Coerção defensiva: API anterior ao deploy do call-tracking devolve o
      // card SEM esses campos — sem isso, undefined + 1 vira NaN no contador.
      setCardCallStatus(openCard.callStatus ?? null);
      setCardCallCount(Number(openCard.callCount) || 0);
    }
  }, [openCard]);

  // Auto-sync ao abrir (1x por mount) — silencioso quando não há novidade.
  const autoSyncRan = useRef(false);
  useEffect(() => {
    if (autoSyncRan.current) return;
    autoSyncRan.current = true;
    syncMutate(undefined, {
      onSuccess: (r) => {
        if (r.created > 0) toast.success(`${r.created} comprador${r.created !== 1 ? "es" : ""} novo${r.created !== 1 ? "s" : ""} no CRM`);
      },
    });
  }, [syncMutate]);

  // Estado otimista do board (move de card sem esperar o PATCH).
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});
  const columns = useMemo(
    () => [...(board?.columns ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [board?.columns],
  );
  const cardsByColumn = useMemo(() => {
    const map = new Map<string, CrmCard[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of board?.cards ?? []) {
      const colId = optimisticMoves[card.id] ?? card.columnId;
      const arr = map.get(colId);
      if (arr) arr.push(card);
      else map.get(columns[0]?.id ?? "")?.push(card);
    }
    return map;
  }, [board?.cards, columns, optimisticMoves]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<CrmCard | null>(null);

  function handleDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.card as CrmCard) ?? null);
  }
  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const card = e.active.data.current?.card as CrmCard | undefined;
    const targetColumnId = e.over?.id as string | undefined;
    if (!card || !targetColumnId) return;
    const currentColId = optimisticMoves[card.id] ?? card.columnId;
    if (targetColumnId === currentColId) return;

    setOptimisticMoves((m) => ({ ...m, [card.id]: targetColumnId }));
    const targetCount = cardsByColumn.get(targetColumnId)?.length ?? 0;
    updateCard.mutate(
      { cardId: card.id, input: { columnId: targetColumnId, sortOrder: targetCount } },
      {
        onError: (err) => {
          setOptimisticMoves((m) => {
            const rest = { ...m };
            delete rest[card.id];
            return rest;
          });
          toast.error(err instanceof Error ? err.message : "Erro ao mover card");
        },
        onSettled: () => {
          setOptimisticMoves((m) => {
            const rest = { ...m };
            delete rest[card.id];
            return rest;
          });
        },
      },
    );
  }

  function handleManualSync() {
    syncMutate(undefined, {
      onSuccess: (r) => {
        if (!r.configured) {
          toast.info("Configure as etapas-fonte primeiro (Configurar)");
        } else if (r.created > 0 || r.updated > 0) {
          toast.success(
            `Sync: ${r.created} novo${r.created !== 1 ? "s" : ""}, ${r.updated} atualizado${r.updated !== 1 ? "s" : ""}` +
              (r.skippedNoEmail > 0 ? ` (${r.skippedNoEmail} sem email ficaram fora)` : ""),
          );
        } else {
          toast.info(`Nenhum comprador novo${r.skippedNoEmail > 0 ? ` (${r.skippedNoEmail} sem email fora)` : ""}`);
        }
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no sync"),
    });
  }

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  async function handleSaveConfig() {
    try {
      await saveConfig.mutateAsync(sourceDraft);
      toast.success("Etapas-fonte salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  function handleSaveCardDetails() {
    if (!openCard) return;
    updateCard.mutate(
      {
        cardId: openCard.id,
        input: {
          notes: cardNotes.trim() || null,
          assigneeName: cardAssignee.trim() || null,
          callStatus: cardCallStatus,
          callCount: cardCallCount,
        },
      },
      {
        onSuccess: () => toast.success("Card atualizado"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
      },
    );
  }

  const otherStages = (allStages ?? []).filter((s) => s.id !== stage.id);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="flex items-center gap-1 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
              <Handshake className="h-3 w-3" />
              Comercial
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            CRM — compradores das etapas-fonte num kanban, com pesquisa no card.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CampaignLogButton projectId={projectId} funnelId={funnelId} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleManualSync}
            disabled={sync.isPending}
            title="Importa compradores das etapas-fonte (nunca move cards existentes)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          <Sheet open={settingsOpen} onOpenChange={(o) => { setSettingsOpen(o); if (o) setStageName(stage.name); }}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Configurações da Etapa</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="settings-stage-name">Nome da etapa</Label>
                  <div className="flex gap-2">
                    <Input
                      id="settings-stage-name"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={updateStage.isPending || !stageName.trim() || stageName.trim() === stage.name}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                {/* Etapas-fonte */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Etapas-fonte (de onde puxar compradores)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Quem comprou nessas etapas (planilhas de venda + vendas manuais) vira card no kanban.
                  </p>
                  <div className="space-y-1 rounded-md border border-border/40 p-1 max-h-52 overflow-y-auto">
                    {otherStages.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">O funil só tem esta etapa.</p>
                    ) : (
                      otherStages.map((s) => {
                        const checked = sourceDraft.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/40"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSourceDraft((d) => (checked ? d.filter((x) => x !== s.id) : [...d, s.id]))
                              }
                              className="h-3.5 w-3.5"
                            />
                            <span className="truncate">{s.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <Button size="sm" onClick={handleSaveConfig} disabled={saveConfig.isPending}>
                    {saveConfig.isPending ? "Salvando..." : "Salvar etapas-fonte"}
                  </Button>
                </div>

                {/* Colunas do kanban */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Colunas do kanban</Label>
                  <div className="space-y-1">
                    {columns.map((c, idx) => (
                      <div key={c.id} className="flex items-center gap-1.5">
                        <div className="flex flex-col shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-6"
                            disabled={idx === 0 || reorderColumns.isPending}
                            title="Mover pra esquerda no kanban"
                            onClick={() => {
                              const ids = columns.map((x) => x.id);
                              [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                              reorderColumns.mutate(ids);
                            }}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-6"
                            disabled={idx === columns.length - 1 || reorderColumns.isPending}
                            title="Mover pra direita no kanban"
                            onClick={() => {
                              const ids = columns.map((x) => x.id);
                              [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                              reorderColumns.mutate(ids);
                            }}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input
                          defaultValue={c.name}
                          className="h-8 text-sm"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== c.name) {
                              updateColumn.mutate(
                                { columnId: c.id, input: { name: v } },
                                { onSuccess: () => toast.success("Coluna renomeada") },
                              );
                            }
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          title="Excluir coluna (só vazia)"
                          onClick={() =>
                            deleteColumn.mutate(c.id, {
                              onSuccess: () => toast.success("Coluna excluída"),
                              onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      placeholder="Nova coluna..."
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      disabled={!newColumnName.trim() || createColumn.isPending}
                      onClick={() =>
                        createColumn.mutate(
                          { name: newColumnName.trim() },
                          { onSuccess: () => { setNewColumnName(""); toast.success("Coluna criada"); } },
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <StageDeleteSection
                  projectId={projectId}
                  funnelId={funnelId}
                  stageId={stage.id}
                  stageName={stage.name}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex gap-3">
          <Skeleton className="h-72 w-[272px]" />
          <Skeleton className="h-72 w-[272px]" />
          <Skeleton className="h-72 w-[272px]" />
        </div>
      ) : !board?.configured ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center space-y-3">
          <Handshake className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Selecione as <strong>etapas-fonte</strong> em Configurar — quem comprou nelas vira card aqui.
          </p>
          <Button variant="outline" size="sm" onClick={() => { setStageName(stage.name); setSettingsOpen(true); }}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Configurar etapas-fonte
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cardsByColumn.get(col.id) ?? []}
                onOpenCard={setOpenCard}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="w-[248px] rounded-lg border border-cyan-500/60 bg-card p-2.5 shadow-lg">
                <p className="truncate text-sm font-medium">{dragging.customerName || dragging.customerEmail}</p>
                <p className="text-[11px] font-semibold text-emerald-500">{fmtBRL(dragging.totalValue)}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Drawer do card */}
      <Sheet open={!!openCard} onOpenChange={(o) => !o && setOpenCard(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {openCard && (
            <>
              <SheetHeader className="pb-0">
                <SheetTitle className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-base">{openCard.customerName || openCard.customerEmail}</span>
                  {openCard.temperature && <TemperatureBadge temperature={openCard.temperature} />}
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-6">
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">Contato</p>
                  <p className="break-all">{openCard.customerEmail}</p>
                  {openCard.customerPhone && <p className="tabular-nums">{openCard.customerPhone}</p>}
                </div>

                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
                    Compras · <span className="text-foreground/80 normal-case">{fmtBRL(openCard.totalValue)}</span>
                  </p>
                  <div className="space-y-2">
                    {openCard.products.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
                        <span className="truncate">{p.produto}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {fmtBRL(p.valor)} · {fmtDate(p.dataVenda)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
                    Pesquisa
                  </p>
                  {surveyLoading ? (
                    <Skeleton className="h-16" />
                  ) : survey?.matched ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                        {survey.answers.map((a, i) => {
                          const pretty = prettyAnswer(a.answer);
                          return (
                            <div key={i} className="px-3 py-2.5">
                              <p className="text-[11px] leading-snug text-muted-foreground mb-1">{a.label}</p>
                              {pretty.bool ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                    pretty.bool === "sim"
                                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {pretty.text}
                                </span>
                              ) : (
                                <p className="text-sm leading-snug">{pretty.text}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        match por {survey.matchedBy === "phone" ? "telefone" : "email"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Sem pesquisa respondida.</p>
                  )}
                </div>

                {/* Rastreio de ligação — pedido do Lucas: Atendeu / Não atendeu / Liguei X vezes */}
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Ligação
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={cardCallStatus === "atendeu" ? "default" : "outline"}
                      className="gap-1.5"
                      onClick={() => setCardCallStatus(cardCallStatus === "atendeu" ? null : "atendeu")}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Atendeu
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={cardCallStatus === "nao_atendeu" ? "destructive" : "outline"}
                      className="gap-1.5"
                      onClick={() => setCardCallStatus(cardCallStatus === "nao_atendeu" ? null : "nao_atendeu")}
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                      Não atendeu
                    </Button>
                    <div className="flex items-center gap-1 rounded-md border border-border/50 px-1 py-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={cardCallCount <= 0}
                        onClick={() => setCardCallCount((n) => Math.max(0, n - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="min-w-[86px] text-center text-xs tabular-nums">
                        Liguei {cardCallCount}x
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCardCallCount((n) => Math.min(999, n + 1))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-border/40 pt-5">
                  <Label htmlFor="card-assignee">Responsável</Label>
                  <Input
                    id="card-assignee"
                    value={cardAssignee}
                    onChange={(e) => setCardAssignee(e.target.value)}
                    placeholder="quem está cuidando desse lead"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-notes">Notas</Label>
                  <Textarea
                    id="card-notes"
                    value={cardNotes}
                    onChange={(e) => setCardNotes(e.target.value)}
                    placeholder="histórico da negociação, próximos passos..."
                    rows={5}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" onClick={handleSaveCardDetails} disabled={updateCard.isPending}>
                    {updateCard.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeleteCard(openCard.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover do CRM
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmDeleteCard} onOpenChange={(o) => !o && setConfirmDeleteCard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover card do CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              O card sai do kanban (notas e responsável são perdidos). Se o comprador seguir nas
              etapas-fonte, o próximo sync o recria na coluna inicial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteCard) return;
                deleteCard.mutate(confirmDeleteCard, {
                  onSuccess: () => {
                    toast.success("Card removido");
                    setConfirmDeleteCard(null);
                    setOpenCard(null);
                  },
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
                });
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
