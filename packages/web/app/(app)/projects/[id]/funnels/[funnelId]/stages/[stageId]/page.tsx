"use client";

import { useParams } from "next/navigation";
import { TrendingUp, Youtube, FileSpreadsheet, Table as TableIcon, Link2, Settings2, Brain, Sparkles, Mail, BarChart3, Star, FlaskConical, FileBarChart2, Video, Target } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LaunchDashboard } from "@/components/funnels/launch-dashboard";
import { MetaAdsTesteTab } from "@/components/funnels/meta-ads-teste-section";
import { PerpetualDashboard } from "@/components/funnels/perpetual-dashboard";
import { PerpetualMvpAnalysis } from "@/components/funnels/perpetual-mvp-analysis";
import { YouTubeFunnelSection } from "@/components/funnels/youtube-funnel-section";
import { SurveyFunnelTab } from "@/components/funnels/survey-funnel-tab";
import { FunnelSpreadsheetsTab } from "@/components/funnels/funnel-spreadsheets-tab";
import { StageSalesSpreadsheetSection } from "@/components/funnels/stage-sales-spreadsheet-section";
import { SalesStageView } from "@/components/funnels/sales-stage-view";
import { EventStageView } from "@/components/funnels/event-stage-view";
import { DebriefingStageView } from "@/components/funnels/debriefing-stage-view";
import { ComercialStageView } from "@/components/funnels/comercial-stage-view";
import { LyrioStageView } from "@/components/funnels/lyrio-stage-view";
import { ManualPixSalesSection } from "@/components/funnels/manual-pix-sales-section";
import { ManualSaleDialog } from "@/components/funnels/manual-sale-dialog";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { GroupsSpreadsheetCard } from "@/components/funnels/groups-spreadsheet-card";
import { SwitchyLinksTab } from "@/components/funnels/switchy-links-tab";
import { SwitchyFunnelSection } from "@/components/funnels/switchy-funnel-section";
import { LeadScoringTab } from "@/components/funnels/lead-scoring-tab";
import { OrganicMediaTab } from "@/components/funnels/organic-media-tab";
import { CplStageView } from "@/components/funnels/cpl-stage-view";
import { LaunchReportConfigSection } from "@/components/funnels/launch-report-config-section";
import { PerpetualReportConfigSection } from "@/components/funnels/perpetual-report-config-section";
import { MauticStageTab } from "@/components/funnels/mautic-stage-tab";
import { VturbStageTab } from "@/components/funnels/vturb-stage-tab";
import { Ga4StageTab } from "@/components/funnels/ga4-stage-tab";
import { NpsStageTab } from "@/components/funnels/nps-stage-tab";
import { AuditStatusBadge } from "@/components/funnels/audit-status-badge";
import { StageDeleteSection } from "@/components/funnels/stage-delete-section";
import { CampaignLogButton } from "@/components/funnels/campaign-log-link";
import { OrphanCampaignsBanner } from "@/components/funnels/orphan-campaigns-banner";
import { CampaignSelector } from "@/components/funnels/campaign-selector";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { useGoogleAdsCampaignPicker } from "@/lib/hooks/use-funnels";
import { GoogleAdsCampaignSelector } from "@/components/funnels/google-ads-campaign-selector";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Funnel, FunnelCampaign, ManualSale } from "@loyola-x/shared";

