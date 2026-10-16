"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Settings2,
  Smartphone,
  Plug,
  Webhook,
  Copy,
  Check,
  RefreshCw,
  DollarSign,
  ShoppingCart,
  Store,
  Package,
  Zap,
  Users,
  Wallet,
  History,
  Loader2,
  Share2,
} from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { useCampaignPicker, useGoogleAdsCampaignPicker } from "@/lib/hooks/use-funnels";
import { useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import { sumMetaSpendWithTax } from "@/lib/utils/funnel-metrics";
import {
  validarPercentuaisMargem,
  parsePercentual,
  MARGEM_DEFAULTS,
} from "@/lib/utils/lyrio-margin";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUsdBrl } from "@/lib/hooks/use-fx";
import { CampaignSelector } from "./campaign-selector";
import { GoogleAdsCampaignSelector } from "./google-ads-campaign-selector";
import { useGoogleAdsCampaigns, useGoogleAdsDailyPorCampanha } from "@/lib/hooks/use-google-ads-analytics";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import { LyrioMetaKpis } from "./lyrio-meta-kpis";
import {
  avisoDoGoogle,
  contaDoGoogle,
  estadoDoGoogleNaJanela,
  type ContaDoGoogle,
} from "@/lib/utils/lyrio-google-ads";
import { RevenuecatOverviewBlock } from "./revenuecat-overview-block";
import { GradeDoResumo } from "./lyrio-resumo-cards";
import { cardsDoResumo } from "@/lib/utils/resumo-mobile-lyrio";
import { avisoDeNaoClassificado, cardsDeAquisicao } from "@/lib/utils/aquisicao-lyrio";
import { hojeNoNegocio, tituloDoResumo } from "@/lib/utils/janela-dos-cards-lyrio";
import { avisoDoErroDaFonte, estadoDaFonte } from "@/lib/utils/estado-da-fonte-revenuecat";
import {
  diasDaConsultaDoGoogle,
  investimentoDoGoogleNaRegua,
  valorDoGoogleNaRegua,
} from "@/lib/utils/google-ads-na-regua";
import { LyrioDetailTable } from "./lyrio-detail-table";
import { LyrioJornadaPorCanal } from "./lyrio-jornada-por-canal";
import { LyrioResumoPorCanal } from "./lyrio-resumo-por-canal";
import {
  avisoDeConflito,
  declaracaoDeCobertura,
  declaracaoForaDaQuebra,
  estadoDasVendasPorCanal,
  linhasPorCanalDoBloco,
  type EstadoDasVendas,
} from "@/lib/utils/vendas-por-canal-lyrio";
import {
  useRevenuecatConnection,
  useSaveRevenuecatConnection,
  useDeleteRevenuecatConnection,
  useRevenuecatProjects,
  useRevenuecatConfig,
  useSaveRevenuecatConfig,
  useEnsureRevenuecatWebhook,
  useRevenuecatSales,
  useRevenuecatOverview,
  type RevenuecatMetric,
  useRevenuecatBackfillStatus,
  useRunRevenuecatBackfill,
  useRevenuecatVendasPorCanal,
  useRevenuecatReceita,
  useRevenuecatPagantesPorCanal,
  useRevenuecatNovosClientes,
} from "@/lib/hooks/use-revenuecat";
import type { FunnelCampaign, FunnelStage } from "@loyola-x/shared";

interface LyrioStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function fmtMoney(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}
function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}
function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
/** Converte USD -> BRL pela cotação; "—" quando falta valor ou câmbio. */
function brl(usd: number | null | undefined, rate: number | null): string {
  if (usd == null || rate == null) return "—";
  return fmtBRL(usd * rate);
}

