"use client";

import { useParams } from "next/navigation";
// Story 46.1 — os ícones das abas mudaram de casa: agora vivem na config em
// `lib/utils/menu-de-abas.ts`. Aqui ficaram só os que o resto da página usa.
import { FileSpreadsheet, Settings2, Sparkles } from "lucide-react";
import { useFunnel } from "@/lib/hooks/use-funnels";
import { useFunnelStage, useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { Skeleton } from "@/components/ui/skeleton";
import { useTituloDaAba } from "@/components/layout/titulo-da-aba";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import { MapStageView } from "@/components/funnels/map-stage-view";
import { DebriefingStageView } from "@/components/funnels/debriefing-stage-view";
import { ComercialStageView } from "@/components/funnels/comercial-stage-view";
import { LyrioStageView } from "@/components/funnels/lyrio-stage-view";
import { ManualPixSalesSection } from "@/components/funnels/manual-pix-sales-section";
import { ManualSaleDialog } from "@/components/funnels/manual-sale-dialog";
import { ReceiptUploadDialog } from "@/components/funnels/receipt-upload-dialog";
import type { DadosComprovante } from "@/lib/hooks/use-receipt-extract";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { GroupsSpreadsheetCard } from "@/components/funnels/groups-spreadsheet-card";
import { SwitchyLinksTab } from "@/components/funnels/switchy-links-tab";
import { SwitchyFunnelSection } from "@/components/funnels/switchy-funnel-section";
import { LeadScoringTab } from "@/components/funnels/lead-scoring-tab";
import { OrganicMediaTab } from "@/components/funnels/organic-media-tab";
import { ApplicationStageView } from "@/components/funnels/application-stage-view";
import { CplStageView } from "@/components/funnels/cpl-stage-view";
import { LaunchReportConfigSection } from "@/components/funnels/launch-report-config-section";
import { PerpetualReportConfigSection } from "@/components/funnels/perpetual-report-config-section";
import { MauticStageTab } from "@/components/funnels/mautic-stage-tab";
import { VslCollapsibleSection } from "@/components/funnels/vsl-collapsible-section";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Funnel, FunnelCampaign, ManualSale } from "@loyola-x/shared";
import { ehCaptacaoPaga } from "@loyola-x/shared/src/stage-types";
import { classificarFamilia } from "@loyola-x/shared/src/cadeia-cac";
import { CadeiaCacStageTab } from "@/components/funnels/cadeia-cac-stage-tab";
import { PanoramaDoProjeto } from "@/components/funnels/panorama-do-projeto";
import { StageTabsNav } from "@/components/funnels/stage-tabs-nav";
import { montarMenuDeAbas, resolverAbaAtiva } from "@/lib/utils/menu-de-abas";
import { rotuloDoTipoDeEtapa } from "@/lib/utils/rotulos-de-etapa";

