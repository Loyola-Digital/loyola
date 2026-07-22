"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, MessageSquare, Plus, Settings2, ArrowDownToLine, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import {
  useDebriefings,
  useAssignDebriefingStage,
  useUpdateDebriefing,
  type DebriefingListItem,
} from "@/lib/hooks/use-debriefings";
import { CreateDebriefingDialog } from "@/components/debriefings/create-debriefing-dialog";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import type { FunnelStage } from "@loyola-x/shared";

interface DebriefingStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function DebriefingCard({ d, from }: { d: DebriefingListItem; from: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.campaignName);
  const update = useUpdateDebriefing(d.id);

  function startEdit(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setName(d.campaignName);
    setEditing(true);
  }
  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === d.campaignName) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ campaignName: trimmed });
      toast.success("Nome atualizado");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear");
    }
  }

  const cardInner = (
    <Card className="h-full transition-colors group-hover:border-primary/40">
      <CardHeader className="pb-2">
        {editing ? (
          <div className="flex items-center gap-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 shrink-0" disabled={update.isPending} onClick={save}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <CardTitle className="text-base truncate pr-7">{d.campaignName}</CardTitle>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            {d.authorAvatarUrl && <AvatarImage src={d.authorAvatarUrl} alt={d.authorName} />}
            <AvatarFallback className="text-[10px]">{initials(d.authorName)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground truncate">
            {d.authorName} · {format(new Date(d.createdAt), "dd MMM yyyy", { locale: ptBR })}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          {d.commentCount} {d.commentCount === 1 ? "comentário" : "comentários"}
          {d.editorName && (
            <span className="ml-auto truncate">editado por {d.editorName}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="relative group">
      {editing ? (
        cardInner
      ) : (
        <Link href={`/debriefings/${d.id}?from=${encodeURIComponent(from)}`} className="block">
          {cardInner}
        </Link>
      )}
      {!editing && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          title="Renomear debriefing"
          onClick={startEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/**
 * Página de etapa do tipo "Debriefing" (Epic 37 — movido do menu global pra
 * dentro do funil): lista os docs de debriefing da etapa, cria novos já
 * vinculados a ela e permite "trazer" docs antigos que ficaram sem etapa.
 */
export function DebriefingStageView({ projectId, funnelId, funnelName, stage }: DebriefingStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const updateStage = useUpdateStage(projectId, funnelId, stage.id);

  const { data: stageData, isLoading } = useDebriefings({ stageId: stage.id });
  const { data: unassignedData } = useDebriefings({ unassigned: true });
  const assignStage = useAssignDebriefingStage();

  const debriefings = stageData?.debriefings ?? [];
  const unassigned = unassignedData?.debriefings ?? [];
  // O detalhe (/debriefings/[id]) usa ?from= pra voltar direto pra esta etapa.
  const stagePath = `/projects/${projectId}/funnels/${funnelId}/stages/${stage.id}`;

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  function handleBringToStage(d: DebriefingListItem) {
    assignStage.mutate(
      { id: d.id, stageId: stage.id },
      {
        onSuccess: () => toast.success(`"${d.campaignName}" vinculado à etapa`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao vincular"),
      },
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Debriefing
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Documentos de debriefing da campanha — com comentários do time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CampaignLogButton projectId={projectId} funnelId={funnelId} />
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo debriefing
          </Button>

          <Sheet open={settingsOpen} onOpenChange={(open) => {
            setSettingsOpen(open);
            if (open) setStageName(stage.name);
          }}>
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

      {/* Docs da etapa */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : debriefings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum debriefing nesta etapa ainda. Suba o doc HTML da campanha.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo debriefing
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {debriefings.map((d) => (
            <DebriefingCard key={d.id} d={d} from={stagePath} />
          ))}
        </div>
      )}

      {/* Docs antigos sem etapa (legado do menu global) */}
      {unassigned.length > 0 && (
        <div className="space-y-3 border-t border-border/30 pt-5">
          <div>
            <h3 className="text-sm font-semibold">Debriefings sem etapa</h3>
            <p className="text-xs text-muted-foreground">
              Docs criados antes das etapas de Debriefing — traga os desta campanha pra cá.
            </p>
          </div>
          <div className="space-y-2">
            {unassigned.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
              >
                <Link href={`/debriefings/${d.id}?from=${encodeURIComponent(stagePath)}`} className="min-w-0 hover:underline">
                  <p className="truncate text-sm font-medium">{d.campaignName}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.authorName} · {format(new Date(d.createdAt), "dd MMM yyyy", { locale: ptBR })}
                    {" · "}
                    {d.commentCount} comentário{d.commentCount !== 1 ? "s" : ""}
                  </p>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 text-xs"
                  disabled={assignStage.isPending}
                  onClick={() => handleBringToStage(d)}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Trazer pra esta etapa
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateDebriefingDialog open={createOpen} onOpenChange={setCreateOpen} stageId={stage.id} />
    </div>
  );
}
