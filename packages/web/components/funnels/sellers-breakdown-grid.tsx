"use client";

import {
  useSellersBreakdown,
  type SellerBandKey,
  type SellerRow,
} from "@/lib/hooks/use-sellers-breakdown";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const BAND_ORDER: SellerBandKey[] = ["A", "B", "C", "D", "no_profile"];

const BAND_LABEL: Record<SellerBandKey, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  no_profile: "Sem perfil",
};

const BAND_COLOR: Record<SellerBandKey, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-amber-500",
  D: "bg-rose-500",
  no_profile: "bg-muted-foreground/40",
};

const BAND_TEXT: Record<SellerBandKey, string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-blue-600 dark:text-blue-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-rose-600 dark:text-rose-400",
  no_profile: "text-muted-foreground",
};

function SellerCard({ seller }: { seller: SellerRow }) {
  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold truncate" title={seller.utmSource}>
          {seller.utmSource}
        </p>
        <span
          className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${BAND_TEXT[seller.dominantBand]} bg-muted/50`}
          title="Banda dominante"
        >
          {BAND_LABEL[seller.dominantBand]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Vendas</p>
          <p className="text-base font-bold">{seller.totalSales}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Receita</p>
          <p className="text-base font-bold">{formatCurrency(seller.totalRevenue)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-muted-foreground">Ticket médio</p>
          <p className="text-sm font-semibold">{formatCurrency(seller.avgTicket)}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Distribuição por banda</p>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/30">
          {BAND_ORDER.map((k) => {
            const pct = seller.bandsPct[k];
            if (pct === 0) return null;
            return (
              <div
                key={k}
                className={BAND_COLOR[k]}
                style={{ width: `${pct}%` }}
                title={`${BAND_LABEL[k]}: ${seller.bands[k]} (${pct}%)`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {BAND_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${BAND_COLOR[k]}`} />
              {BAND_LABEL[k]} {seller.bands[k]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SellersBreakdownGridProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  /** Story 19.8: filtra planilha de venda (capture/main_product/sales). */
  subtype?: string;
  startDate?: string;
  endDate?: string;
}

export function SellersBreakdownGrid({
  projectId,
  funnelId,
  stageId,
  subtype,
  startDate,
  endDate,
}: SellersBreakdownGridProps) {
  const { data, isLoading, isError } = useSellersBreakdown(projectId, funnelId, stageId, {
    startDate,
    endDate,
    subtype,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">Erro ao carregar breakdown de vendedores.</p>
    );
  }

  if (data.semDados || data.sellers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {data.hasScoringConfig
          ? "Sem vendas no período selecionado."
          : "Configure o lead scoring e o survey desta etapa para ver o breakdown por perfil."}
      </p>
    );
  }

  const { coverage, hasScoringConfig } = data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-muted-foreground">
          {data.sellers.length} vendedor(es) · {coverage.total} venda(s)
        </p>
        <p className="text-muted-foreground">
          {hasScoringConfig ? (
            <>
              Cobertura de perfil: <span className="font-semibold">{coverage.pct}%</span>{" "}
              ({coverage.matched}/{coverage.total} matched por email)
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              Lead scoring não configurado — todos vão pra &quot;Sem perfil&quot;
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.sellers.map((s) => (
          <SellerCard key={s.utmSource} seller={s} />
        ))}
      </div>
    </div>
  );
}