export default function StagePage() {
  const params = useParams<{ id: string; funnelId: string; stageId: string }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Story 41.1: Tabs passou a ser controlado pra permitir que a config de
  // relatório leve o usuário direto ao wizard de Planilhas (order bumps).
  //
  // Story 46.1: a aba ativa passou a viver na URL (`?tab=`), então deixou de ser
  // um estado só. `abaEscolhida` é o clique do usuário nesta sessão;
  // `abaSolicitada` é o que veio no link. O valor final sai de
  // `resolverAbaAtiva()`, que valida os dois contra o menu DESTA etapa — um
  // link de `?tab=cadeia-cac` aberto numa etapa `lyrio` cai no default em vez
  // de deixar o `<Tabs>` sem conteúdo.
  const [abaEscolhida, setAbaEscolhida] = useState<string | null>(null);
  const [abaSolicitada, setAbaSolicitada] = useState<string | null>(null);

  // Lido de `window.location` e não de `useSearchParams` — mesmo motivo já
  // registrado em `debriefings/[id]/page.tsx:79`: o hook exigiria envolver a
  // página inteira num `<Suspense>` para o build passar.
  //
  // ⚠️ QA-451-01 — as deps são `[params.stageId]`, e NÃO `[]`.
  //
  // No App Router, trocar de etapa pela sidebar muda só o parâmetro dinâmico da
  // MESMA rota: os dois estados sobreviviam, e com deps `[]` o `?tab=` nunca era
  // relido. Resultado: a tela ficava na aba da etapa anterior e a URL não
  // descrevia o que estava na tela — o inverso exato do que a AC5 promete.
  //
  // Zerar `abaEscolhida` junto é parte do conserto: a escolha de clique vale
  // para a etapa em que foi feita. Mantê-la faria a etapa nova abrir na aba que
  // o usuário escolheu na anterior, mesmo com `?tab=` dizendo outra coisa.
  //
  // `trocarAba` usa `history.replaceState`, que não mexe em `params.stageId` —
  // então trocar de aba não redispara este efeito.
  useEffect(() => {
    setAbaEscolhida(null);
    setAbaSolicitada(new URLSearchParams(window.location.search).get("tab"));
  }, [params.stageId]);
  const [stageName, setStageName] = useState("");
  // Vendas da captação paga (lançamento manual) — só usado quando stageType === "paid".
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  // Captação de Evento: comprovante lido pela IA vira rascunho da venda.
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPrefill, setReceiptPrefill] = useState<DadosComprovante | null>(null);
  /** O arquivo lido, para ser guardado junto da venda depois de confirmada. */
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);
  const [paidSalesDays, setPaidSalesDays] = useState(90);

  const { data: funnelData, isLoading: funnelLoading } = useFunnel(params.id, params.funnelId);
  const { data: stage, isLoading: stageLoading } = useFunnelStage(params.id, params.funnelId, params.stageId);
  const updateStage = useUpdateStage(params.id, params.funnelId, params.stageId);

  /**
   * A aba diz o funil E a etapa.
   *
   * Só o nome da etapa não bastaria: "Vendas" e "Captação" se repetem em todo
   * funil, e três abas abertas voltariam a ser indistinguíveis. O funil na
   * frente é o que separa `bbe-fh · Vendas` de `dg-pg04 · Vendas`.
   *
   * No perpétuo a etapa costuma ter o nome do próprio funil; repetir os dois
   * daria "bbe-fh · bbe-fh".
   */
  const nomeDoFunil = funnelData?.funnel.name;
  const nomeDaEtapa = stage?.name;
  useTituloDaAba(
    nomeDoFunil && nomeDaEtapa && nomeDaEtapa !== nomeDoFunil
      ? `${nomeDoFunil} · ${nomeDaEtapa}`
      : (nomeDaEtapa ?? nomeDoFunil),
  );

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

  /**
   * A Captação de Evento é a Captação Paga com venda de INGRESSO no lugar da
   * venda de produto: tudo que hoje liga por "paid" — tráfego, planilhas de
   * venda, lançamento manual — vale pra ela igual.
   *
   * Story 19.14: era esta mesma regra escrita à mão aqui. A cópia local não era
   * o problema — o problema é que ela parava nesta linha: a página normalizava
   * o tipo para decidir o que renderizar, mas passava `stage.stageType` cru
   * para o `LaunchDashboard`, que voltava a comparar com "paid" literal em 28
   * pontos. Agora as duas pontas leem a mesma função.
   */
  const ehCaptacaoPagaStage = ehCaptacaoPaga(stage.stageType);
  /** Rótulos mudam de "produto" pra "ingresso" na Captação de Evento. */
  const ehCaptacaoDeEvento = (stage.stageType as string) === "event_capture";

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

  // Etapa "application" — formulário de aplicação: quem se aplicou, quem
  // comprou, e de qual origem. Render dedicado: o dashboard de captação paga
  // responde outra pergunta e mostraria campos que aqui não existem.
  if ((stage.stageType as string) === "application") {
    return (
      <ApplicationStageView
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

  // Etapa "mapa" — o desenho do funil. Sem KPI, sem tráfego, sem planilha: a
  // tela inteira é o quadro, então render dedicado como as demais especiais.
  if ((stage.stageType as string) === "mapa") {
    return (
      <MapStageView
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

  /**
   * Story 46.1 — a árvore de abas desta etapa. A elegibilidade que antes era
   * `&&` inline em cada `<TabsTrigger>` agora vive em `montarMenuDeAbas()`, que
   * é puro e testado. `classificarFamilia` continua sendo chamada aqui: é a
   * função da 44.9 e mora no shared.
   */
  const menuDeAbas = montarMenuDeAbas({
    funnelType,
    ehCaptacaoPagaStage,
    familiaCadeiaCac: classificarFamilia(stage.stageType),
  });
  const activeTab = resolverAbaAtiva(menuDeAbas, abaEscolhida ?? abaSolicitada);

  /**
   * Troca de aba: estado + URL. `replaceState` e não `push` porque 14 abas
   * empilhando histórico transformam o botão voltar em lixo — e é o que a AC5
   * pede. Não passa pelo router do Next de propósito: `router.replace` faria
   * uma navegação de verdade a cada clique de aba.
   */
  function trocarAba(value: string) {
    setAbaEscolhida(value);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

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
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("free", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "free"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("free", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("free", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "paid" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("paid", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "paid"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("paid", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("paid", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "application" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("application", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "application"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("application", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("application", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "sales" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("sales", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "sales"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("sales", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("sales", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "cpl" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("cpl", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "cpl"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("cpl", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("cpl", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "event" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("event", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "event"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("event", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("event", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "event_capture" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("event_capture", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "event_capture"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("event_capture", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("event_capture", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "debriefing" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("debriefing", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "debriefing"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("debriefing", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("debriefing", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "mapa" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("mapa", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "mapa"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("mapa", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("mapa", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "comercial" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("comercial", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "comercial"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("comercial", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("comercial", funnelType).descricao}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateStage.mutate(
                        { stageType: "lyrio" },
                        { onSuccess: () => toast.success(`Tipo alterado para ${rotuloDoTipoDeEtapa("lyrio", funnelType).titulo}`) }
                      );
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-md border p-3 text-sm gap-1 transition-colors",
                      (stage.stageType as string) === "lyrio"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{rotuloDoTipoDeEtapa("lyrio", funnelType).titulo}</span>
                    <span className="text-xs text-muted-foreground">{rotuloDoTipoDeEtapa("lyrio", funnelType).descricao}</span>
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
                    error={googlePicker.error}
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
      <Tabs value={activeTab} onValueChange={trocarAba}>
        {/* Story 46.1 — os 14 gatilhos soltos viraram 5 grupos. A árvore vem de
            `montarMenuDeAbas()`; o `<StageTabsNav>` só desenha. */}
        <StageTabsNav
          menu={menuDeAbas}
          activeTab={activeTab}
          onChange={trocarAba}
          badges={{ meta: metaCount, youtube: ytCount }}
        />

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
          {(ehCaptacaoPagaStage || stage.stageType === "free") && (
            <div className="mt-2">
              <div className="mb-2 flex justify-end">
                <DayRangePicker days={paidSalesDays} onDaysChange={setPaidSalesDays} />
              </div>
              <ManualPixSalesSection
                projectId={params.id}
                funnelId={params.funnelId}
                stageId={params.stageId}
                days={paidSalesDays}
                isTicket={ehCaptacaoDeEvento}
                onUploadReceipt={ehCaptacaoDeEvento ? () => setReceiptOpen(true) : undefined}
                onLaunchClick={() => {
                  // Lançamento à mão começa do zero — um rascunho de comprovante
                  // anterior não pode reaparecer aqui.
                  setReceiptPrefill(null);
                  setManualSaleOpen(true);
                }}
                onEditSale={(sale) => {
                  setEditingSale(sale);
                  setManualSaleOpen(true);
                }}
              />
            </div>
          )}

          {/* VSL (VTurb): retenção, play rate e ponto de pitch. Vive aqui, no
              dash principal, em vez de uma aba própria — recolhido por padrão
              pra não gastar cota da Analytics API de quem só veio ver Meta. */}
          <VslCollapsibleSection projectId={params.id} stageId={params.stageId} />
        </TabsContent>

        {funnelType === "launch" && ehCaptacaoPagaStage && (
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
            {ehCaptacaoPagaStage && (
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

        <TabsContent value="cadeia-cac" className="mt-6">
          <CadeiaCacStageTab projectId={params.id} stageId={params.stageId} />
        </TabsContent>

        {/* Story 46.1 — o Panorama saiu de cima da cadeia e virou irmã dela.
            Os dois disputavam a mesma tela desde a 44.21: quem abria para olhar
            UMA etapa rolava por cima do panorama do expert inteiro. */}
        <TabsContent value="panorama" className="mt-6">
          <PanoramaDoProjeto projectId={params.id} stageId={params.stageId} />
        </TabsContent>

        <TabsContent value="ga4" className="mt-6">
          <Ga4StageTab projectId={params.id} funnelId={params.funnelId} stageId={params.stageId} />
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
            /* AC6 — "Planilhas" agora é filha de "Dados": o salto precisa abrir
               o grupo e refletir na URL como qualquer outra troca. `trocarAba`
               faz as duas coisas; o grupo é derivado do filho. */
            <LaunchReportConfigSection
              projectId={params.id}
              funnelId={params.funnelId}
              stageId={params.stageId}
              onOpenSpreadsheets={() => trocarAba("spreadsheets")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de venda manual fica FORA do <Tabs>: é overlay controlado por
          estado, não conteúdo de aba — desmontá-lo na troca de aba fecharia o
          formulário no meio do preenchimento. */}
      {(ehCaptacaoPagaStage || stage.stageType === "free") && (
        <ManualSaleDialog
          projectId={params.id}
          funnelId={params.funnelId}
          stageId={params.stageId}
          open={manualSaleOpen}
          onOpenChange={(open) => {
            setManualSaleOpen(open);
            if (!open) {
              setEditingSale(null);
              setReceiptPrefill(null);
              setReceiptFile(null);
            }
          }}
          editingSale={editingSale}
          isTicket={ehCaptacaoDeEvento}
          prefill={receiptPrefill}
          receiptFile={receiptFile}
        />
      )}

      {/* Leitura de comprovante — só na Captação de Evento, onde a venda é de
          ingresso lançado na correria do evento. */}
      {ehCaptacaoDeEvento && (
        <ReceiptUploadDialog
          projectId={params.id}
          funnelId={params.funnelId}
          stageId={params.stageId}
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          onConfirmar={(dados, arquivo) => {
            // Abre o formulário já preenchido: a gravação continua sendo do
            // fluxo normal, depois da conferência. O arquivo viaja junto e é
            // anexado à venda assim que ela existir.
            setEditingSale(null);
            setReceiptPrefill(dados);
            setReceiptFile(arquivo);
            setManualSaleOpen(true);
          }}
        />
      )}
    </div>
  );
}
