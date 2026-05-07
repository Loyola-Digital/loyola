"use client";

import { DollarSign, Eye, MousePointerClick, ShoppingCart, Target, TrendingUp, Users, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrafficOverview } from "@/lib/hooks/use-traffic-analytics";
import { useStageSalesData } from "@/lib/hooks/use-stage-sales-data";

interface SalesMetaKpisProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  campaignIds: string[];
  days: number;
}

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

function fmtNumber(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}%`;
}

function fmtRoas(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}x`;
}

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}

function KpiCard({ icon: Icon, label, value, hint, highlight }: KpiCardProps) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${highlight ? "border-primary/30 bg-primary/5" : "border-border/50"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-base font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Cruza dados Meta Ads (campanhas vinculadas à etapa) com vendas da planilha
 * pra calcular ROAS, CPA, CPL e demais KPIs financeiros da etapa Vendas.
 */
export function SalesMetaKpis({ projectId, funnelId, stageId, campaignIds, days }: SalesMetaKpisProps) {
  const { data: overview, isLoading: overviewLoading } = useTrafficOverview(
    projectId,
    days,
    campaignIds.length > 0 ? campaignIds : null,
  );
  const { data: salesData, isLoading: salesLoading } = useStageSalesData(
    projectId,
    funnelId,
    stageId,
    "sales",
    days,
  );

  if (campaignIds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma campanha Meta vinculada.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Use &quot;Configurar&quot; → Campanhas Meta Ads pra cruzar vendas com gasto/CPM/ROAS.
        </p>
      </div>
    );
  }

  if (overviewLoading || salesLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const spend = overview?.totalSpend ?? 0;
  const impressions = overview?.totalImpressions ?? 0;
  const clicks = overview?.totalLinkClicks ?? overview?.totalClicks ?? 0;
  const leadsMeta = overview?.totalLeads ?? null;
  const ctr = overview?.ctr ?? null;
  const cpm = overview?.cpm ?? null;
  const avgCpl = overview?.avgCpl ?? null;

  const totalVendas = salesData?.totalVendas ?? 0;
  const faturamento = salesData?.faturamentoBruto ?? 0;
  const roas = spend > 0 ? faturamento / spend : null;
  const cpa = totalVendas > 0 && spend > 0 ? spend / totalVendas : null;
  const margem = spend > 0 ? faturamento - spend : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard icon={DollarSign} label="Faturamento" value={fmtCurrency(faturamento)} highlight />
        <KpiCard icon={ShoppingCart} label="Vendas" value={fmtNumber(totalVendas)} />
        <KpiCard icon={Zap} label="Spend Meta" value={fmtCurrency(spend)} />
        <KpiCard
          icon={TrendingUp}
          label="ROAS"
          value={fmtRoas(roas)}
          hint={margem != null ? `Margem: ${fmtCurrency(margem)}` : undefined}
          highlight
        />
        <KpiCard icon={Target} label="CPA" value={fmtCurrency(cpa)} hint="Spend / vendas" />
        <KpiCard icon={Users} label="CPL" value={fmtCurrency(avgCpl)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard icon={Eye} label="Impressões" value={fmtNumber(impressions)} />
        <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNumber(clicks)} />
        <KpiCard icon={Users} label="Leads Meta" value={fmtNumber(leadsMeta)} />
        <KpiCard icon={TrendingUp} label="CTR / CPM" value={`${fmtPercent(ctr)} • ${fmtCurrency(cpm)}`} />
      </div>
    </div>
  );
}
