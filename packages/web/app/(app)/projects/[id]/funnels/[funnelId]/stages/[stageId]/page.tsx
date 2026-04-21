"use client";

import { useParams } from "next/navigation";
import { TrendingUp, Youtube, FileSpreadsheet, Table as TableIcon, Link2, Settings2 } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LaunchDashboard } from "@/components/funnels/launch-dashboard";
import { PerpetualDashboard } from "@/components/funnels/perpetual-dashboard";
import { YouTubeFunnelSection } from "@/components/funnels/youtube-funnel-section";
import { SurveyFunnelTab } from "@/components/funnels/survey-funnel-tab";
import { FunnelSpreadsheetsTab } from "@/components/funnels/funnel-spreadsheets-tab";
import { StageSalesSpreadsheetSection } from "@/components/funnels/stage-sales-spreadsheet-section";
import { SwitchyLinksTab } from "@/components/funnels/switchy-links-tab";
import { CampaignSelector } from "@/components/funnels/campaign-selector";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { useGoogleAdsCampaignPicker } from "@/lib/hooks/use-funnels";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Funnel, FunnelCampaign } from "@loyola-x/shared";

export default function StagePage() {
  const params = useParams<{ id: string; funnelId: string; stageId: string }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  const { data: stage, isLoading: stageLoading } = useFunnelStage(params.id, params.funnelId, params.stageId);
  const updateStage = useUpdateStage(params.id, params.funnelId, params.stageId);

  const { data: metaPicker } = useCampaignPicker(settingsOpen ? params.id : null);
  const { data: googlePicker } = useGoogleAdsCampaignPicker(settingsOpen ? params.id : null);

  const isLoading = funnelLoading || stageLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!funnelData || !stage) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Etapa não encontrada</p>
      </div>
    );
  }

  const { funnel, funnelType } = funnelData;

  // Monta um objeto Funnel mesclando config da etapa — dashboards recebem isso
  const stageAsFunnel: Funnel = {
    ...funnel,
    campaigns: stage.campaigns,
    metaAccountId: stage.metaAccountId,
    googleAdsAccountId: stage.googleAdsAccountId,
    googleAdsCampaigns: stage.googleAdsCampaigns,
    switchyFolderIds: stage.switchyFolderIds,
    switchyLinkedLinks: stage.switchyLinkedLinks,
  };

  const metaCount = stage.campaigns.length;
  const ytCount = stage.googleAdsCampaigns.length;

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage!.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnel.name}</p>
          <h1 className="text-2xl font-bold">{stage.name}</h1>
          <p className="text-sm text-muted-foreground">
            {funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"}
          </p>
        </div>

        <Sheet open={settingsOpen} onOpenChange={(open) => {
          setSettingsOpen(open);
          if (open) setStageName(stage.name);
        }}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Configurar Etapa
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Configurações da Etapa</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* Nome */}
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

              {/* Tipo de captação */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de captação</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "free" },
                        { onSuccess: () => toast.success("Tipo alterado para Gratuita") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      stage.stageType === "free"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Gratuita</span>
                    <span className="text-xs text-muted-foreground">Sem planilhas de vendas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "paid" },
                        { onSuccess: () => toast.success("Tipo alterado para Paga") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      stage.stageType === "paid"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Paga</span>
                    <span className="text-xs text-muted-foreground">Com planilhas de vendas</span>
                  </button>
                </div>
              </div>

              {/* Campanhas Meta */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Campanhas Meta Ads</Label>
                {metaPicker ? (
                  <CampaignSelector
                    campaigns={metaPicker.campaigns ?? []}
                    accountLinked={metaPicker.accountLinked}
                    value={stage.campaigns}
                    onChange={(campaigns: FunnelCampaign[]) => {
                      updateStage.mutate(
                        { campaigns },
                        { onSuccess: () => toast.success("Campanhas Meta atualizadas") }
                      );
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Carregando campanhas...</p>
                )}
              </div>

              {/* Campanhas Google Ads */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Campanhas Google Ads</Label>
                {googlePicker ? (
                  googlePicker.accountLinked ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {googlePicker.campaigns.map((c) => {
                        const isSelected = stage.googleAdsCampaigns.some((s) => s.id === c.id);
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm ${isSelected ? "bg-primary/10" : "hover:bg-muted"}`}
                            onClick={() => {
                              const current = stage.googleAdsCampaigns;
                              const updated = isSelected
                                ? current.filter((s) => s.id !== c.id)
                                : [...current, { id: c.id, name: c.name }];
                              updateStage.mutate(
                                { googleAdsCampaigns: updated },
                                { onSuccess: () => toast.success("Campanhas Google atualizadas") }
                              );
                            }}
                          >
                            <div className={`h-3 w-3 rounded-sm border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                              {isSelected && <span className="text-[8px] text-primary-foreground font-bold">✓</span>}
                            </div>
                            <span className="truncate">{c.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma conta Google Ads vinculada ao projeto.</p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Carregando campanhas...</p>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="meta-ads">
        <TabsList>
          <TabsTrigger value="meta-ads" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Meta Ads
            {metaCount > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{metaCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="youtube-ads" className="gap-1.5">
            <Youtube className="h-3.5 w-3.5 text-red-500" />
            YouTube Ads
            {ytCount > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{ytCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="surveys" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
            Pesquisas
          </TabsTrigger>
          <TabsTrigger value="spreadsheets" className="gap-1.5">
            <TableIcon className="h-3.5 w-3.5 text-blue-600" />
            Planilhas
          </TabsTrigger>
          <TabsTrigger value="switchy-links" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-purple-600" />
            Links
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meta-ads" className="mt-6">
          {funnelType === "launch" ? (
            <LaunchDashboard
              funnel={stageAsFunnel}
              projectId={params.id}
              stageId={params.stageId}
              stageType={stage.stageType}
              onCampaignsChange={(campaigns) => {
                updateStage.mutate(
                  { campaigns },
                  { onSuccess: () => toast.success("Campanhas atualizadas") }
                );
              }}
            />
          ) : (
            <PerpetualDashboard
              funnel={stageAsFunnel}
              projectId={params.id}
              stageId={params.stageId}
              stageType={stage.stageType}
              onCampaignsChange={(campaigns) => {
                updateStage.mutate(
                  { campaigns },
                  { onSuccess: () => toast.success("Campanhas atualizadas") }
                );
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="youtube-ads" className="mt-6">
          <YouTubeFunnelSection funnel={stageAsFunnel} projectId={params.id} days={30} />
        </TabsContent>

        <TabsContent value="surveys" className="mt-6">
          <SurveyFunnelTab projectId={params.id} funnelId={params.funnelId} />
        </TabsContent>

        <TabsContent value="spreadsheets" className="mt-6">
          <div className="space-y-6">
            {stage.stageType === "paid" && (
              <>
                <StageSalesSpreadsheetSection
                  projectId={params.id}
                  funnelId={params.funnelId}
                  stageId={params.stageId}
                  subtype="capture"
                  title="Captação"
                />
                <div className="border-t border-border/30" />
                <StageSalesSpreadsheetSection
                  projectId={params.id}
                  funnelId={params.funnelId}
                  stageId={params.stageId}
                  subtype="main_product"
                  title="Produto Principal"
                />
                <div className="border-t border-border/30" />
              </>
            )}
            <FunnelSpreadsheetsTab projectId={params.id} funnelId={params.funnelId} />
          </div>
        </TabsContent>

        <TabsContent value="switchy-links" className="mt-6">
          <SwitchyLinksTab projectId={params.id} funnel={stageAsFunnel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