export function LyrioStageView({ projectId, funnelId, funnelName, stage }: LyrioStageViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [days, setDays] = useState(90);
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);

  const updateStage = useUpdateStage(projectId, funnelId, stage.id);
  const campaignIds = stage.campaigns.map((c) => c.id);
  const { data: metaPicker } = useCampaignPicker(settingsOpen ? projectId : null);

  // Google Ads: o picker é a única fonte do accountId enquanto a etapa não tem
  // campanha vinculada (aí o id fica salvo em stage.googleAdsAccountId).
  const googlePickerQ = useGoogleAdsCampaignPicker(projectId);
  const googlePicker = googlePickerQ.data;
  const googleAccountId = stage.googleAdsAccountId ?? googlePicker?.accountId ?? null;
  const googleCampaigns = stage.googleAdsCampaigns ?? [];
  const googleCampaignIds = useMemo(
    () => new Set(googleCampaigns.map((c) => c.id)),
    [googleCampaigns],
  );

  const connection = useRevenuecatConnection(projectId);
  const connected = connection.data?.connected ?? false;
  const saveConnection = useSaveRevenuecatConnection(projectId);
  const deleteConnection = useDeleteRevenuecatConnection(projectId);
  const rcProjects = useRevenuecatProjects(projectId, settingsOpen && connected);
  const config = useRevenuecatConfig(projectId, funnelId, stage.id);
  const saveConfig = useSaveRevenuecatConfig(projectId, funnelId, stage.id);
  const ensureWebhook = useEnsureRevenuecatWebhook(projectId, funnelId, stage.id);
  const sales = useRevenuecatSales(projectId, funnelId, stage.id, days);
  // Story 42.12 (AC3/AC5): a quebra por canal na MESMA janela do bloco e do
  // Detalhamento (o Detalhamento lê a mesma chave de cache).
  const vendasPorCanalQ = useRevenuecatVendasPorCanal(projectId, funnelId, stage.id, days, connected);
  const vendasPorCanal = estadoDasVendasPorCanal({
    isLoading: vendasPorCanalQ.isLoading,
    error: vendasPorCanalQ.error,
    data: vendasPorCanalQ.data,
  });
  const overview = useRevenuecatOverview(projectId, funnelId, stage.id);
  // Histórico anterior ao webhook — só interessa quando a etapa já está
  // conectada, então a consulta acompanha o painel de configuração.
  const backfillStatus = useRevenuecatBackfillStatus(projectId, funnelId, stage.id, settingsOpen && connected);
  const runBackfill = useRunRevenuecatBackfill(projectId, funnelId, stage.id);

  // Câmbio USD->BRL: a Meta vem em BRL e o RevenueCat em USD; unifica em R$.
  const { data: fx } = useUsdBrl();
  const brlRate = fx?.rate ?? null;

  // Story 42.14 — o dia de SP: a régua de todas as janelas desta tela.
  const hoje = hojeNoNegocio();

  // Story 42.14 (D22): o investimento da Meta segue o FILTRO de dias. Os 28 dias
  // fixos ficam para os CACs de 28 dias (D5/D9) e para o trio Receita/ROAS/
  // Margem quando a API ainda não tem a rota de receita. Com `days = 28`, as duas
  // consultas são a mesma chave de cache.
  const temMeta = campaignIds.length > 0;
  const { data: metaDailyFiltro, error: erroMetaFiltroQ } = useCampaignDailyInsightsBulk(temMeta ? projectId : null, temMeta ? campaignIds : null, days);
  const { data: metaDaily28, error: erroMeta28Q } = useCampaignDailyInsightsBulk(temMeta ? projectId : null, temMeta ? campaignIds : null, 28);
  // QA REL-001: a falha da Meta tem causa no memorial — antes era "—" calado, como se carregasse.
  const erroMetaFiltro = erroMetaFiltroQ ? (erroMetaFiltroQ instanceof Error ? erroMetaFiltroQ.message : String(erroMetaFiltroQ)) : null;
  const erroMeta28 = erroMeta28Q ? (erroMeta28Q instanceof Error ? erroMeta28Q.message : String(erroMeta28Q)) : null;
  // Story 42.2/42.4: a soma decomposta em líquido + imposto, para o memorial.
  const metaFiltro = useMemo(() => (metaDailyFiltro ? sumMetaSpendWithTax([metaDailyFiltro]) : undefined), [metaDailyFiltro]);
  const meta28 = useMemo(() => (metaDaily28 ? sumMetaSpendWithTax([metaDaily28]) : undefined), [metaDaily28]);

  // Story 42.13 (AC1b + QA loop TEST-001): a conta decide antes da consulta.
  // Sem conta conectada (vínculo removido) ou consulta em erro, o investimento
  // do Google é DESCONHECIDO (`null`), não "R$ 0".
  const contaGoogle = useMemo(
    () =>
      contaDoGoogle({
        temCampanhas: googleCampaignIds.size > 0,
        accountId: googleAccountId,
        picker: { isLoading: googlePickerQ.isLoading, error: googlePickerQ.error, data: googlePicker },
      }),
    [googleCampaignIds, googleAccountId, googlePickerQ.isLoading, googlePickerQ.error, googlePicker],
  );
  // Story 42.14 (D17, AC4f): o Google na MESMA régua da Meta — N dias de
  // calendário de SP —, pela rota `/daily` existente, uma consulta por campanha
  // vinculada (a conta pode servir outros produtos). Uma consulta de max(N, 28)
  // dias atende o filtro e os 28 dias fixos.
  const googleIdsVinculados = useMemo(() => [...googleCampaignIds].sort(), [googleCampaignIds]);
  const googleDaily = useGoogleAdsDailyPorCampanha(
    contaGoogle.tipo === "conta" ? contaGoogle.accountId : null,
    googleIdsVinculados,
    diasDaConsultaDoGoogle(days, 28),
  );
  const googleConsultas = googleDaily.map((q) => ({ isLoading: q.isLoading, error: q.error, data: q.data }));
  const googleFiltro = investimentoDoGoogleNaRegua(contaGoogle, googleConsultas, days, hoje);
  const google28 = investimentoDoGoogleNaRegua(contaGoogle, googleConsultas, 28, hoje);
  const googleFiltroValor = valorDoGoogleNaRegua(googleFiltro);

  // Story 42.14 (D22, PO-11): a receita da janela do filtro, pela rota nova —
  // a mesma chave de cache do Overview (uma chamada, um gasto no limite de 25/min).
  const receitaQ = useRevenuecatReceita(projectId, funnelId, stage.id, days, connected);
  const receitaDoFiltro = estadoDaFonte({ isLoading: receitaQ.isLoading, error: receitaQ.error, data: receitaQ.data });
  // D22: os novos clientes do filtro (`charts/customers_new`) — a mesma chave do Overview.
  const novosClientesQ = useRevenuecatNovosClientes(projectId, funnelId, stage.id, days, connected);
  const novosClientes = estadoDaFonte({ isLoading: novosClientesQ.isLoading, error: novosClientesQ.error, data: novosClientesQ.data });
  const overviewEstado = estadoDaFonte({ isLoading: overview.isLoading, error: overview.error, data: overview.data?.metrics });

  // Story 42.4 — Margem de Contribuição. Percentuais vêm da config da etapa; a
  // API sempre devolve os três preenchidos, mas o fallback cobre o carregamento.
  const platformFeePct = config.data?.platformFeePct ?? MARGEM_DEFAULTS.platformFeePct;
  const taxPct = config.data?.taxPct ?? MARGEM_DEFAULTS.taxPct;
  const otherCostsPct = config.data?.otherCostsPct ?? MARGEM_DEFAULTS.otherCostsPct;

  // Origem da cotação — entra no memorial de todo card que converte US$ -> R$.
  const fxSourceLabel =
    fx?.source === "live" ? "ao vivo" : fx?.source === "manual" ? "manual" : "fallback";
  const fxSource = `/api/fx/usd-brl · ${fxSourceLabel}`;

  /**
   * Story 42.14 — os cards do Resumo, com valor, janela e memorial, saem de
   * `cardsDoResumo` (lib/utils, com teste). Card sem dado legítimo fica sem
   * memorial; card em erro mostra "—" e o memorial diz a causa (AC1c, PO-D4).
   */
  const cardsResumo = cardsDoResumo({
    ctx: { diasDoFiltro: days, hoje },
    cambio: { taxa: brlRate, fonte: fxSource },
    meta: { temCampanhas: temMeta, filtro: metaFiltro, vinteOito: meta28, erroFiltro: erroMetaFiltro, erro28: erroMeta28 },
    google: { mostrar: googleCampaignIds.size > 0, filtro: googleFiltro, vinteOito: google28 },
    receita: receitaDoFiltro,
    novosClientes,
    overview: overviewEstado,
    percentuais: { platformFeePct, taxPct, otherCostsPct },
  });
  // PO-D4 (3) — o aviso visível do bloco, além do memorial de cada card.
  const avisoDaReceita =
    avisoDoErroDaFonte(receitaDoFiltro, "a receita do período no RevenueCat") ??
    avisoDoErroDaFonte(novosClientes, "os novos clientes do período no RevenueCat");

  // Story 42.14 (AC4–AC8) — novos pagantes POR PESSOA, renovações e LTV, no filtro
  // e nos 28 dias fixos dos CACs (D5/D9). Com `days = 28`, uma consulta só.
  const pagantesFiltroQ = useRevenuecatPagantesPorCanal(projectId, funnelId, stage.id, days, connected);
  const pagantes28Q = useRevenuecatPagantesPorCanal(projectId, funnelId, stage.id, 28, connected);
  const pagantesFiltro = estadoDaFonte({ isLoading: pagantesFiltroQ.isLoading, error: pagantesFiltroQ.error, data: pagantesFiltroQ.data });
  const aquisicao = cardsDeAquisicao({
    ctx: { diasDoFiltro: days, hoje },
    pagantesFiltro,
    pagantes28: estadoDaFonte({ isLoading: pagantes28Q.isLoading, error: pagantes28Q.error, data: pagantes28Q.data }),
    meta: { temCampanhas: temMeta, filtro: metaFiltro, vinteOito: meta28, erroFiltro: erroMetaFiltro, erro28: erroMeta28 },
    google: { mostrar: googleCampaignIds.size > 0, filtro: googleFiltro, vinteOito: google28 },
  });
  const avisoDosPagantes = avisoDoErroDaFonte(pagantesFiltro, "os novos pagantes, as renovações e o LTV");
  const avisoDoLtv = avisoDeNaoClassificado(pagantesFiltro.tipo === "pronto" ? pagantesFiltro.dados.ltv : undefined);

  async function handleSaveName() {
    if (!stageName.trim() || stageName.trim() === stage.name) return;
    await updateStage.mutateAsync({ name: stageName.trim() });
    toast.success("Nome atualizado");
  }

  function handleSaveConnection() {
    if (!apiKey.trim()) return;
    saveConnection.mutate(apiKey.trim(), {
      onSuccess: () => {
        toast.success("RevenueCat conectado");
        setApiKey("");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao conectar"),
    });
  }

  const webhookUrl = config.data?.webhook
    ? `${API_URL}${config.data.webhook.path}?token=${config.data.webhook.token}`
    : null;

  function copyWebhook() {
    if (!webhookUrl) {
      // Gera o webhook na 1ª vez.
      ensureWebhook.mutate(false, {
        onSuccess: (w) => {
          const url = `${API_URL}${w.path}?token=${w.token}`;
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          toast.success("Webhook gerado e copiado");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar webhook"),
      });
      return;
    }
    navigator.clipboard?.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("URL do webhook copiada");
  }

  return (
    // Story 42.2: o `Tooltip` do shadcn neste repo NÃO embute o provider — sem
    // ele os memoriais simplesmente não abrem, e sem erro nenhum.
    <TooltipProvider>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{funnelName}</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{stage.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 flex items-center gap-1">
              <Smartphone className="h-3 w-3" />
              Lyrio
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            App mobile — conversões da Meta + vendas do RevenueCat.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CampaignLogButton projectId={projectId} funnelId={funnelId} />
          <DayRangePicker days={days} onDaysChange={setDays} />

          <Sheet
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (open) setStageName(stage.name);
            }}
          >
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Configurações da Etapa Lyrio</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                {/* Nome */}
                <div className="space-y-2">
                  <Label htmlFor="lyrio-stage-name">Nome da etapa</Label>
                  <div className="flex gap-2">
                    <Input
                      id="lyrio-stage-name"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={
                        updateStage.isPending || !stageName.trim() || stageName.trim() === stage.name
                      }
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                {/* Story 42.4 — percentuais da Margem de Contribuição */}
                <MargemConfigForm
                  platformFeePct={platformFeePct}
                  taxPct={taxPct}
                  otherCostsPct={otherCostsPct}
                  saving={saveConfig.isPending}
                  onSave={(p) =>
                    saveConfig.mutate(p, {
                      onSuccess: () => toast.success("Percentuais atualizados"),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
                    })
                  }
                />

                {/* Campanhas Meta */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Campanhas Meta Ads</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Vincule as campanhas do app pra puxar conversões e investimento (spend).
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

                {/* Campanhas Google Ads */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Campanhas Google Ads</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Campanhas de app (UAC) entram aqui — o investimento soma ao da Meta no
                    resumo e no ROAS.
                  </p>
                  {googlePicker ? (
                    <GoogleAdsCampaignSelector
                      campaigns={googlePicker.campaigns}
                      accountLinked={googlePicker.accountLinked}
                      error={googlePicker.error}
                      value={googleCampaigns}
                      onChange={(googleAdsCampaigns) => {
                        updateStage.mutate(
                          {
                            googleAdsCampaigns,
                            // Grava a conta junto: sem isso a etapa dependeria do
                            // picker pra saber de qual conta puxar as métricas.
                            googleAdsAccountId: googleAccountId,
                          },
                          { onSuccess: () => toast.success("Campanhas Google atualizadas") },
                        );
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">Carregando campanhas...</p>
                  )}
                </div>

                {/* RevenueCat */}
                <div className="space-y-3 border-t border-border/30 pt-5">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-fuchsia-500" />
                    <Label className="text-sm font-medium">RevenueCat</Label>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        connected
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {connected ? "Conectado" : "Não conectado"}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Secret API Key (v2) — por projeto
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder={connected ? "•••••••••• (trocar)" : "sk_..."}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-9 shrink-0"
                        disabled={saveConnection.isPending || !apiKey.trim()}
                        onClick={handleSaveConnection}
                      >
                        {connected ? "Trocar" : "Conectar"}
                      </Button>
                    </div>
                    {connected && (
                      <button
                        type="button"
                        className="text-[11px] text-destructive hover:underline"
                        onClick={() =>
                          deleteConnection.mutate(undefined, {
                            onSuccess: () => toast.success("RevenueCat desconectado"),
                          })
                        }
                      >
                        Desconectar
                      </button>
                    )}
                  </div>

                  {/* Project do RevenueCat que a etapa observa */}
                  {connected && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">App / Project no RevenueCat</Label>
                      <select
                        className="w-full h-9 rounded-md border border-border/50 bg-background px-2 text-sm"
                        value={config.data?.rcProjectId ?? ""}
                        onChange={(e) => {
                          const rc = rcProjects.data?.projects.find((p) => p.id === e.target.value);
                          saveConfig.mutate(
                            { rcProjectId: e.target.value || null, label: rc?.name ?? null },
                            { onSuccess: () => toast.success("Project vinculado") },
                          );
                        }}
                      >
                        <option value="">— selecione —</option>
                        {(rcProjects.data?.projects ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Webhook URL */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Webhook className="h-3 w-3" />
                      URL do webhook (cole no painel do RevenueCat)
                    </Label>
                    {webhookUrl ? (
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md border border-border/40 bg-muted/40 px-2 py-1.5 text-[10px]">
                          {webhookUrl}
                        </code>
                        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copyWebhook}>
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0"
                          title="Rotacionar token"
                          onClick={() =>
                            ensureWebhook.mutate(true, {
                              onSuccess: () => toast.success("Token rotacionado"),
                            })
                          }
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={ensureWebhook.isPending}
                        onClick={copyWebhook}
                      >
                        <Webhook className="h-3.5 w-3.5" />
                        Gerar URL do webhook
                      </Button>
                    )}
                  </div>
                </div>

                {/* Histórico anterior ao webhook */}
                {connected && (
                  <div className="space-y-2 border-t border-border/30 pt-5">
                    <Label className="text-sm font-medium">Histórico de assinaturas</Label>
                    <p className="text-[11px] text-muted-foreground">
                      O webhook só registra o que acontece depois de plugado. Isto importa as
                      assinaturas anteriores lendo cliente a cliente na API do RevenueCat. São
                      milhares de clientes, então roda por lote — clique de novo até concluir.
                    </p>

                    {backfillStatus.data && (
                      <p className="text-[11px] text-muted-foreground">
                        {backfillStatus.data.customersProcessed > 0 ? (
                          <>
                            {fmtNum(backfillStatus.data.customersProcessed)} clientes lidos ·{" "}
                            <strong>{fmtNum(backfillStatus.data.subscriptionsUpserted)}</strong>{" "}
                            assinaturas importadas
                            {backfillStatus.data.temMais ? " · ainda há mais" : " · completo"}
                          </>
                        ) : (
                          "Nenhum lote rodado ainda."
                        )}
                      </p>
                    )}

                    {backfillStatus.data?.error && (
                      <p className="text-[11px] text-destructive">{backfillStatus.data.error}</p>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={runBackfill.isPending}
                      onClick={() =>
                        runBackfill.mutate(undefined, {
                          onSuccess: (r) => {
                            const msg = `${r.subscriptionsUpserted} assinaturas · ${r.customersProcessed} clientes`;
                            if (r.temMais) toast.success(`Lote importado (${msg}). Rode de novo pra continuar.`);
                            else toast.success(`Histórico completo: ${msg}`);
                          },
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Erro no backfill"),
                        })
                      }
                    >
                      {runBackfill.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <History className="h-3.5 w-3.5" />
                      )}
                      {runBackfill.isPending
                        ? "Importando… (pode levar minutos)"
                        : backfillStatus.data?.temMais
                          ? "Continuar importação"
                          : "Importar histórico"}
                    </Button>
                  </div>
                )}

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

      {/* Resumo Mobile — visão unificada em R$ (aquisição Meta + monetização
          RevenueCat). Story 42.14: o título declara a janela do FILTRO, com as
          datas; cada card diz a sua na etiqueta, e o que não segue o filtro
          (retratos, 28 dias da API) tem fundo âmbar (AC3). */}
      <section className="spy-viz space-y-2 rounded-xl border border-border/40 bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{tituloDoResumo(days, hoje)}</h2>
          <p className="text-[10px] text-muted-foreground">
            Tudo em R$
            {brlRate != null && (
              <>
                {" "}· câmbio US$1 = {fmtBRL(brlRate)}
                {fx?.source === "live" ? " (ao vivo)" : fx?.source === "manual" ? " (manual)" : " (fallback)"}
              </>
            )}
            {" "}· fundo âmbar = não segue o filtro
          </p>
        </div>
        {connected && avisoDaReceita && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {avisoDaReceita}
          </p>
        )}
        <GradeDoResumo cards={cardsResumo} />
        {connected && avisoDosPagantes && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {avisoDosPagantes}
          </p>
        )}
        {/* Story 42.14 (AC4, AC5) — CAC por NOVO PAGANTE (pessoa), no filtro e nos
            28 dias fixos (`28d fixo`, âmbar). (AC7) LTV bruto por plano e (AC8)
            renovações por canal, no filtro. Somem com a API anterior à rota. */}
        {connected && aquisicao.cac.length > 0 && (
          <div className="space-y-1.5 border-t border-border/30 pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground">CAC · investimento ÷ novos pagantes (pessoas)</h3>
            <GradeDoResumo cards={aquisicao.cac} />
          </div>
        )}
        {connected && aquisicao.ltv.length > 0 && (
          <div className="space-y-1.5 border-t border-border/30 pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground">LTV bruto por plano · em US$</h3>
            {/* AC7d — pagamento com produto não classificado: aviso visível, no padrão do conflito da 42.12. */}
            {avisoDoLtv && (
              <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {avisoDoLtv}
              </p>
            )}
            <GradeDoResumo cards={aquisicao.ltv} />
          </div>
        )}
        {connected && aquisicao.renovacoes.length > 0 && (
          <div className="space-y-1.5 border-t border-border/30 pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground">Renovações por canal</h3>
            <GradeDoResumo cards={aquisicao.renovacoes} />
          </div>
        )}
        {/* Story 42.12 (AC2) — receita, ROAS e Margem por canal. Story 42.14
            (D22): na janela do FILTRO, com o investimento da mesma janela. O
            investimento só conta como conhecido com campanha vinculada E a
            consulta carregada: antes disso "R$ 0" seria um número falso. */}
        {connected && (
          <LyrioResumoPorCanal
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            days={days}
            brlRate={brlRate}
            meta={{
              liquidoBrl: metaFiltro?.spendLiquido ?? 0,
              impostoBrl: metaFiltro?.imposto ?? 0,
              conhecido: temMeta && metaFiltro !== undefined,
            }}
            google={{
              investimentoBrl: googleFiltroValor ?? 0,
              conhecido: googleCampaignIds.size > 0 && googleFiltroValor !== null,
            }}
            percentuais={{ platformFeePct, taxPct, otherCostsPct }}
          />
        )}
        {!connected && (
          <p className="text-[11px] text-muted-foreground">
            Conecte o RevenueCat em <strong>Configurar</strong> pra preencher receita, MRR e
            assinaturas.
          </p>
        )}
      </section>

      {/* Story 42.9 — o Overview completo do RevenueCat. Depois do resumo do
          topo (que já usa 5 destas métricas) e antes do tráfego: primeiro o que
          o app é, depois o que o custa. */}
      {connected && (
        <section className="space-y-3">
          <RevenuecatOverviewBlock
            projectId={projectId}
            funnelId={funnelId}
            stageId={stage.id}
            days={days}
          />
        </section>
      )}

      {/* Meta — conversões + spend das campanhas linkadas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Meta Ads</h2>
        {/* Story 42.13 (AC2): a venda é a do RevenueCat (canal Meta), no MESMO
            estado do bloco RevenueCat — antes lia planilha e dava 0. */}
        <LyrioMetaKpis
          projectId={projectId}
          campaignIds={campaignIds}
          days={days}
          vendas={vendasPorCanal}
          revenuecatConectado={connected}
          brlRate={brlRate}
        />
      </section>

      {/* Google Ads — campanhas de app vinculadas à etapa. Só aparece quando há
          campanha vinculada: seção vazia num app que só roda Meta seria ruído. */}
      {contaGoogle.tipo !== "sem_campanha" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Google Ads</h2>
          <GoogleAdsKpis
            conta={contaGoogle}
            days={days}
            campaignIds={googleCampaignIds}
          />
        </section>
      )}

      {/* Story 42.5 — Detalhamento por campanha, público e criativo. Segue o
          DayRangePicker do cabeçalho (`days`), não os 28 dias fixos do Resumo.
          Sem campanha vinculada em nenhuma das duas plataformas não há o que
          detalhar — a seção some em vez de mostrar tabela vazia. */}
      {(campaignIds.length > 0 || googleCampaignIds.size > 0) && (
        <LyrioDetailTable
          projectId={projectId}
          funnelId={funnelId}
          stageId={stage.id}
          brlRate={brlRate}
          revenuecatConectado={connected}
          campaignIds={campaignIds}
          googleAccountId={googleAccountId}
          googleCampaignIds={googleCampaignIds}
          contaGoogle={contaGoogle}
          days={days}
        />
      )}

      {/* Story 42.11 — Jornada por canal. Logo depois do Detalhamento e FORA da
          condição dele: lê o webhook do RevenueCat, não depende de campanha
          vinculada (PO-03). Segue o seletor de dias do cabeçalho. */}
      <LyrioJornadaPorCanal projectId={projectId} funnelId={funnelId} stageId={stage.id} days={days} />

      {/* RevenueCat — métricas ao vivo (API) + vendas do período (webhook) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">RevenueCat</h2>
        <RevenuecatOverviewPanel
          loading={overview.isLoading}
          connected={connected}
          data={overview.data}
          erro={overview.error}
          brlRate={brlRate}
          onConfigure={() => setSettingsOpen(true)}
        />
        <RevenuecatPanel
          loading={sales.isLoading}
          connected={connected}
          data={sales.data}
          porCanal={vendasPorCanal}
          brlRate={brlRate}
          onConfigure={() => setSettingsOpen(true)}
        />
      </section>
    </div>
    </TooltipProvider>
  );
}

// ============================================================
// Painel de vendas do RevenueCat
// ============================================================

function RevenuecatPanel({
  loading,
  connected,
  data,
  porCanal,
  brlRate,
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatSales>["data"];
  /** Story 42.12 (AC3) — a quebra por canal; "oculto" com a API anterior à rota. */
  porCanal: EstadoDasVendas;
  brlRate: number | null;
  onConfigure: () => void;
}) {
  // Sempre R$. O painel nunca exibe dólar: sem câmbio carregado o valor fica
  // "—" (estado momentâneo) em vez de virar US$, que ninguém aqui lê.
  const money = (usd: number | null | undefined) => brl(usd, brlRate);
  if (loading) return <Skeleton className="h-[320px] rounded-xl" />;

  if (!connected) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-6 text-center">
        <Plug className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">RevenueCat não conectado</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Em <strong>Configurar</strong>, cole a Secret API Key, selecione o app e gere a URL do
          webhook pra colar no painel do RevenueCat. As vendas aparecem aqui conforme os eventos
          chegam.
        </p>
        <Button size="sm" className="mt-3" onClick={onConfigure}>
          <Settings2 className="h-4 w-4 mr-2" />
          Configurar
        </Button>
      </div>
    );
  }

  const totalSales = data?.totalSales ?? 0;
  const revenueUsd = data?.revenueUsd ?? 0;
  const byCurrency = data?.byCurrency ?? [];
  const daily = data?.daily ?? [];
  const byStore = data?.byStore ?? [];
  const byProduct = data?.byProduct ?? [];

  return (
    <div className="spy-viz space-y-4 rounded-xl border border-border/40 bg-card p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={ShoppingCart} label="Vendas" value={fmtNum(totalSales)} />
        <Kpi icon={DollarSign} label="Receita" value={money(revenueUsd)} highlight />
        {/* Quebra por moeda de compra, mas exibida em R$: BRL entra direto (é a
            moeda nativa da maior parte das vendas) e USD passa pelo câmbio.
            Moeda diferente dessas duas cairia em conversão errada com a taxa do
            dólar, então fica no valor nativo com o código à mostra. */}
        {byCurrency.slice(0, 2).map((c) => (
          <Kpi
            key={c.currency}
            icon={DollarSign}
            label={`Receita · ${c.currency}`}
            value={
              c.currency === "BRL"
                ? fmtBRL(c.revenue)
                : c.currency === "USD"
                  ? brl(c.revenue, brlRate)
                  : fmtMoney(c.revenue, c.currency)
            }
          />
        ))}
      </div>

      {daily.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Sem vendas no período. Confirme que o webhook está colado no RevenueCat e que há compras
          na janela selecionada.
        </p>
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={fmtDay}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--viz-axis)" }}
                interval={daily.length > 20 ? Math.floor(daily.length / 12) : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--viz-axis)" }}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as { sales: number; revenueUsd: number };
                  return (
                    <div className="rounded-lg border border-border/60 bg-popover px-2.5 py-2 shadow-lg">
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                        {fmtDay(String(label))}
                      </p>
                      <p className="text-sm font-semibold tabular-nums">{fmtNum(p.sales)} vendas</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {money(p.revenueUsd)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                name="Vendas"
                type="monotone"
                dataKey="sales"
                stroke="var(--viz-series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Story 42.12 (AC3) — Por canal: só venda paga, com o próprio total. A
          diferença para o card "Vendas" (eventos de US$ 0) sai com número. */}
      {porCanal.tipo === "carregando" && <Skeleton className="h-24 w-full" />}
      {porCanal.tipo === "erro" && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível carregar as vendas por canal: {porCanal.mensagem}
        </p>
      )}
      {porCanal.tipo === "pronto" && (
        <div className="space-y-2">
          {avisoDeConflito(porCanal.dados.conflito.compradores) && (
            <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {avisoDeConflito(porCanal.dados.conflito.compradores)}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <BreakdownTable
              icon={Share2}
              title="Por canal"
              money={money}
              rows={linhasPorCanalDoBloco(porCanal.dados)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {[declaracaoForaDaQuebra(porCanal.dados), declaracaoDeCobertura(porCanal.dados)].filter(Boolean).join(" ")}
          </p>
        </div>
      )}

      {/* Breakdown por loja e produto */}
      {(byStore.length > 0 || byProduct.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {byStore.length > 0 && (
            <BreakdownTable
              icon={Store}
              title="Por loja"
              money={money}
              rows={byStore.map((s) => ({ label: s.store, sales: s.sales, revenueUsd: s.revenueUsd }))}
            />
          )}
          {byProduct.length > 0 && (
            <BreakdownTable
              icon={Package}
              title="Por produto"
              money={money}
              rows={byProduct.map((p) => ({ label: p.productId, sales: p.sales, revenueUsd: p.revenueUsd }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Painel de métricas agregadas (pull ao vivo da API do RevenueCat)
// ============================================================

// Rótulos PT pros ids conhecidos do overview; fallback = name do RevenueCat.
const METRIC_LABEL: Record<string, string> = {
  mrr: "MRR",
  active_subscriptions: "Assinaturas ativas",
  active_trials: "Trials ativos",
  revenue: "Receita (28d)",
  revenue_last_28_days: "Receita (28d)",
  new_customers: "Novos clientes (28d)",
  new_customers_last_28_days: "Novos clientes (28d)",
  active_users: "Usuários ativos (28d)",
  active_users_last_28_days: "Usuários ativos (28d)",
};

function isMoneyMetric(m: RevenuecatMetric): boolean {
  return m.unit === "$" || /revenue|mrr|arr|proceeds/i.test(m.id);
}

function fmtMetric(m: RevenuecatMetric, brlRate: number | null): string {
  // Valor monetário do RevenueCat vem em USD e SEMPRE é exibido em R$. Sem
  // câmbio ainda carregado mostra "—" — nunca o valor em dólar.
  if (isMoneyMetric(m)) return brlRate != null ? fmtBRL(m.value * brlRate) : "—";
  if (m.unit === "%") return `${m.value.toLocaleString("pt-BR")}%`;
  return fmtNum(m.value);
}

function metricIcon(m: RevenuecatMetric) {
  if (isMoneyMetric(m)) return DollarSign;
  if (/subscription|trial/i.test(m.id)) return Package;
  return ShoppingCart;
}

function RevenuecatOverviewPanel({
  loading,
  connected,
  data,
  erro,
  brlRate,
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatOverview>["data"];
  /**
   * A falha da requisição, quando houve.
   *
   * Sem isto, `!data?.configured` era verdadeiro tanto para "o app não foi
   * escolhido" quanto para "a chamada falhou" — e a tela mandava o gestor
   * configurar algo que já estava configurado. É o mesmo defeito que o Google
   * Ads tinha (#614): erro chegando à tela como ausência.
   */
  erro?: unknown;
  brlRate: number | null;
  onConfigure: () => void;
}) {
  if (loading) return <Skeleton className="h-[110px] rounded-xl" />;
  // Não conectado: o painel de vendas abaixo já mostra esse estado.
  if (!connected) return null;

  // A falha é testada ANTES da ausência: uma requisição que falhou também
  // chega aqui sem `configured`, e testar a ausência primeiro esconderia o
  // motivo real.
  if (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    const semPermissao = /permiss|charts_metrics|403/i.test(msg);
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
        <p className="font-medium text-amber-700 dark:text-amber-500">
          Não foi possível puxar as métricas do RevenueCat.
        </p>
        <p className="mt-1 text-muted-foreground">
          {semPermissao
            ? "A Secret API Key precisa da permissão de leitura de métricas (charts_metrics:overview:read). Verifique no painel do RevenueCat."
            : "O app está configurado — a falha foi na chamada. Se persistir, o deploy da API pode estar defasado."}
        </p>
        <p className="mt-1.5 break-words font-mono text-[10px] text-muted-foreground/70">{msg}</p>
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Selecione o <strong>app do RevenueCat</strong> em{" "}
          <button
            type="button"
            onClick={onConfigure}
            className="font-medium text-primary hover:underline"
          >
            Configurar
          </button>{" "}
          pra puxar as métricas (MRR, assinaturas, receita 28d).
        </p>
      </div>
    );
  }

  if (!data.metrics.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">Sem métricas retornadas pelo RevenueCat.</p>
      </div>
    );
  }

  return (
    <div className="spy-viz rounded-xl border border-border/40 bg-card p-4">
      <p className="mb-3 text-[11px] text-muted-foreground">
        Métricas ao vivo (via API do RevenueCat) — snapshot atual; receita e novos clientes dos
        últimos 28 dias.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {data.metrics.map((m) => (
          <Kpi
            key={m.id}
            icon={metricIcon(m)}
            label={METRIC_LABEL[m.id] ?? m.name}
            value={fmtMetric(m, brlRate)}
            highlight={m.id === "mrr" || /^revenue/.test(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Card de KPI da etapa Lyrio.
 *
 * Story 42.2: precisa ser `forwardRef` e repassar props. `<MetricTooltip>` usa
 * `<TooltipTrigger asChild>`, que CLONA este elemento e injeta `ref` + handlers
 * de pointer/focus nele. Um componente que ignora props e ref descarta esses
 * handlers e o tooltip nunca abre — sem erro em tela, só um warning de ref no
 * console. Mesmo formato do `KpiCard` de `launch-dashboard.tsx` e
 * `subscriptions/kpi-card.tsx`.
 */
const Kpi = React.forwardRef<
  HTMLDivElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    highlight?: boolean;
    /** Sinaliza que há memorial de cálculo: cursor + sublinhado pontilhado. */
    hintTooltip?: boolean;
    /** Classe extra no valor (ex.: vermelho para margem negativa). */
    valueClassName?: string;
  } & React.HTMLAttributes<HTMLDivElement>
>(function Kpi(
  { icon: Icon, label, value, highlight, hintTooltip, valueClassName, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-lg border p-3 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border/50"
      } ${hintTooltip ? "cursor-help" : ""} ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className={`text-base font-bold ${highlight ? "text-primary" : ""} ${
          valueClassName ?? ""
        } ${
          hintTooltip
            ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
});

/**
 * Story 42.4 — percentuais da Margem de Contribuição.
 *
 * Estado local com commit explícito no "Salvar": salvar a cada tecla mandaria
 * um PUT por dígito e faria o card piscar valores intermediários (um "1" a
 * caminho de "15").
 */
function MargemConfigForm({
  platformFeePct,
  taxPct,
  otherCostsPct,
  saving,
  onSave,
}: {
  platformFeePct: number;
  taxPct: number;
  otherCostsPct: number;
  saving: boolean;
  onSave: (p: { platformFeePct: number; taxPct: number; otherCostsPct: number }) => void;
}) {
  const [plataforma, setPlataforma] = useState(String(platformFeePct));
  const [imposto, setImposto] = useState(String(taxPct));
  const [outros, setOutros] = useState(String(otherCostsPct));
  const [erro, setErro] = useState<string | null>(null);

  // Reidrata quando a config chega/muda no servidor, sem atropelar edição em
  // andamento (o efeito só dispara quando os valores de fora mudam).
  React.useEffect(() => {
    setPlataforma(String(platformFeePct));
    setImposto(String(taxPct));
    setOutros(String(otherCostsPct));
  }, [platformFeePct, taxPct, otherCostsPct]);

  const sujo =
    parsePercentual(plataforma) !== platformFeePct ||
    parsePercentual(imposto) !== taxPct ||
    parsePercentual(outros) !== otherCostsPct;

  function handleSave() {
    // `parsePercentual` aceita vírgula decimal e devolve NaN para campo vazio —
    // sem isso, apagar o campo gravaria 0% em silêncio (QA-08).
    const p = {
      platformFeePct: parsePercentual(plataforma),
      taxPct: parsePercentual(imposto),
      otherCostsPct: parsePercentual(outros),
    };
    const check = validarPercentuaisMargem(p);
    if (!check.ok) {
      setErro(check.erro);
      return;
    }
    setErro(null);
    onSave(p);
  }

  const campo = (
    id: string,
    rotulo: string,
    valor: string,
    set: (v: string) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {rotulo}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={valor}
          onChange={(e) => set(e.target.value)}
          className="h-9 pr-6 text-sm"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 border-t border-border/30 pt-5">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Margem de contribuição</Label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Os três percentuais incidem sobre o <strong>faturamento bruto</strong> (não em cascata) e
        alimentam o card do Resumo.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {campo("margem-plataforma", "Plataforma", plataforma, setPlataforma)}
        {campo("margem-imposto", "Imposto", imposto, setImposto)}
        {campo("margem-outros", "Outros custos", outros, setOutros)}
      </div>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
      <Button size="sm" onClick={handleSave} disabled={saving || !sujo}>
        Salvar percentuais
      </Button>
    </div>
  );
}

function BreakdownTable({
  icon: Icon,
  title,
  rows,
  money,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: { label: string; sales: number; revenueUsd: number }[];
  money: (usd: number | null | undefined) => string;
}) {
  return (
    <div className="rounded-lg border border-border/40">
      <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2 text-xs font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/30 first:border-t-0">
              <td className="px-3 py-1.5 truncate max-w-[160px]">{r.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmtNum(r.sales)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(r.revenueUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Google Ads — KPIs das campanhas de app vinculadas à etapa
// ============================================================

/**
 * Agrega as campanhas do Google vinculadas à etapa. A rota devolve a conta
 * inteira, então filtrar por `campaignIds` é o que impede o investimento de
 * outro produto da mesma conta vazar pro painel do app.
 */
function GoogleAdsKpis({
  conta,
  days,
  campaignIds,
}: {
  conta: ContaDoGoogle;
  days: number;
  campaignIds: Set<string>;
}) {
  const q = useGoogleAdsCampaigns(conta.tipo === "conta" ? conta.accountId : null, days);
  // Story 42.13 (AC1a + QA loop): erro e falta de conta têm estado e texto
  // próprios — antes viravam "não tiveram entrega" ou a seção sumia.
  const estado = estadoDoGoogleNaJanela(conta, { isLoading: q.isLoading, error: q.error, data: q.data }, campaignIds);
  const aviso = avisoDoGoogle(estado);

  if (estado.tipo === "carregando") return <Skeleton className="h-20 rounded-xl" />;

  if (aviso) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-1">
        <p className="text-xs font-medium text-destructive">{aviso.titulo}</p>
        {aviso.detalhe && <p className="text-xs text-destructive/90 break-words">{aviso.detalhe}</p>}
        <p className="text-[11px] text-muted-foreground">{aviso.orientacao}</p>
      </div>
    );
  }

  if (estado.tipo !== "pronto") {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-4">
        <p className="text-xs text-muted-foreground">
          As campanhas vinculadas não tiveram entrega nos últimos {days} dias.
        </p>
      </div>
    );
  }

  const vinculadas = estado.vinculadas;
  const total = vinculadas.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
  );

  // CPA em cima de conversão do próprio Google (instalação/evento do app), que é
  // o que a plataforma otimiza — a receita real vem do RevenueCat, no resumo.
  const cpa = total.conversions > 0 ? total.spend / total.conversions : null;
  const ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : null;

  return (
    <div className="spy-viz grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi icon={Zap} label="Investimento" value={fmtBRL(total.spend)} />
      <Kpi icon={Users} label="Impressões" value={fmtNum(total.impressions)} />
      <Kpi icon={ShoppingCart} label="Cliques" value={fmtNum(total.clicks)} />
      <Kpi icon={Package} label="Conversões" value={fmtNum(total.conversions)} />
      <Kpi icon={DollarSign} label="CPA" value={cpa != null ? fmtBRL(cpa) : "—"} />
      {ctr != null && (
        <p className="col-span-full text-[10px] text-muted-foreground">
          CTR {ctr.toFixed(2)}% · {vinculadas.length} campanha
          {vinculadas.length > 1 ? "s" : ""} vinculada{vinculadas.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
