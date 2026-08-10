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
import { useCampaignPicker } from "@/lib/hooks/use-funnels";
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

      {/* RevenueCat — métricas ao vivo (API) + vendas do período (webhook) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">RevenueCat</h2>
        <RevenuecatOverviewPanel
          loading={overview.isLoading}
          connected={connected}
          data={overview.data}
          onConfigure={() => setSettingsOpen(true)}
        />
        <RevenuecatPanel
          loading={sales.isLoading}
          connected={connected}
          data={sales.data}
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
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatSales>["data"];
  onConfigure: () => void;
}) {
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
        <Kpi icon={DollarSign} label="Receita (USD)" value={fmtUsd(revenueUsd)} highlight />
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
                        {fmtUsd(p.revenueUsd)}
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
              rows={byStore.map((s) => ({ label: s.store, sales: s.sales, revenueUsd: s.revenueUsd }))}
            />
          )}
          {byProduct.length > 0 && (
            <BreakdownTable
              icon={Package}
              title="Por produto"
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

function fmtMetric(m: RevenuecatMetric): string {
  if (isMoneyMetric(m)) return fmtUsd(m.value);
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
  onConfigure,
}: {
  loading: boolean;
  connected: boolean;
  data: ReturnType<typeof useRevenuecatOverview>["data"];
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
            value={fmtMetric(m)}
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-base font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function BreakdownTable({
  icon: Icon,
  title,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: { label: string; sales: number; revenueUsd: number }[];
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
              <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(r.revenueUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
