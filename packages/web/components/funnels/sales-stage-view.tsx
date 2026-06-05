"use client";

import { useState } from "react";
import { Settings2, BarChart3, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { MultiSalesSpreadsheets } from "./multi-sales-spreadsheets";
import { StageSalesSection } from "./stage-sales-section";
import { StageSalesSpreadsheetSection } from "./stage-sales-spreadsheet-section";
import { CampaignSelector } from "./campaign-selector";
import { SalesMetaKpis } from "./sales-meta-kpis";
import { SalesConversionCard } from "./sales-conversion-card";
import { ManualPixSalesSection } from "./manual-pix-sales-section";
import { ManualSaleDialog } from "./manual-sale-dialog";
import { useFunnelAdsetsMap } from "@/lib/hooks/use-funnel-adsets-map";
import { toast } from "sonner";
import type { FunnelCampaign, FunnelStage, ManualSale } from "@loyola-x/shared";

interface SalesStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

export function SalesStageView({ projectId, funnelId, funnelName, stage }: SalesStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [days, setDays] = useState(90);
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);

  const updateStage = useUpdateStage(projectId, funnelId, stage.id);

  // Etapa sales tem campanhas Meta próprias (vinculadas via settings) pra
  // calcular ROAS/CPA/CPL cruzando com a planilha de vendas.
  const campaignIds = stage.campaigns.map((c) => c.id);
  const { adsetsMap } = useFunnelAdsetsMap(projectId, campaignIds, days);
  const { data: metaPicker } = useCampaignPicker(settingsOpen ? projectId : null);

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              Vendas
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Etapa de vendas — apenas planilha, sem tráfego.</p>
        </div>

        <div className="flex items-center gap-2">
          <DayRangePicker days={days} onDaysChange={setDays} />

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setManualSaleOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Lançar venda manual
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

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Campanhas Meta Ads</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Vincule as campanhas que representam o investimento dessa etapa pra calcular ROAS, CPA e CPL.
                  </p>
                  {metaPicker ? (
                    <CampaignSelector
                      campaigns={metaPicker.campaigns ?? []}
                      accountLinked={metaPicker.accountLinked}
                      value={stage.campaigns}
                      onChange={(campaigns: FunnelCampaign[]) => {
                        updateStage.mutate(
                          { campaigns },
                          { onSuccess: () => toast.success("Campanhas atualizadas") },
                        );
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">Carregando campanhas...</p>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Tabs: Dashboard | Planilha */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
            Planilha
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6 space-y-6">
          <SalesMetaKpis
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            campaignIds={campaignIds}
            days={days}
          />
          <SalesConversionCard
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
          />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="main_product"
            title="Produto Principal"
            days={days}
            adsetsMap={adsetsMap}
          />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="capture"
            title="Produto de Captação"
            days={days}
            adsetsMap={adsetsMap}
          />
          <StageSalesSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="tmb"
            title="TMB"
            days={days}
            adsetsMap={adsetsMap}
          />
          <ManualPixSalesSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            days={days}
            onLaunchClick={() => setManualSaleOpen(true)}
            onEditSale={(sale) => {
              setEditingSale(sale);
              setManualSaleOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="spreadsheet" className="mt-6 space-y-4">
          <StageSalesSpreadsheetSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="capture"
            title="Produto de Captação"
          />
          <div className="border-t border-border/30" />
          <StageSalesSpreadsheetSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="main_product"
            title="Produto Principal"
          />
          <div className="border-t border-border/30" />
          <StageSalesSpreadsheetSection
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            subtype="tmb"
            title="TMB"
          />
          <div className="border-t border-border/30 pt-4" />
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
              Outras planilhas (avançado)
            </summary>
            <div className="mt-3">
              <MultiSalesSpreadsheets
                projectId={projectId}
                funnelId={funnelId}
                stageId={stage.id}
              />
            </div>
          </details>
        </TabsContent>
      </Tabs>

      <ManualSaleDialog
        projectId={projectId}
        funnelId={funnelId}
        stageId={stage.id}
        open={manualSaleOpen}
        onOpenChange={(open) => {
          setManualSaleOpen(open);
          if (!open) setEditingSale(null);
        }}
        editingSale={editingSale}
      />
    </div>
  );
}