export default function StagePage() {
  const params = useParams<{ id: string; funnelId: string; stageId: string }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Story 41.1: Tabs passou a ser controlado pra permitir que a config de
  // relatório leve o usuário direto ao wizard de Planilhas (order bumps).
  const [activeTab, setActiveTab] = useState("meta-ads");
  const [stageName, setStageName] = useState("");
  // Vendas da captação paga (lançamento manual) — só usado quando stageType === "paid".
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);
  const [paidSalesDays, setPaidSalesDays] = useState(90);

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

  // Etapa do tipo "sales" tem dashboard simplificado próprio — só vendas, sem
  // tabs/tráfego/leads. Render dedicado.
  if (stage.stageType === "sales") {
    return (
      <SalesStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

  // Etapa do tipo "cpl" — foco em retenção de reuniões Zoom. Render dedicado.
  if (stage.stageType === "cpl") {
    return (
      <CplStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

  // Story 19.10: etapa "event" (Evento Presencial) — vendas + MemberKit. Render dedicado.
  if (stage.stageType === "event") {
    return (
      <EventStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

  // Epic 37: etapa "debriefing" — docs de debriefing da campanha. Render dedicado.
  if (stage.stageType === "debriefing") {
    return (
      <DebriefingStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

  // Epic 40: etapa "comercial" — CRM kanban de compradores. Render dedicado.
  if (stage.stageType === "comercial") {
    return (
      <ComercialStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

  // Etapa "lyrio" — app mobile: conversões Meta + vendas RevenueCat. Render dedicado.
  if (stage.stageType === "lyrio") {
    return (
      <LyrioStageView
        projectId={params.id}
        funnelId={params.funnelId}
        funnelName={funnel.name}
        stage={stage}
      />
    );
  }

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
      {/* Header — pra perpetual, esconde noção de stage (1 dashboard só) */}
      <div className="flex items-center justify-between">
        <div>
          {funnelType !== "perpetual" && (
            <p className="text-xs text-muted-foreground mb-0.5">{funnel.name}</p>
          )}
          <h1 className="text-2xl font-bold">
            {funnelType === "perpetual" ? funnel.name : stage.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {funnelType === "launch" ? "Funil de Lançamento" : "Funil Perpétuo"}
          </p>
        </div>

        <div className="flex items-center gap-2">
        <CampaignLogButton projectId={params.id} funnelId={params.funnelId} />
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

              {/* Tipo de etapa */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de etapa</Label>
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
                      (stage.stageType as string) === "free"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Gratuita</span>
                    <span className="text-xs text-muted-foreground">Captação orgânica</span>
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
                      (stage.stageType as string) === "paid"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Paga</span>
                    <span className="text-xs text-muted-foreground">Captação + tráfego</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "sales" },
                        { onSuccess: () => toast.success("Tipo alterado para Vendas") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "sales"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Vendas</span>
                    <span className="text-xs text-muted-foreground">Só planilha de vendas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "cpl" },
                        { onSuccess: () => toast.success("Tipo alterado para CPL") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "cpl"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">CPL</span>
                    <span className="text-xs text-muted-foreground">Reuniões Zoom + retenção</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "event" },
                        { onSuccess: () => toast.success("Tipo alterado para Evento Presencial") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "event"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Evento Presencial</span>
                    <span className="text-xs text-muted-foreground">Vendas no local + MemberKit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "debriefing" },
                        { onSuccess: () => toast.success("Tipo alterado para Debriefing") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "debriefing"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Debriefing</span>
                    <span className="text-xs text-muted-foreground">Docs HTML + comentários</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "comercial" },
                        { onSuccess: () => toast.success("Tipo alterado para Comercial") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "comercial"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Comercial</span>
                    <span className="text-xs text-muted-foreground">CRM kanban de compradores</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "lyrio" },
                        { onSuccess: () => toast.success("Tipo alterado para Lyrio") }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "lyrio"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">Lyrio</span>
                    <span className="text-xs text-muted-foreground">App mobile — Meta + RevenueCat</span>
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
                  <GoogleAdsCampaignSelector
                    campaigns={googlePicker.campaigns}
                    accountLinked={googlePicker.accountLinked}
                    value={stage.googleAdsCampaigns}
                    onChange={(googleAdsCampaigns) => {
                      updateStage.mutate(
                        { googleAdsCampaigns },
                        { onSuccess: () => toast.success("Campanhas Google atualizadas") }
                      );
                    }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Carregando campanhas...</p>
                )}
              </div>

              <StageDeleteSection
                projectId={params.id}
                funnelId={params.funnelId}
                stageId={params.stageId}
                stageName={stage.name}
              />
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </div>

      {/* Audit Status - Top Right */}
      <div className="mb-4 flex justify-end">
        <AuditStatusBadge stageId={params.stageId} funnelId={params.funnelId} projectId={params.id} />
      </div>

      {/* Banner de campanhas órfãs nesta etapa (Epic 25) */}
      <OrphanCampaignsBanner
        projectId={params.id}
        funnelId={params.funnelId}
        stageId={params.stageId}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="meta-ads" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Meta Ads
            {metaCount > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">{metaCount}</span>
            )}
          </TabsTrigger>
          {/* Story 29.35: aba do protocolo de CAC. Imediatamente à direita de
              Meta Ads e só no perpétuo — funil de lançamento tem outro
              dashboard e outra matemática. */}
          {funnelType === "perpetual" && (
            <TabsTrigger value="analise-mvp" className="gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" />
              Análise MVP
            </TabsTrigger>
          )}
          {funnelType === "launch" && (stage.stageType as string) === "paid" && (
            <TabsTrigger value="meta-ads-teste" className="gap-1.5">
              <FlaskConical className="h-3.5 w-3.5 text-cyan-400" />
              Meta Ads TESTE
            </TabsTrigger>
          )}
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
          <TabsTrigger value="lead-scoring" className="gap-1.5">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Lead Scoring
          </TabsTrigger>
          <TabsTrigger value="organic-media" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Mídias Orgânicas
          </TabsTrigger>
          <TabsTrigger value="mautic" className="gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" />
            Mautic
          </TabsTrigger>
          <TabsTrigger value="ga4" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-orange-500" />
            GA4
          </TabsTrigger>
          <TabsTrigger value="vturb" className="gap-1.5">
            <Video className="h-3.5 w-3.5 text-violet-500" />
            VSL
          </TabsTrigger>
          <TabsTrigger value="nps" className="gap-1.5">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            NPS
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <FileBarChart2 className="h-3.5 w-3.5 text-primary" />
            Relatórios
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

          {/* Vendas da captação: lançamento de venda manual + tabela unificada.
              Vive DENTRO da aba Meta Ads — antes ficava fora do <Tabs> e por
              isso aparecia embaixo de todas as abas (NPS, GA4, Planilhas...).
              Etapas "paid" (Captação Paga) e "free" (Gratuita). */}
          {(stage.stageType === "paid" || stage.stageType === "free") && (
            <div className="mt-2">
              <div className="mb-2 flex justify-end">
                <DayRangePicker days={paidSalesDays} onDaysChange={setPaidSalesDays} />
              </div>
              <ManualPixSalesSection
                projectId={params.id}
                funnelId={params.funnelId}
                stageId={params.stageId}
                days={paidSalesDays}
                onLaunchClick={() => setManualSaleOpen(true)}
                onEditSale={(sale) => {
                  setEditingSale(sale);
                  setManualSaleOpen(true);
                }}
              />
            </div>
          )}
        </TabsContent>

        {funnelType === "launch" && (stage.stageType as string) === "paid" && (
          <TabsContent value="meta-ads-teste" className="mt-6">
            <MetaAdsTesteTab
              funnel={stageAsFunnel}
              projectId={params.id}
              stageId={params.stageId}
              stageType={stage.stageType}
            />
          </TabsContent>
        )}

        {/* Story 29.35: só monta no perpétuo — o componente consome hooks de
            config e vendas que não existem no funil de lançamento. */}
        {funnelType === "perpetual" && (
          <TabsContent value="analise-mvp" className="mt-6">
            <PerpetualMvpAnalysis
              funnel={stageAsFunnel}
              projectId={params.id}
              days={paidSalesDays}
            />
          </TabsContent>
        )}

        <TabsContent value="youtube-ads" className="mt-6">
          <YouTubeFunnelSection funnel={stageAsFunnel} projectId={params.id} days={30} />
        </TabsContent>

        <TabsContent value="surveys" className="mt-6">
          <div className="space-y-8">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  Pesquisa
                </h3>
                <p className="text-xs text-muted-foreground">Respostas de leads captados via tráfego pago.</p>
              </div>
              <SurveyFunnelTab
                projectId={params.id}
                funnelId={params.funnelId}
                stageId={params.stageId}
                surveyType="paid"
              />
            </section>

            <div className="border-t border-border/30" />

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Pesquisa Orgânica
                </h3>
                <p className="text-xs text-muted-foreground">Respostas de alunos / pessoas não captadas via tráfego pago.</p>
              </div>
              <SurveyFunnelTab
                projectId={params.id}
                funnelId={params.funnelId}
                stageId={params.stageId}
                surveyType="organic"
              />
            </section>
          </div>
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
            <FunnelSpreadsheetsTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
            <div className="border-t border-border/30" />
            <GroupsSpreadsheetCard projectId={params.id} funnelId={params.funnelId} />
          </div>
        </TabsContent>

        <TabsContent value="switchy-links" className="mt-6">
          <div className="space-y-6">
            {/* Gerador de links UTM atrelado ao funil — disponível também aqui
                na etapa pra preencher/gerar no mesmo lugar da tabela. */}
            <SwitchyFunnelSection
              projectId={params.id}
              funnelId={params.funnelId}
              funnelName={funnel.name}
            />
            <SwitchyLinksTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} funnel={stageAsFunnel} />
          </div>
        </TabsContent>

        <TabsContent value="lead-scoring" className="mt-6">
          <LeadScoringTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
        </TabsContent>

        <TabsContent value="organic-media" className="mt-6">
          <OrganicMediaTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
        </TabsContent>

        <TabsContent value="mautic" className="mt-6">
          <MauticStageTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
        </TabsContent>

        <TabsContent value="ga4" className="mt-6">
          <Ga4StageTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
        </TabsContent>

        {/* VTurb: analytics da VSL da etapa — retenção, pitch e conversão. */}
        <TabsContent value="vturb" className="mt-6">
          <VturbStageTab projectId={params.id} stageId={params.stageId} />
        </TabsContent>

        <TabsContent value="nps" className="mt-6">
          <NpsStageTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
        </TabsContent>

        {/* Story 41.1 — config do gerador de Resumão/Comparativo */}
        <TabsContent value="relatorios" className="mt-6">
          {/* Story 41.7: perpétuo tem config própria (por funil, sem etapas) —
              o botão 3 é um relatório diferente do Resumão/Comparativo. */}
          {funnelType === "perpetual" ? (
            <PerpetualReportConfigSection
              projectId={params.id}
              funnelId={params.funnelId}
            />
          ) : (
            <LaunchReportConfigSection
              projectId={params.id}
              funnelId={params.funnelId}
              stageId={params.stageId}
              onOpenSpreadsheets={() => setActiveTab("spreadsheets")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de venda manual fica FORA do <Tabs>: é overlay controlado por
          estado, não conteúdo de aba — desmontá-lo na troca de aba fecharia o
          formulário no meio do preenchimento. */}
      {(stage.stageType === "paid" || stage.stageType === "free") && (
        <ManualSaleDialog
          projectId={params.id}
          funnelId={params.funnelId}
          stageId={params.stageId}
          open={manualSaleOpen}
          onOpenChange={(open) => {
            setManualSaleOpen(open);
            if (!open) setEditingSale(null);
          }}
          editingSale={editingSale}
        />
      )}
    </div>
  );
}
