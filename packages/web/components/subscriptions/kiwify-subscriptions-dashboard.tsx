"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  PackageOpen,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  TrendingUp,
  CreditCard,
  RotateCcw,
  ShieldAlert,
  Clock,
  Percent,
  Repeat,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useKiwifyProducts,
  useKiwifyDashboard,
  type KiwifyDashboard,
  type KiwifyMoneyByCurrency,
} from "@/lib/hooks/use-kiwify";
import { ProductPicker } from "@/components/subscriptions/product-picker";
import { PeriodPicker } from "@/components/subscriptions/period-picker";
import { StatusDistributionChart } from "@/components/subscriptions/status-distribution-chart";
import { fmtInt, fmtPct } from "@/components/subscriptions/format";

// ============================================================
// Story 35.5 — Dashboard de recorrência Kiwify (UI honesta).
//
// SUBSTITUI o placeholder da 35.4 mantendo a assinatura pública
// `KiwifySubscriptionsDashboard({ projectId })`.
//
// Espelha subscriptions-dashboard.tsx (Hotmart, 34.5), trocando os hooks por
// useKiwifyProducts/useKiwifyDashboard e o set de KPIs. Diferença conceitual:
// a Kiwify NÃO expõe estado de assinatura via pull (não existe /subscriptions),
// então os cards "Assinaturas vigentes" e "Churn" são GAPS HONESTOS —
// desabilitados com tooltip "fase 2 / webhooks". Nunca exibir número inventado.
//
// Valores monetários vêm em CENTAVOS (KiwifyMoneyByCurrency.value) e são
// formatados dividindo por 100 (fmtCentavos abaixo).
// ============================================================

const DEFAULT_MONTHS = 12;

const GAP_TOOLTIP =
  "Requer integração de webhooks (fase 2) — a API pública da Kiwify não expõe estado de assinatura.";

interface Props {
  /** Renderizado apenas quando a conexão Kiwify já existe. Dashboard é leitura para todos. */
  projectId: string;
}

// ---- Formatação de moeda em centavos ----

/** Formata um valor em CENTAVOS na própria moeda (divide por 100). */
function fmtCentavos(m?: KiwifyMoneyByCurrency): string {
  if (!m) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: m.currency,
  }).format(m.value / 100);
}

/** Moeda primária: a que casa com currencyPrimary, senão a primeira da lista. */
function primaryMoney(
  metrics: KiwifyMoneyByCurrency[] | undefined,
  primaryCurrency: string,
): KiwifyMoneyByCurrency | undefined {
  if (!metrics || metrics.length === 0) return undefined;
  return metrics.find((m) => m.currency === primaryCurrency) ?? metrics[0];
}

/** Sub-texto com as moedas secundárias (nunca somar moedas diferentes). */
function multiCurrencySub(
  metrics: KiwifyMoneyByCurrency[] | undefined,
  primaryCurrency: string,
): string | undefined {
  const p = primaryMoney(metrics, primaryCurrency);
  if (!p) return undefined;
  const others = (metrics ?? []).filter((m) => m.currency !== p.currency);
  if (others.length === 0) return undefined;
  return others.map((m) => fmtCentavos(m)).join(" · ");
}

