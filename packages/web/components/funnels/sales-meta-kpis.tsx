"use client";

import { ArrowRight, DollarSign, Eye, FileText, MousePointerClick, Percent, ShoppingCart, Target, TrendingUp, Zap } from "lucide-react";
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
  const lpViews = overview?.totalLandingPageViews ?? null;
  const checkouts = overview?.totalCheckouts ?? null;
  const ctr = overview?.ctr ?? null;
  const cpm = overview?.cpm ?? null;

  const totalVendas = salesData?.totalVendas ?? 0;
  const faturamento = salesData?.faturamentoBruto ?? 0;
  const roas = spend > 0 ? faturamento / spend : null;
  const cpv = totalVendas > 0 && spend > 0 ? spend / totalVendas : null;
  const margem = spend > 0 ? faturamento - spend : null;

  // Taxas de conversão do funil de venda
  const taxaLpCheckout = lpViews && lpViews > 0 && checkouts != null ? (checkouts / lpViews) * 100 : null;
  const taxaCheckoutVenda = checkouts && checkouts > 0 && totalVendas > 0 ? (totalVendas / checkouts) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Cards principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
        <KpiCard icon={Target} label="CPV" value={fmtCurrency(cpv)} hint="Custo por venda" />
      </div>

      {/* Funil de conversão: Impressões → Cliques → LP Views → Checkouts → Vendas */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Funil de Conversão</p>
        <div className="flex items-stretch gap-1">
          <FunnelStage icon={Eye} label="Impressões" value={fmtNumber(impressions)} />
          <FunnelArrow />
          <FunnelStage icon={MousePointerClick} label="Cliques" value={fmtNumber(clicks)} />
          <FunnelArrow />
          <FunnelStage icon={FileText} label="LP Views" value={fmtNumber(lpViews)} />
          <FunnelArrow />
          <FunnelStage icon={ShoppingCart} label="Checkouts" value={fmtNumber(checkouts)} />
          <FunnelArrow />
          <FunnelStage icon={DollarSign} label="Vendas" value={fmtNumber(totalVendas)} highlight />
        </div>
      </div>

      {/* Taxas de conversão e métricas Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          icon={Percent}
          label="LP → Checkout"
          value={fmtPercent(taxaLpCheckout)}
          hint="Checkouts / LP Views"
        />
        <KpiCard
          icon={Percent}
          label="Checkout → Venda"
          value={fmtPercent(taxaCheckoutVenda)}
          hint="Vendas / Checkouts"
          highlight
        />
        <KpiCard icon={TrendingUp} label="CTR" value={fmtPercent(ctr)} />
        <KpiCard icon={DollarSign} label="CPM" value={fmtCurrency(cpm)} />
      </div>
    </div>
  );
}

interface FunnelStageProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}

function FunnelStage({ icon: Icon, label, value, highlight }: FunnelStageProps) {
  return (
    <div className={`flex-1 rounded-lg border p-3 space-y-1 min-w-0 ${highlight ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-sm font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function FunnelArrow() {
  return (
    <div className="flex items-center text-muted-foreground/50 shrink-0">
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}
