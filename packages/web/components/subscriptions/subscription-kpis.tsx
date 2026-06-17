"use client";

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
import type { HotmartDashboard } from "@/lib/hooks/use-hotmart";
import {
  fmtInt,
  fmtPct,
  fmtMonths,
  fmtMoney,
  primary,
  multiCurrencySub,
} from "@/components/subscriptions/format";
import { KpiCard, KpiTooltip, KpiSectionLabel } from "@/components/subscriptions/kpi-card";

export function SubscriptionKpis({ data }: { data: HotmartDashboard }) {
  const mrr = primary(data.mrr);
  const ltv = primary(data.ltv);
  const refundedVal = primary(data.refunded.totalValue);
  const renewalVal = primary(data.nextMonthRenewals.expectedRevenue);

  const mrrSub = multiCurrencySub(data.mrr);
  const ltvSub = multiCurrencySub(data.ltv);
  const renewalSub = multiCurrencySub(data.nextMonthRenewals.expectedRevenue);

  return (
    <div className="space-y-5">
      {/* Volume */}
      <section>
        <KpiSectionLabel>Assinaturas</KpiSectionLabel>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiTooltip explain="Total de assinaturas com adesão no período selecionado (todos os status).">
            <KpiCard icon={Users} label="Total" value={fmtInt(data.totalSubscriptions)} sub="no período" />
          </KpiTooltip>
          <KpiTooltip explain="Assinaturas com status ACTIVE (vigentes) no momento.">
            <KpiCard
              icon={CreditCard}
              label="Vigentes"
              value={fmtInt(data.activeSubscriptions)}
              sub="status ACTIVE"
              tone="positive"
            />
          </KpiTooltip>
          <KpiTooltip explain="Soma de CANCELLED_BY_CUSTOMER + CANCELLED_BY_SELLER + CANCELLED_BY_ADMIN.">
            <KpiCard
              icon={XCircle}
              label="Canceladas"
              value={fmtInt(data.cancelledSubscriptions)}
              sub="3 tipos de cancelamento"
              tone="negative"
            />
          </KpiTooltip>
          <KpiTooltip explain="Transações reembolsadas (sales/summary?transaction_status=REFUNDED). Valor na moeda primária.">
            <KpiCard
              icon={RotateCcw}
              label="Reembolsadas"
              value={fmtInt(data.refunded.totalItems)}
              sub={refundedVal ? fmtMoney(refundedVal) : "—"}
              tone="warning"
            />
          </KpiTooltip>
        </div>
      </section>

      {/* Financeiro / retenção */}
      <section>
        <KpiSectionLabel>Financeiro e retenção</KpiSectionLabel>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiTooltip explain="Aproximação Loyola: Σ (price.value × 30 / recurrency_period) das assinaturas ACTIVE, por moeda. BRL é a moeda primária.">
            <KpiCard
              icon={DollarSign}
              label="MRR"
              value={mrr ? fmtMoney(mrr) : "—"}
              sub={mrrSub ? `+ ${mrrSub}` : "receita recorrente"}
            />
          </KpiTooltip>
          <KpiTooltip explain="Aproximação Loyola: média de (price.value × lifetime) por assinante, por moeda. BRL é a moeda primária.">
            <KpiCard
              icon={TrendingUp}
              label="LTV"
              value={ltv ? fmtMoney(ltv) : "—"}
              sub={ltvSub ? `+ ${ltvSub}` : "por assinante"}
            />
          </KpiTooltip>
          <KpiTooltip explain="Aproximação Loyola: média de (lifetime × recurrency_period / 30) em meses.">
            <KpiCard
              icon={Clock}
              label="LT (meses)"
              value={fmtMonths(data.ltMonths)}
              sub="lifetime médio"
            />
          </KpiTooltip>
          <KpiTooltip explain="Retenção % = ativas / total. Churn aproximado = canceladas / total.">
            <KpiCard
              icon={Percent}
              label="Retenção"
              value={fmtPct(data.retentionRate)}
              sub={`churn ${fmtPct(data.churnRate)}`}
              tone={data.retentionRate >= 0.7 ? "positive" : "warning"}
            />
          </KpiTooltip>
        </div>
      </section>

      {/* Renovações do próximo mês — destaque limpo, sem gradiente */}
      <KpiTooltip explain="Assinaturas ACTIVE cujo date_next_charge cai no próximo mês calendário: quantidade + soma de price.value (receita prevista, moeda primária).">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/15">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Repeat className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Renovações do próximo mês
              </p>
              <p className="text-xl font-semibold tracking-tight tabular-nums">
                {fmtInt(data.nextMonthRenewals.count)} assinaturas
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Receita prevista</p>
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {renewalVal ? fmtMoney(renewalVal) : "—"}
            </p>
            {renewalSub && (
              <p className="text-xs tabular-nums text-muted-foreground">+ {renewalSub}</p>
            )}
          </div>
        </div>
      </KpiTooltip>
    </div>
  );
}
