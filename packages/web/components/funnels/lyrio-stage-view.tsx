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
  TrendingUp,
  Users,
  Repeat,
  Wallet,
  History,
  Loader2,
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
import { sumMetaInsights, sumMetaSpendWithTax } from "@/lib/utils/funnel-metrics";
import {
  calcularMargemContribuicao,
  validarPercentuaisMargem,
  MARGEM_DEFAULTS,
} from "@/lib/utils/lyrio-margin";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { useUsdBrl } from "@/lib/hooks/use-fx";
import { CampaignSelector } from "./campaign-selector";
import { GoogleAdsCampaignSelector } from "./google-ads-campaign-selector";
import { useGoogleAdsCampaigns } from "@/lib/hooks/use-google-ads-analytics";
import { StageDeleteSection } from "./stage-delete-section";
import { CampaignLogButton } from "./campaign-log-link";
import { SalesMetaKpis } from "./sales-meta-kpis";
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
} from "@/lib/hooks/use-revenuecat";
import type { FunnelCampaign, FunnelStage } from "@loyola-x/shared";

interface LyrioStageViewProps {
  projectId: string;
  funnelId: string;
  funnelName: string;
  stage: FunnelStage;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
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
function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}
/** Pega o valor de uma métrica do overview por id (aceita fallbacks de id). */
function metricValue(metrics: RevenuecatMetric[] | undefined, ...ids: string[]): number | null {
  if (!metrics) return null;
  for (const id of ids) {
    const m = metrics.find((x) => x.id === id);
    if (m) return m.value;
  }
  return null;
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
  const { data: googlePicker } = useGoogleAdsCampaignPicker(projectId);
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
  const overview = useRevenuecatOverview(projectId, funnelId, stage.id);
  // Histórico anterior ao webhook — só interessa quando a etapa já está
  // conectada, então a consulta acompanha o painel de configuração.
  const backfillStatus = useRevenuecatBackfillStatus(projectId, funnelId, stage.id, settingsOpen && connected);
  const runBackfill = useRunRevenuecatBackfill(projectId, funnelId, stage.id);

  // Câmbio USD->BRL: a Meta vem em BRL e o RevenueCat em USD; unifica em R$.
  const { data: fx } = useUsdBrl();
  const brlRate = fx?.rate ?? null;

  // Spend da Meta em 28 dias (mesma janela do overview do RevenueCat) pra ROAS.
  const { data: metaDaily28 } = useCampaignDailyInsightsBulk(
    campaignIds.length ? projectId : null,
    campaignIds.length ? campaignIds : null,
    28,
  );
  const metaSpend28 = metaDaily28 ? sumMetaInsights([metaDaily28]).spend : 0;
  // Story 42.2/42.4: mesma soma, decomposta em líquido + imposto para o memorial
  // de cálculo. `spendComImposto` é numericamente igual a `metaSpend28`.
  const metaSpend28Detalhe = useMemo(
    () =>
      metaDaily28
        ? sumMetaSpendWithTax([metaDaily28])
        : { spendLiquido: 0, imposto: 0, spendComImposto: 0 },
    [metaDaily28],
  );

  // Investimento do Google na MESMA janela de 28 dias. Só as campanhas
  // vinculadas à etapa entram — a conta pode servir outros produtos.
  const { data: googleCampaigns28 } = useGoogleAdsCampaigns(
    googleCampaignIds.size > 0 ? googleAccountId : null,
    28,
  );
  const googleSpend28 = (googleCampaigns28?.campaigns ?? [])
    .filter((c) => googleCampaignIds.has(c.id))
    .reduce((soma, c) => soma + c.spend, 0);
  // ROAS contra o investimento TOTAL: usar só a Meta inflaria o número assim que
  // houvesse verba no Google.
  const investimento28 = metaSpend28 + googleSpend28;

  // Métricas do overview (28d / snapshot) pro resumo mobile.
  const ov = overview.data?.metrics;
  const mrrUsd = metricValue(ov, "mrr");
  const activeSubs = metricValue(ov, "active_subscriptions");
  const activeTrials = metricValue(ov, "active_trials");
  const newCustomers = metricValue(ov, "new_customers_last_28_days", "new_customers");
  const revenue28Usd = metricValue(ov, "revenue_last_28_days", "revenue");
  const revenue28Brl = revenue28Usd != null && brlRate != null ? revenue28Usd * brlRate : null;
  const roas28 =
    revenue28Brl != null && investimento28 > 0 ? revenue28Brl / investimento28 : null;

  // Story 42.4 — Margem de Contribuição. Percentuais vêm da config da etapa; a
  // API sempre devolve os três preenchidos, mas o fallback cobre o carregamento.
  const platformFeePct = config.data?.platformFeePct ?? MARGEM_DEFAULTS.platformFeePct;
  const taxPct = config.data?.taxPct ?? MARGEM_DEFAULTS.taxPct;
  const otherCostsPct = config.data?.otherCostsPct ?? MARGEM_DEFAULTS.otherCostsPct;

  const margem28 = useMemo(
    () =>
      revenue28Brl == null
        ? null
        : calcularMargemContribuicao({
            faturamentoBrutoBrl: revenue28Brl,
            platformFeePct,
            taxPct,
            otherCostsPct,
            investimentoMetaLiquidoBrl: metaSpend28Detalhe.spendLiquido,
            impostoMetaBrl: metaSpend28Detalhe.imposto,
            investimentoGoogleBrl: googleSpend28,
          }),
    [
      revenue28Brl,
      platformFeePct,
      taxPct,
      otherCostsPct,
      metaSpend28Detalhe,
      googleSpend28,
    ],
  );

  // Origem da cotação — entra no memorial de todo card que converte US$ -> R$.
  const fxSourceLabel =
    fx?.source === "live" ? "ao vivo" : fx?.source === "manual" ? "manual" : "fallback";
  const fxSource = `/api/fx/usd-brl · ${fxSourceLabel}`;

  /**
   * Story 42.2 — memorial de cálculo de cada card do Resumo.
   *
   * Card sem dado recebe `undefined`: `<MetricTooltip>` então repassa o filho
   * sem tooltip. Memorial com "—" disfarçado de número seria pior que memorial
   * nenhum.
   */
  const formulas = useMemo(() => {
    const cambioValue: MetricFormulaValue | null =
      brlRate != null
        ? { label: "Câmbio US$ 1 →", value: fmtBRL(brlRate), source: fxSource }
        : null;

    const investimentoMeta: MetricFormula = {
      expression: "Σ spend diário ÷ (1 − 12,15%)",
      values: [
        {
          label: "Investimento líquido",
          value: fmtBRL(metaSpend28Detalhe.spendLiquido),
          source: "Meta Ads API · soma do spend diário das campanhas vinculadas",
        },
        {
          label: "Imposto (12,15%)",
          value: fmtBRL(metaSpend28Detalhe.imposto),
          source: "alíquota vigente desde 01/01/2026, aplicada por dia",
        },
      ],
      result: `${fmtBRL(metaSpend28Detalhe.spendLiquido)} + ${fmtBRL(
        metaSpend28Detalhe.imposto,
      )} = ${fmtBRL(metaSpend28)}`,
      period: "últimos 28 dias",
      note: "O valor do card JÁ inclui o imposto. O gross-up é por dentro: o imposto incide sobre o bruto, então não é spend × 1,1215.",
    };

    const investimentoGoogle: MetricFormula = {
      expression: "Σ spend das campanhas vinculadas",
      values: [
        {
          label: "Investimento",
          value: fmtBRL(googleSpend28),
          source: "Google Ads API · só as campanhas vinculadas a esta etapa",
        },
      ],
      result: fmtBRL(googleSpend28),
      period: "últimos 28 dias",
      note: "Sem imposto de 12,15%: aquele tributo é da plataforma Meta.",
    };

    const receita: MetricFormula | undefined =
      revenue28Usd != null && cambioValue
        ? {
            expression: "Receita 28d (US$) × câmbio",
            values: [
              {
                label: "Receita 28d",
                value: fmtUsd(revenue28Usd),
                source: "RevenueCat · métrica revenue_last_28_days",
              },
              cambioValue,
            ],
            result: `${fmtUsd(revenue28Usd)} × ${fmtBRL(brlRate!)} = ${brl(revenue28Usd, brlRate)}`,
            period: "últimos 28 dias",
            note: "Receita reportada pelo RevenueCat, antes de descontos de plataforma, imposto e custos.",
          }
        : undefined;

    const roas: MetricFormula | undefined =
      roas28 != null
        ? {
            expression: "Receita (R$) ÷ Investimento total (R$)",
            values: [
              {
                label: "Receita",
                value: fmtBRL(revenue28Brl!),
                source: "RevenueCat, convertida pelo câmbio",
              },
              {
                label: "Investimento total",
                value: fmtBRL(investimento28),
                source:
                  googleSpend28 > 0
                    ? "Meta (com imposto) + Google Ads"
                    : "Meta Ads, com imposto de 12,15%",
              },
            ],
            result: `${fmtBRL(revenue28Brl!)} ÷ ${fmtBRL(investimento28)} = ${fmtRoas(roas28)}`,
            period: "últimos 28 dias",
            note: "Receita bruta contra investimento. Não desconta comissão de loja, imposto nem custos — para isso, veja a Margem de Contribuição.",
          }
        : undefined;

    const mrr: MetricFormula | undefined =
      mrrUsd != null && cambioValue
        ? {
            expression: "MRR (US$) × câmbio",
            values: [
              { label: "MRR", value: fmtUsd(mrrUsd), source: "RevenueCat · métrica mrr" },
              cambioValue,
            ],
            result: `${fmtUsd(mrrUsd)} × ${fmtBRL(brlRate!)} = ${brl(mrrUsd, brlRate)}`,
            period: "snapshot atual",
            note: "Receita recorrente mensal no momento da consulta — não é média dos 28 dias.",
          }
        : undefined;

    const contagem = (
      valor: number | null,
      metrica: string,
      periodo: string,
      nota: string,
    ): MetricFormula | undefined =>
      valor == null
        ? undefined
        : {
            expression: "Contagem",
            values: [{ label: "Total", value: fmtNum(valor), source: `RevenueCat · ${metrica}` }],
            result: fmtNum(valor),
            period: periodo,
            note: nota,
          };

    // Story 42.4: o memorial mostra a cadeia INTEIRA. Um memorial que só diz
    // "líquido − investimento" esconde exatamente o que este card acrescenta.
    const margem: MetricFormula | undefined =
      margem28 != null && revenue28Brl != null
        ? {
            expression:
              "(Bruto − plataforma − imposto − outros custos) − investimento − imposto Meta",
            values: [
              {
                label: "Faturamento bruto",
                value: fmtBRL(revenue28Brl),
                source: "RevenueCat, convertido pelo câmbio",
              },
              {
                label: `− Descontos da plataforma (${platformFeePct}%)`,
                value: fmtBRL(margem28.descontosPlataforma),
                source: "comissão Apple/Google — configurável na etapa",
              },
              {
                label: `− Imposto (${taxPct}%)`,
                value: fmtBRL(margem28.imposto),
                source: "imposto sobre a receita — configurável na etapa",
              },
              {
                label: `− Outros custos (${otherCostsPct}%)`,
                value: fmtBRL(margem28.outrosCustos),
                source: "custos operacionais — configurável na etapa",
              },
              {
                label: "= Faturamento líquido",
                value: fmtBRL(margem28.faturamentoLiquido),
                source: "bruto menos os três descontos acima",
              },
              {
                label: "− Investimento (Meta líquido)",
                value: fmtBRL(metaSpend28Detalhe.spendLiquido),
                source: "Meta Ads API, sem imposto",
              },
              {
                label: "− Imposto Meta (12,15%)",
                value: fmtBRL(metaSpend28Detalhe.imposto),
                source: "gross-up por dentro, desde 01/01/2026",
              },
              ...(googleSpend28 > 0
                ? [
                    {
                      label: "− Investimento (Google)",
                      value: fmtBRL(googleSpend28),
                      source: "Google Ads API — sem imposto da Meta",
                    },
                  ]
                : []),
            ],
            result: `${fmtBRL(margem28.faturamentoLiquido)} − ${fmtBRL(
              margem28.investimentoTotal,
            )} = ${fmtBRL(margem28.margem)}`,
            period: "últimos 28 dias",
            note: "Os três percentuais incidem sobre o faturamento bruto (não em cascata) e são editáveis em Configurar.",
          }
        : undefined;

    return {
      investimentoMeta,
      investimentoGoogle,
      receita,
      roas,
      margem,
      mrr,
      assinaturas: contagem(
        activeSubs,
        "active_subscriptions",
        "snapshot atual",
        "Assinaturas ativas agora — não é acumulado do período.",
      ),
      trials: contagem(
        activeTrials,
        "active_trials",
        "snapshot atual",
        "Trials em andamento agora. Ainda não viraram receita.",
      ),
      novosClientes: contagem(
        newCustomers,
        "new_customers_last_28_days",
        "últimos 28 dias",
        "Clientes que fizeram a primeira compra na janela.",
      ),
    };
  }, [
    metaSpend28Detalhe,
    metaSpend28,
    googleSpend28,
    investimento28,
    revenue28Usd,
    revenue28Brl,
    roas28,
    margem28,
    platformFeePct,
    taxPct,
    otherCostsPct,
    mrrUsd,
    activeSubs,
    activeTrials,
    newCustomers,
    brlRate,
    fxSource,
  ]);

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
          RevenueCat). Janela de 28 dias (a que o RevenueCat expõe no overview). */}
      <section className="spy-viz space-y-2 rounded-xl border border-border/40 bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Resumo mobile · últimos 28 dias</h2>
          <p className="text-[10px] text-muted-foreground">
            Tudo em R$
            {brlRate != null && (
              <>
                {" "}· câmbio US$1 = {fmtBRL(brlRate)}
                {fx?.source === "live" ? " (ao vivo)" : fx?.source === "manual" ? " (manual)" : " (fallback)"}
              </>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiComMemorial
            icon={Zap}
            label="Investimento (Meta)"
            value={fmtBRL(metaSpend28)}
            formula={formulas.investimentoMeta}
          />
          {googleCampaignIds.size > 0 && (
            <KpiComMemorial
              icon={Zap}
              label="Investimento (Google)"
              value={fmtBRL(googleSpend28)}
              formula={formulas.investimentoGoogle}
            />
          )}
          <KpiComMemorial
            icon={DollarSign}
            label="Receita (RevenueCat)"
            value={brl(revenue28Usd, brlRate)}
            formula={formulas.receita}
          />
          <KpiComMemorial
            icon={TrendingUp}
            label="ROAS"
            value={fmtRoas(roas28)}
            formula={formulas.roas}
            highlight
          />
          <KpiComMemorial
            icon={Wallet}
            label="Margem de Contribuição"
            value={margem28 != null ? fmtBRL(margem28.margem) : "—"}
            formula={formulas.margem}
            highlight
            // Margem negativa em preto passa despercebida — e esta não pode.
            valueClassName={
              margem28 != null && margem28.margem < 0
                ? "text-red-600 dark:text-red-400"
                : undefined
            }
          />
          <KpiComMemorial
            icon={Repeat}
            label="MRR"
            value={brl(mrrUsd, brlRate)}
            formula={formulas.mrr}
          />
          <KpiComMemorial
            icon={Package}
            label="Assinaturas ativas"
            value={fmtNum(activeSubs)}
            formula={formulas.assinaturas}
          />
          <KpiComMemorial
            icon={ShoppingCart}
            label="Trials ativos"
            value={fmtNum(activeTrials)}
            formula={formulas.trials}
          />
          <KpiComMemorial
            icon={Users}
            label="Novos clientes"
            value={fmtNum(newCustomers)}
            formula={formulas.novosClientes}
          />
        </div>
        {!connected && (
          <p className="text-[11px] text-muted-foreground">
            Conecte o RevenueCat em <strong>Configurar</strong> pra preencher receita, MRR e
            assinaturas.
          </p>
        )}
      </section>

      {/* Meta — conversões + spend das campanhas linkadas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Meta Ads</h2>
        <SalesMetaKpis
          projectId={projectId}
          funnelId={funnelId}
          stageId={stage.id}
          campaignIds={campaignIds}
          days={days}
        />
      </section>

      {/* Google Ads — campanhas de app vinculadas à etapa. Só aparece quando há
          campanha vinculada: seção vazia num app que só roda Meta seria ruído. */}
      {googleCampaignIds.size > 0 && googleAccountId && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Google Ads</h2>
          <GoogleAdsKpis
            accountId={googleAccountId}
            days={days}
            campaignIds={googleCampaignIds}
          />
        </section>
      )}

      {/* RevenueCat — métricas ao vivo (API) + vendas do período (webhook) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">RevenueCat</h2>
        <RevenuecatOverviewPanel
          loading={overview.isLoading}
          connected={connected}
          data={overview.data}
          brlRate={brlRate}
          onConfigure={() => setSettingsOpen(true)}
        />
        <RevenuecatPanel
          loading={sales.isLoading}
          connected={connected}
          data={sales.data}
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
  brlRate,
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatSales>["data"];
  brlRate: number | null;
  onConfigure: () => void;
}) {
  // Mostra em R$ quando há câmbio; senão cai pro USD nativo.
  const money = (usd: number | null | undefined) =>
    brlRate != null ? brl(usd, brlRate) : fmtUsd(usd);
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
        <Kpi
          icon={DollarSign}
          label={brlRate != null ? "Receita" : "Receita (USD)"}
          value={money(revenueUsd)}
          highlight
        />
        {byCurrency.slice(0, 2).map((c) => (
          <Kpi
            key={c.currency}
            icon={DollarSign}
            label={`Receita (${c.currency})`}
            value={fmtMoney(c.revenue, c.currency)}
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
  // Valores monetários vêm em USD; converte pra R$ quando há câmbio.
  if (isMoneyMetric(m)) return brlRate != null ? fmtBRL(m.value * brlRate) : fmtUsd(m.value);
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
  brlRate,
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatOverview>["data"];
  brlRate: number | null;
  onConfigure: () => void;
}) {
  if (loading) return <Skeleton className="h-[110px] rounded-xl" />;
  // Não conectado: o painel de vendas abaixo já mostra esse estado.
  if (!connected) return null;

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
    Number(plataforma) !== platformFeePct ||
    Number(imposto) !== taxPct ||
    Number(outros) !== otherCostsPct;

  function handleSave() {
    // Vírgula decimal é o que o usuário brasileiro digita.
    const parse = (s: string) => Number(s.replace(",", "."));
    const p = {
      platformFeePct: parse(plataforma),
      taxPct: parse(imposto),
      otherCostsPct: parse(outros),
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

/**
 * Story 42.2 — `<Kpi>` com memorial de cálculo.
 *
 * Sem `formula`, `<MetricTooltip>` repassa o filho sem tooltip, e o card fica
 * idêntico ao que era (sem cursor de ajuda, sem sublinhado, sem foco). É o
 * comportamento desejado para "—": não existe memorial de um dado ausente.
 */
function KpiComMemorial({
  icon,
  label,
  value,
  formula,
  highlight,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  formula?: MetricFormula;
  highlight?: boolean;
  valueClassName?: string;
}) {
  return (
    <MetricTooltip label={label} value={value} formula={formula}>
      <Kpi
        icon={icon}
        label={label}
        value={value}
        highlight={highlight}
        valueClassName={valueClassName}
        hintTooltip={!!formula}
        // Uma <div> não é focável por padrão: sem isto o memorial existiria só
        // para quem usa mouse.
        tabIndex={formula ? 0 : undefined}
      />
    </MetricTooltip>
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
  accountId,
  days,
  campaignIds,
}: {
  accountId: string;
  days: number;
  campaignIds: Set<string>;
}) {
  const { data, isLoading } = useGoogleAdsCampaigns(accountId, days);

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;

  const vinculadas = (data?.campaigns ?? []).filter((c) => campaignIds.has(c.id));

  if (vinculadas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card p-4">
        <p className="text-xs text-muted-foreground">
          As campanhas vinculadas não tiveram entrega nos últimos {days} dias.
        </p>
      </div>
    );
  }

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