export function KiwifySubscriptionsDashboard({ projectId }: Props) {
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const products = useKiwifyProducts(projectId, { months, enabled: true });
  const productList = products.data?.products ?? [];

  // Default = primeiro produto recorrente retornado. Se o produto selecionado
  // sumir da lista (troca de período), reseleciona o primeiro disponível.
  useEffect(() => {
    if (productList.length === 0) {
      setSelectedProductId(null);
      return;
    }
    setSelectedProductId((prev) => {
      if (prev && productList.some((p) => p.id === prev)) return prev;
      return productList[0].id;
    });
  }, [productList]);

  const dashboard = useKiwifyDashboard(projectId, {
    productId: selectedProductId,
    months,
    enabled: true,
  });

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2">
          <ProductPicker
            products={productList}
            value={selectedProductId}
            onChange={setSelectedProductId}
            loading={products.isLoading}
          />
          <PeriodPicker value={months} onChange={setMonths} />
        </div>

        {products.isError ? (
          <ErrorState onRetry={() => products.refetch()} />
        ) : products.isLoading ? (
          <DashboardSkeleton />
        ) : productList.length === 0 ? (
          <EmptyState
            title="Nenhum produto de assinatura no período"
            subtitle="Tente ampliar o período ou verifique se há produtos recorrentes na Kiwify."
          />
        ) : dashboard.isLoading ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <ErrorState onRetry={() => dashboard.refetch()} />
        ) : dashboard.data ? (
          <div className="space-y-5">
            <KiwifyKpis data={dashboard.data} />
            <StatusDistributionChart distribution={dashboard.data.statusDistribution} />
          </div>
        ) : (
          <EmptyState
            title="Selecione um produto"
            subtitle="Escolha um produto recorrente no seletor acima para ver o dashboard de recorrência."
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ---- KPIs ----

const KpiCard = React.forwardRef<
  HTMLDivElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    gradient?: string;
    border?: string;
    /** Card de gap honesto: visual esmaecido + cadeado. */
    disabled?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
>(function KpiCard(
  {
    icon: Icon,
    label,
    value,
    sub,
    gradient = "from-card/80 to-card/40",
    border = "border-border/30",
    disabled = false,
    className,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-4 ${
        disabled ? "opacity-60" : ""
      } ${className ?? ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {label}
        </span>
        {disabled ? (
          <Lock className="h-4 w-4 text-muted-foreground/50" />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
});

/** Envolve um card com um tooltip de texto (explicação da fórmula/aproximação/gap). */
function KpiTooltip({ explain, children }: { explain: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] p-2 text-xs leading-relaxed">
        {explain}
      </TooltipContent>
    </Tooltip>
  );
}

function KiwifyKpis({ data }: { data: KiwifyDashboard }) {
  const cur = data.currencyPrimary;

  const revenue = primaryMoney(data.recurringRevenue, cur);
  const revenueSub = multiCurrencySub(data.recurringRevenue, cur);

  const mrr = primaryMoney(data.mrrApprox, cur);
  const mrrSub = multiCurrencySub(data.mrrApprox, cur);

  const paidVal = primaryMoney(data.charges.paid.value, cur);
  const refundedVal = primaryMoney(data.charges.refunded.value, cur);
  const chargebackVal = primaryMoney(data.charges.chargeback.value, cur);

  const totalChanges = data.newVsRenewal.new + data.newVsRenewal.renewal;
  const renewalPct = totalChanges > 0 ? data.newVsRenewal.renewal / totalChanges : 0;

  return (
    <div className="space-y-3">
      {/* Linha 1: receita */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTooltip explain="Soma do net_amount (vendas paid/approved) do produto no período selecionado, por moeda. Valores na moeda primária; outras moedas no subtexto.">
          <KpiCard
            icon={DollarSign}
            label="Receita recorrente"
            value={fmtCentavos(revenue)}
            sub={revenueSub ? `+ ${revenueSub}` : "no período"}
            gradient="from-emerald-500/10 to-emerald-600/5"
            border="border-emerald-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Aproximação: receita recorrente dos últimos 30 dias — NÃO é MRR contratual. A API da Kiwify não expõe estado de assinatura; isto reflete o que foi efetivamente cobrado no mês.">
          <KpiCard
            icon={TrendingUp}
            label="MRR aproximado"
            value={fmtCentavos(mrr)}
            sub={mrrSub ? `+ ${mrrSub}` : "últimos 30 dias (aprox.)"}
            gradient="from-blue-500/10 to-blue-600/5"
            border="border-blue-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Novos = vendas sem parent_order_id (primeira cobrança). Renovações = vendas com parent_order_id (cobranças subsequentes da mesma assinatura).">
          <KpiCard
            icon={Repeat}
            label="Novos vs renovações"
            value={`${fmtInt(data.newVsRenewal.new)} / ${fmtInt(data.newVsRenewal.renewal)}`}
            sub={totalChanges > 0 ? `${fmtPct(renewalPct)} renovação` : "novos / renovações"}
            gradient="from-indigo-500/10 to-indigo-600/5"
            border="border-indigo-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Taxa de reembolso e de chargeback do produto no período, vindas de /v1/stats da Kiwify.">
          <KpiCard
            icon={Percent}
            label="Taxas"
            value={fmtPct(data.refundRate)}
            sub={`chargeback ${fmtPct(data.chargebackRate)}`}
            gradient="from-amber-500/10 to-amber-600/5"
            border="border-amber-500/20"
          />
        </KpiTooltip>
      </div>

      {/* Linha 2: cobranças por bucket de status */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTooltip explain="Cobranças com status paid + approved: quantidade e valor (moeda primária).">
          <KpiCard
            icon={CreditCard}
            label="Pagas"
            value={fmtInt(data.charges.paid.count)}
            sub={fmtCentavos(paidVal)}
            gradient="from-emerald-500/10 to-emerald-600/5"
            border="border-emerald-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Cobranças reembolsadas: refunded + refund_requested + pending_refund. Quantidade e valor (moeda primária).">
          <KpiCard
            icon={RotateCcw}
            label="Reembolsadas"
            value={fmtInt(data.charges.refunded.count)}
            sub={fmtCentavos(refundedVal)}
            gradient="from-amber-500/10 to-amber-600/5"
            border="border-amber-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Cobranças com chargeback (chargedback). Quantidade e valor (moeda primária).">
          <KpiCard
            icon={ShieldAlert}
            label="Chargeback"
            value={fmtInt(data.charges.chargeback.count)}
            sub={fmtCentavos(chargebackVal)}
            gradient="from-red-500/10 to-red-600/5"
            border="border-red-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Cobranças pendentes: waiting_payment + pending + processing + authorized. Apenas a quantidade (ainda sem receita confirmada).">
          <KpiCard
            icon={Clock}
            label="Pendentes"
            value={fmtInt(data.charges.pending.count)}
            sub="aguardando confirmação"
            gradient="from-slate-500/10 to-slate-600/5"
            border="border-slate-500/20"
          />
        </KpiTooltip>
      </div>

      {/* Linha 3: cards de GAP HONESTO — desabilitados, sem número inventado */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTooltip explain={GAP_TOOLTIP}>
          <KpiCard
            icon={CreditCard}
            label="Assinaturas vigentes"
            value="—"
            sub="indisponível (fase 2)"
            disabled
          />
        </KpiTooltip>
        <KpiTooltip explain={GAP_TOOLTIP}>
          <KpiCard
            icon={Percent}
            label="Churn"
            value="—"
            sub="indisponível (fase 2)"
            disabled
          />
        </KpiTooltip>
      </div>
    </div>
  );
}

// ---- Estados ----

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <PackageOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <p className="font-semibold">Erro ao carregar o dashboard</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Não foi possível buscar os dados de recorrência da Kiwify. Tente novamente em instantes.
      </p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Tentar novamente
      </Button>
    </div>
  );
}
