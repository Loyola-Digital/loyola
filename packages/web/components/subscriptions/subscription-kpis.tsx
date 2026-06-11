"use client";

import * as React from "react";
import {
  Users,
  CreditCard,
  XCircle,
  RotateCcw,
  DollarSign,
  TrendingUp,
  Clock,
  Percent,
  Repeat,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HotmartDashboard } from "@/lib/hooks/use-hotmart";
import {
  fmtInt,
  fmtPct,
  fmtMonths,
  fmtMoney,
  primary,
  multiCurrencySub,
} from "@/components/subscriptions/format";

const KpiCard = React.forwardRef<
  HTMLDivElement,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    sub?: string;
    gradient?: string;
    border?: string;
  } & React.HTMLAttributes<HTMLDivElement>
>(function KpiCard(
  {
    icon: Icon,
    label,
    value,
    sub,
    gradient = "from-card/80 to-card/40",
    border = "border-border/30",
    className,
    ...rest
  },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-4 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
});

/** Envolve um card com um tooltip de texto (explicação da fórmula/aproximação). */
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

export function SubscriptionKpis({ data }: { data: HotmartDashboard }) {
  const mrr = primary(data.mrr);
  const ltv = primary(data.ltv);
  const refundedVal = primary(data.refunded.totalValue);
  const renewalVal = primary(data.nextMonthRenewals.expectedRevenue);

  const mrrSub = multiCurrencySub(data.mrr);
  const ltvSub = multiCurrencySub(data.ltv);

  return (
    <div className="space-y-3">
      {/* Linha 1: volume */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTooltip explain="Total de assinaturas com adesão no período selecionado (todos os status).">
          <KpiCard
            icon={Users}
            label="Total"
            value={fmtInt(data.totalSubscriptions)}
            sub="no período"
          />
        </KpiTooltip>
        <KpiTooltip explain="Assinaturas com status ACTIVE (vigentes) no momento.">
          <KpiCard
            icon={CreditCard}
            label="Vigentes"
            value={fmtInt(data.activeSubscriptions)}
            sub="status ACTIVE"
            gradient="from-emerald-500/10 to-emerald-600/5"
            border="border-emerald-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Soma de CANCELLED_BY_CUSTOMER + CANCELLED_BY_SELLER + CANCELLED_BY_ADMIN.">
          <KpiCard
            icon={XCircle}
            label="Canceladas"
            value={fmtInt(data.cancelledSubscriptions)}
            sub="3 tipos de cancelamento"
            gradient="from-red-500/10 to-red-600/5"
            border="border-red-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Transações reembolsadas (sales/summary?transaction_status=REFUNDED). Valor na moeda primária.">
          <KpiCard
            icon={RotateCcw}
            label="Reembolsadas"
            value={fmtInt(data.refunded.totalItems)}
            sub={refundedVal ? fmtMoney(refundedVal) : "—"}
            gradient="from-amber-500/10 to-amber-600/5"
            border="border-amber-500/20"
          />
        </KpiTooltip>
      </div>

      {/* Linha 2: financeiro / retenção */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTooltip explain="Aproximação Loyola: Σ (price.value × 30 / recurrency_period) das assinaturas ACTIVE, por moeda. BRL é a moeda primária.">
          <KpiCard
            icon={DollarSign}
            label="MRR"
            value={mrr ? fmtMoney(mrr) : "—"}
            sub={mrrSub ? `+ ${mrrSub}` : "receita recorrente"}
            gradient="from-blue-500/10 to-blue-600/5"
            border="border-blue-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Aproximação Loyola: média de (price.value × lifetime) por assinante, por moeda. BRL é a moeda primária.">
          <KpiCard
            icon={TrendingUp}
            label="LTV"
            value={ltv ? fmtMoney(ltv) : "—"}
            sub={ltvSub ? `+ ${ltvSub}` : "por assinante"}
            gradient="from-purple-500/10 to-purple-600/5"
            border="border-purple-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Aproximação Loyola: média de (lifetime × recurrency_period / 30) em meses.">
          <KpiCard
            icon={Clock}
            label="LT (meses)"
            value={fmtMonths(data.ltMonths)}
            sub="lifetime médio"
            gradient="from-cyan-500/10 to-cyan-600/5"
            border="border-cyan-500/20"
          />
        </KpiTooltip>
        <KpiTooltip explain="Retenção % = ativas / total. Churn aproximado = canceladas / total.">
          <KpiCard
            icon={Percent}
            label="Retenção"
            value={fmtPct(data.retentionRate)}
            sub={`churn ${fmtPct(data.churnRate)}`}
            gradient={
              data.retentionRate >= 0.7
                ? "from-emerald-500/10 to-emerald-600/5"
                : "from-amber-500/10 to-amber-600/5"
            }
            border={data.retentionRate >= 0.7 ? "border-emerald-500/20" : "border-amber-500/20"}
          />
        </KpiTooltip>
      </div>

      {/* Card destacado: renovações do próximo mês */}
      <KpiTooltip explain="Assinaturas ACTIVE cujo date_next_charge cai no próximo mês calendário: quantidade + soma de price.value (receita prevista, moeda primária).">
        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15">
              <Repeat className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                Renovações do próximo mês
              </p>
              <p className="text-xl font-bold tracking-tight">
                {fmtInt(data.nextMonthRenewals.count)} assinaturas
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Receita prevista</p>
            <p className="text-xl font-bold tracking-tight">
              {renewalVal ? fmtMoney(renewalVal) : "—"}
            </p>
            {multiCurrencySub(data.nextMonthRenewals.expectedRevenue) && (
              <p className="text-[10px] text-muted-foreground">
                + {multiCurrencySub(data.nextMonthRenewals.expectedRevenue)}
              </p>
            )}
          </div>
        </div>
      </KpiTooltip>
    </div>
  );
}
