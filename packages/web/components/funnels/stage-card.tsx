"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, TrendingUp, Youtube, Pencil, Trash2, CreditCard, Gift, DollarSign, Video, CalendarDays, FileText, Handshake, Ticket, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpdateStage, useDeleteStage } from "@/lib/hooks/use-funnel-stages";
import { rotuloDoTipoDeEtapa } from "@/lib/utils/rotulos-de-etapa";
import { toast } from "sonner";
import type { FunnelStage } from "@loyola-x/shared";

interface StageCardProps {
  stage: FunnelStage;
  projectId: string;
  funnelId: string;
  isLastStage: boolean;
  /**
   * Story 19.15 — o tipo do FUNIL, não o da etapa.
   *
   * O card precisa dele porque `free` se chama "Perpétuo" num funil perpétuo e
   * "Gratuita" nos demais. Sem esta prop a lista de etapas diria "Gratuita"
   * enquanto a tela de edição diz "Perpétuo", na mesma navegação.
   */
  funnelType?: string | null;
}

export function StageCard({ stage, projectId, funnelId, isLastStage, funnelType }: StageCardProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(stage.name);

  const updateStage = useUpdateStage(projectId, funnelId, stage.id);
  const deleteStage = useDeleteStage(projectId, funnelId);

  function handleNavigate() {
    router.push(`/projects/${projectId}/funnels/${funnelId}/stages/${stage.id}`);
  }

  async function handleRename() {
    if (!newName.trim() || newName.trim() === stage.name) {
      setRenameOpen(false);
      return;
    }
    await updateStage.mutateAsync({ name: newName.trim() });
    toast.success("Etapa renomeada");
    setRenameOpen(false);
  }

  async function handleDelete() {
    await deleteStage.mutateAsync(stage.id);
    toast.success("Etapa removida");
    setDeleteOpen(false);
  }

  const metaCount = stage.campaigns.length;
  const googleCount = stage.googleAdsCampaigns.length;
  const switchyCount = stage.switchyLinkedLinks.length;

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow group"
        onClick={handleNavigate}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-semibold text-sm truncate">{stage.name}</p>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  stage.stageType === "paid" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : stage.stageType === "application" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                  : stage.stageType === "sales" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : stage.stageType === "cpl" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                  : stage.stageType === "event" ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400"
                  : stage.stageType === "event_capture" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  : stage.stageType === "debriefing" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                  : stage.stageType === "comercial" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
                  : stage.stageType === "mapa" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                }`}>
                  {rotuloDoTipoDeEtapa(stage.stageType, funnelType).titulo}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {stage.stageType === "mapa" ? (
                  // Mapa não tem métrica: o card diz o que a etapa é, em vez de
                  // cair no texto de captação e prometer número que não existe.
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Map className="h-3 w-3 shrink-0 text-violet-600" />
                    <span>Desenho do funil</span>
                  </div>
                ) : stage.stageType === "sales" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3 shrink-0 text-emerald-600" />
                    <span>Etapa de vendas</span>
                  </div>
                ) : stage.stageType === "cpl" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Video className="h-3 w-3 shrink-0 text-sky-500" />
                    <span>Reuniões Zoom</span>
                  </div>
                ) : stage.stageType === "event" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3 shrink-0 text-fuchsia-500" />
                    <span>Evento presencial · vendas + MemberKit</span>
                  </div>
                ) : stage.stageType === "event_capture" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ticket className="h-3 w-3 shrink-0 text-rose-500" />
                    <span>Captação de evento · tráfego + ingressos</span>
                  </div>
                ) : stage.stageType === "debriefing" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3 shrink-0 text-indigo-500" />
                    <span>Debriefings da campanha</span>
                  </div>
                ) : stage.stageType === "comercial" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Handshake className="h-3 w-3 shrink-0 text-cyan-500" />
                    <span>CRM · kanban de compradores</span>
                  </div>
                ) : (
                  <>
                    {metaCount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3 shrink-0" />
                        <span>Meta: {metaCount} campanha{metaCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {googleCount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Youtube className="h-3 w-3 shrink-0" />
                        <span>Google: {googleCount} campanha{googleCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {switchyCount > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="text-purple-500 font-bold text-[10px]">S</span>
                        <span>Switchy: {switchyCount} link{switchyCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {metaCount === 0 && googleCount === 0 && switchyCount === 0 && (
                      <p className="text-xs text-muted-foreground">Sem configuração</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setNewName(stage.name); setRenameOpen(true); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Renomear
                  </DropdownMenuItem>
                  {/* O atalho Paga/Gratuita só vale para etapas de captação.
                      Numa etapa de Mapa (ou Vendas, CPL, Evento…) ele ofereceria
                      uma troca que destrói o sentido da etapa. */}
                  {!["sales", "cpl", "event", "event_capture", "debriefing", "comercial", "mapa"].includes(
                    stage.stageType as string,
                  ) && (
                    <DropdownMenuItem
                      onClick={() => {
                        const newType = stage.stageType === "paid" ? "free" : "paid";
                        updateStage.mutate(
                          { stageType: newType },
                          {
                            onSuccess: () =>
                              toast.success(
                                `Etapa alterada para ${rotuloDoTipoDeEtapa(newType, funnelType).titulo}`
                              ),
                          }
                        );
                      }}
                    >
                      {stage.stageType === "paid" ? (
                        <>
                          <Gift className="h-4 w-4 mr-2" />
                          Alterar para {rotuloDoTipoDeEtapa("free", funnelType).titulo}
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4 mr-2" />
                          Alterar para {rotuloDoTipoDeEtapa("paid", funnelType).titulo}
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <DropdownMenuItem
                            onClick={() => !isLastStage && setDeleteOpen(true)}
                            disabled={isLastStage}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Deletar
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>
                      {isLastStage && (
                        <TooltipContent>
                          Mínimo de 1 etapa por funil
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Renomear */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="stage-name">Nome</Label>
            <Input
              id="stage-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename} disabled={updateStage.isPending || !newName.trim()}>
              {updateStage.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Deletar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa <strong>{stage.name}</strong> será removida permanentemente. Essa ação não pode ser desfeita.
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
    </>
  );
}
