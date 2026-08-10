"use client";

import { useState } from "react";
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
  Coins,
  CalendarClock,
  Activity,
  HelpCircle,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DayRangePicker } from "@/components/ui/day-range-picker";
import { useUpdateStage } from "@/lib/hooks/use-funnel-stages";
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
import { useCampaignDailyInsightsBulk } from "@/lib/hooks/use-traffic-analytics";
import { sumMetaInsights } from "@/lib/utils/funnel-metrics";
import { useUsdBrl } from "@/lib/hooks/use-fx";
import { CampaignSelector } from "./campaign-selector";
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
/** Moeda compacta pra eixo/rótulo (ex.: R$ 1,2 mil, US$ 900). */
function fmtCompactMoney(v: number, currency: "BRL" | "USD"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}
/** Meses -> texto amigável ("2,3 meses", "< 1 mês"). */
function fmtMonths(v: number | null): string {
  if (v == null) return "—";
  if (v < 1) return "< 1 mês";
  return `${v.toFixed(1).replace(".", ",")} ${v >= 2 ? "meses" : "mês"}`;
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

  // Métricas do overview (28d / snapshot) pro resumo mobile.
  const ov = overview.data?.metrics;
  const mrrUsd = metricValue(ov, "mrr");
  const activeSubs = metricValue(ov, "active_subscriptions");
  const activeTrials = metricValue(ov, "active_trials");
  const newCustomers = metricValue(ov, "new_customers_last_28_days", "new_customers");
  const revenue28Usd = metricValue(ov, "revenue_last_28_days", "revenue");
  const revenue28Brl = revenue28Usd != null && brlRate != null ? revenue28Usd * brlRate : null;
  const mrrBrl = mrrUsd != null && brlRate != null ? mrrUsd * brlRate : null;
  const roas28 =
    revenue28Brl != null && metaSpend28 > 0 ? revenue28Brl / metaSpend28 : null;

  // Unit economics (economia por cliente) — tudo em R$:
  // • ARPU = receita recorrente mensal (MRR) ÷ assinantes ativos → quanto cada
  //   assinante rende por mês.
  // • CAC = investimento em anúncio (28d) ÷ clientes novos (28d) → quanto custa
  //   trazer 1 cliente novo.
  // • Payback = CAC ÷ ARPU → em quantos meses o cliente paga o que custou.
  const arpuBrl = mrrBrl != null && activeSubs != null && activeSubs > 0 ? mrrBrl / activeSubs : null;
  const cac =
    newCustomers != null && newCustomers > 0 && metaSpend28 > 0 ? metaSpend28 / newCustomers : null;
  const paybackMonths = cac != null && arpuBrl != null && arpuBrl > 0 ? cac / arpuBrl : null;

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

      {/* Saúde do app — hero band em R$ (aquisição Meta + monetização RevenueCat).
          Janela de 28 dias (a que o RevenueCat expõe no overview). Métricas-herói
          grandes + linha de apoio, cada uma com explicação em linguagem simples. */}
      <section className="spy-viz space-y-3 rounded-xl border border-border/40 bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Saúde do app · últimos 28 dias</h2>
            <p className="text-[11px] text-muted-foreground">
              Os números que dizem se o app está crescendo e dando lucro.
            </p>
          </div>
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

        {/* Métricas-herói */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={Repeat}
            label="MRR"
            value={brl(mrrUsd, brlRate)}
            hint="Receita recorrente por mês — o coração de um app de assinatura"
            tooltip="Monthly Recurring Revenue: soma do valor mensal de todas as assinaturas ativas."
            highlight
            big
          />
          <Kpi
            icon={DollarSign}
            label="Receita (28 dias)"
            value={brl(revenue28Usd, brlRate)}
            hint="Quanto entrou de fato nos últimos 28 dias"
            tooltip="Receita reconhecida pelo RevenueCat nos últimos 28 dias, convertida pra R$."
            big
          />
          <Kpi
            icon={TrendingUp}
            label="ROAS"
            value={fmtRoas(roas28)}
            hint="Retorno do anúncio: R$ de receita por R$1 investido na Meta"
            tooltip="Receita 28d ÷ Investimento Meta 28d. Acima de 1x já se paga; quanto maior, melhor."
            big
          />
          <Kpi
            icon={Package}
            label="Assinantes ativos"
            value={fmtNum(activeSubs)}
            hint="Pessoas pagando assinatura agora"
            tooltip="Assinaturas ativas no momento (fonte: RevenueCat)."
            big
          />
        </div>

        {/* Linha de apoio */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi
            icon={Zap}
            label="Investimento (Meta)"
            value={fmtBRL(metaSpend28)}
            hint="Gasto em anúncio (28d)"
          />
          <Kpi
            icon={ShoppingCart}
            label="Trials ativos"
            value={fmtNum(activeTrials)}
            hint="Em teste grátis — futuros pagantes"
            tooltip="Usuários no período de teste gratuito; parte deles vira assinante pagante."
          />
          <Kpi
            icon={Users}
            label="Novos clientes"
            value={fmtNum(newCustomers)}
            hint="Primeiras compras (28d)"
          />
        </div>

        {!connected && (
          <p className="text-[11px] text-muted-foreground">
            Conecte o RevenueCat em <strong>Configurar</strong> pra preencher receita, MRR e
            assinaturas.
          </p>
        )}
      </section>

      {/* Economia por cliente (unit economics) — o bloco que responde
          "cada cliente dá lucro?". Só aparece quando dá pra calcular. */}
      {(cac != null || arpuBrl != null) && (
        <UnitEconomics cac={cac} arpuBrl={arpuBrl} paybackMonths={paybackMonths} />
      )}

      {/* Meta — conversões + spend das campanhas linkadas */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Aquisição · como você traz clientes</h2>
          <p className="text-[11px] text-muted-foreground">
            Anúncios da Meta: do investimento até a venda, passo a passo.
          </p>
        </div>
        <SalesMetaKpis
          projectId={projectId}
          funnelId={funnelId}
          stageId={stage.id}
          campaignIds={campaignIds}
          days={days}
        />
      </section>

      {/* RevenueCat — métricas ao vivo (API) + vendas do período (webhook) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Monetização · vendas e assinaturas</h2>
          <p className="text-[11px] text-muted-foreground">
            Dados do RevenueCat: quanto o app vende por dia e de onde vem a receita.
          </p>
        </div>
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

  // Série diária de RECEITA (não contagem) na moeda de exibição — receita é o
  // que importa num app de assinatura; área comunica volume no tempo.
  const cur: "BRL" | "USD" = brlRate != null ? "BRL" : "USD";
  const dailyChart = daily.map((d) => ({
    day: d.day,
    sales: d.sales,
    revenue: brlRate != null ? d.revenueUsd * brlRate : d.revenueUsd,
  }));
  const ticketMedio = totalSales > 0 ? revenueUsd / totalSales : null;

  return (
    <div className="spy-viz space-y-4 rounded-xl border border-border/40 bg-card p-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={ShoppingCart} label="Vendas" value={fmtNum(totalSales)} hint="Compras no período" />
        <Kpi
          icon={DollarSign}
          label={brlRate != null ? "Receita" : "Receita (USD)"}
          value={money(revenueUsd)}
          hint="Total do período"
          highlight
        />
        <Kpi icon={Coins} label="Ticket médio" value={money(ticketMedio)} hint="Receita ÷ vendas" />
        {byCurrency.slice(0, 1).map((c) => (
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
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Receita por dia {brlRate != null ? "(R$)" : "(US$)"}
          </p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="lyrioRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--viz-axis)" }}
                  interval={dailyChart.length > 20 ? Math.floor(dailyChart.length / 12) : 0}
                />
                <YAxis
                  tickFormatter={(v: number) => fmtCompactMoney(v, cur)}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--viz-axis)" }}
                  width={56}
                />
                <Tooltip
                  cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as { sales: number; revenue: number };
                    return (
                      <div className="rounded-lg border border-border/60 bg-popover px-2.5 py-2 shadow-lg">
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {fmtDay(String(label))}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {cur === "BRL" ? fmtBRL(p.revenue) : fmtUsd(p.revenue)}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtNum(p.sales)} {p.sales === 1 ? "venda" : "vendas"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  name="Receita"
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--viz-series-1)"
                  strokeWidth={2}
                  fill="url(#lyrioRev)"
                  dot={false}
                  activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Breakdown por loja e produto — barras horizontais (magnitude por
          identidade), com receita como rótulo direto. */}
      {(byStore.length > 0 || byProduct.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {byStore.length > 0 && (
            <BreakdownBars
              icon={Store}
              title="Receita por loja"
              color="var(--viz-series-1)"
              money={money}
              rows={byStore.map((s) => ({ label: s.store, sales: s.sales, revenueUsd: s.revenueUsd }))}
            />
          )}
          {byProduct.length > 0 && (
            <BreakdownBars
              icon={Package}
              title="Receita por produto"
              color="var(--viz-series-2)"
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

function Kpi({
  icon: Icon,
  label,
  value,
  highlight,
  hint,
  tooltip,
  big,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
  /** Explicação curta em linguagem simples (aparece abaixo do valor). */
  hint?: string;
  /** Texto no hover (title nativo) — detalhe da conta. */
  tooltip?: string;
  /** Card maior pra métricas-herói. */
  big?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}
      title={tooltip}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        {tooltip && <HelpCircle className="h-3 w-3 shrink-0 opacity-40" />}
      </div>
      <p
        className={`font-bold tabular-nums ${big ? "text-2xl" : "text-base"} ${
          highlight ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BreakdownBars({
  icon: Icon,
  title,
  rows,
  money,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: { label: string; sales: number; revenueUsd: number }[];
  money: (usd: number | null | undefined) => string;
  color: string;
}) {
  const sorted = [...rows].sort((a, b) => b.revenueUsd - a.revenueUsd);
  const max = Math.max(...sorted.map((r) => r.revenueUsd), 0);
  return (
    <div className="rounded-lg border border-border/40 p-3">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </div>
      <div className="space-y-2.5">
        {sorted.map((r) => {
          const pct = max > 0 ? Math.max((r.revenueUsd / max) * 100, 2) : 0;
          return (
            <div key={r.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate" title={r.label}>{r.label}</span>
                <span className="shrink-0 tabular-nums font-medium">
                  {money(r.revenueUsd)}
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                    {fmtNum(r.sales)} {r.sales === 1 ? "venda" : "vendas"}
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Economia por cliente (unit economics) — CAC vs ARPU + Payback.
// Bloco didático: mostra em linguagem simples se cada cliente dá lucro.
// ============================================================

function UnitEconomics({
  cac,
  arpuBrl,
  paybackMonths,
}: {
  cac: number | null;
  arpuBrl: number | null;
  paybackMonths: number | null;
}) {
  // Barra comparativa CAC (custo) vs ARPU (retorno/mês). Escala pelo maior.
  const scale = Math.max(cac ?? 0, arpuBrl ?? 0, 0.01);
  const cacPct = cac != null ? Math.max((cac / scale) * 100, 2) : 0;
  const arpuPct = arpuBrl != null ? Math.max((arpuBrl / scale) * 100, 2) : 0;

  // Leitura de saúde do payback (regra de bolso p/ apps de assinatura:
  // recuperar o CAC em até ~12 meses é saudável).
  let verdict: { label: string; cls: string } | null = null;
  if (paybackMonths != null) {
    if (paybackMonths <= 6)
      verdict = { label: "Excelente — cliente se paga rápido", cls: "text-emerald-600 dark:text-emerald-400" };
    else if (paybackMonths <= 12)
      verdict = { label: "Saudável — dentro do recomendado (até 12 meses)", cls: "text-emerald-600 dark:text-emerald-400" };
    else if (paybackMonths <= 18)
      verdict = { label: "Atenção — demora a se pagar", cls: "text-amber-600 dark:text-amber-400" };
    else verdict = { label: "Crítico — custo de aquisição alto demais", cls: "text-red-600 dark:text-red-400" };
  }

  return (
    <section className="spy-viz space-y-3 rounded-xl border border-border/40 bg-card p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          Economia por cliente
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Cada cliente dá lucro? Compare o custo de trazê-lo com o quanto ele rende por mês.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={Wallet}
          label="CAC"
          value={cac != null ? fmtBRL(cac) : "—"}
          hint="Custo pra trazer 1 cliente novo"
          tooltip="Custo de Aquisição = Investimento Meta (28d) ÷ clientes novos (28d)."
        />
        <Kpi
          icon={Coins}
          label="ARPU"
          value={arpuBrl != null ? fmtBRL(arpuBrl) : "—"}
          hint="Quanto cada assinante rende por mês"
          tooltip="Average Revenue Per User = MRR ÷ assinantes ativos."
        />
        <Kpi
          icon={CalendarClock}
          label="Payback"
          value={fmtMonths(paybackMonths)}
          hint="Meses até o cliente pagar o que custou"
          tooltip="Payback = CAC ÷ ARPU. Quanto menor, mais rápido o cliente se paga."
          highlight
        />
      </div>

      {(cac != null || arpuBrl != null) && (
        <div className="space-y-2 rounded-lg border border-border/40 p-3">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: "var(--viz-series-2)" }}
                />
                Custo pra trazer (CAC)
              </span>
              <span className="tabular-nums font-medium">{cac != null ? fmtBRL(cac) : "—"}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full"
                style={{ width: `${cacPct}%`, backgroundColor: "var(--viz-series-2)" }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: "var(--viz-series-3)" }}
                />
                Rende por mês (ARPU)
              </span>
              <span className="tabular-nums font-medium">{arpuBrl != null ? fmtBRL(arpuBrl) : "—"}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full"
                style={{ width: `${arpuPct}%`, backgroundColor: "var(--viz-series-3)" }}
              />
            </div>
          </div>
          {verdict && (
            <p className={`pt-1 text-[11px] font-medium ${verdict.cls}`}>
              {fmtMonths(paybackMonths)} pra se pagar · {verdict.label}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
