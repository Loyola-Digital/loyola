"use client";

import { ArrowRight, GitMerge, Percent, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStageSalesConversion } from "@/lib/hooks/use-stage-sales-conversion";

interface SalesConversionCardProps {
  projectId: string;
  funnelId: string;
  stageId: string;
}

function fmtCurrency(val: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(val);
}

function fmtNumber(val: number): string {
  return val.toLocaleString("pt-BR");
}

function fmtPercent(val: number): string {
  return `${val.toFixed(2)}%`;
}

/**
 * Cruzamento de compradores entre planilhas capture (Produto de Captação) e
 * main_product (Produto Principal) da mesma etapa Vendas. Mostra:
 *   - Compradores de cada lado
 *   - Cross-buyers (compraram os dois)
 *   - Taxa de conversão Captação → Principal
 *   - Faturamento atribuível
 */
export function SalesConversionCard({ projectId, funnelId, stageId }: SalesConversionCardProps) {
  const { data, isLoading } = useStageSalesConversion(projectId, funnelId, stageId);

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  if (!data || (!data.hasCapture && !data.hasMain)) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Conecte as duas planilhas (Captação e Principal) pra ver a conversão.</p>
      </div>
    );
  }

  if (!data.hasCapture || !data.hasMain) {
    const missing = !data.hasCapture ? "Produto de Captação" : "Produto Principal";
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Falta conectar a planilha de <strong>{missing}</strong> pra calcular a conversão Captação → Principal.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Conversão Captação → Principal</h3>
      </div>

      {/* Funil visual */}
      <div className="flex items-stretch gap-1">
        <ConversionStage
          icon={Users}
          label="Compraram Captação"
          count={data.captureBuyers}
          revenue={data.captureRevenue}
        />
        <ConversionArrow />
        <ConversionStage
          icon={Users}
          label="Compraram os 2"
          count={data.crossBuyers}
          revenue={data.crossRevenue}
          highlight
        />
        <ConversionArrow />
        <ConversionStage
          icon={Users}
          label="Compraram Principal"
          count={data.mainBuyers}
          revenue={data.mainRevenue}
          subtle
        />
      </div>

      {/* Taxa */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Percent className="h-3.5 w-3.5" />
            Taxa de Conversão
          </div>
          <p className="text-xl font-bold text-primary">{fmtPercent(data.conversionRate)}</p>
          <p className="text-[10px] text-muted-foreground">
            {fmtNumber(data.crossBuyers)} de {fmtNumber(data.captureBuyers)} compradores de Captação
          </p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitMerge className="h-3.5 w-3.5" />
            Faturamento Cross
          </div>
          <p className="text-xl font-bold">{fmtCurrency(data.crossRevenue)}</p>
          <p className="text-[10px] text-muted-foreground">
            Receita de Principal vinda de quem comprou Captação
          </p>
        </div>
      </div>
    </div>
  );
}

interface ConversionStageProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  revenue: number;
  highlight?: boolean;
  subtle?: boolean;
}

function ConversionStage({ icon: Icon, label, count, revenue, highlight, subtle }: ConversionStageProps) {
  const borderClass = highlight
    ? "border-primary/40 bg-primary/5"
    : subtle
      ? "border-border/40 bg-muted/20"
      : "border-border/50";
  return (
    <div className={`flex-1 rounded-lg border p-3 space-y-1 min-w-0 ${borderClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{fmtNumber(count)}</p>
      <p className="text-[10px] text-muted-foreground">{fmtCurrency(revenue)}</p>
    </div>
  );
}

function ConversionArrow() {
  return (
    <div className="flex items-center text-muted-foreground/50 shrink-0">
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}
