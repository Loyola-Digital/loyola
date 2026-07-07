"use client";

import { useState } from "react";
import { Settings2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { ZoomStageTab } from "./zoom-stage-tab";
import { StageDeleteSection } from "./stage-delete-section";
import { MauticStageTab } from "./mautic-stage-tab";
import { toast } from "sonner";
import type { FunnelStage } from "@loyola-x/shared";

interface CplStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

/**
 * Página de etapa do tipo "CPL". Foco em retenção de reuniões Zoom — cada
 * etapa CPL tem sua própria conexão Zoom + N reuniões vinculadas + dashboard
 * de retenção por participante.
 */
export function CplStageView({ projectId, funnelId, funnelName, stage }: CplStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const updateStage = useUpdateStage(projectId, funnelId, stage.id);

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 flex items-center gap-1">
              <Video className="h-3 w-3" />
              CPL
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Etapa CPL — retenção de reuniões Zoom.</p>
        </div>

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

      <ZoomStageTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
      <MauticStageTab projectId={projectId} funnelId={funnelId} stageId={stage.id} />
    </div>
  );
}
