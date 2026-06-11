"use client";

import { useEffect, useState } from "react";
import { PackageOpen, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useHotmartProducts, useHotmartDashboard } from "@/lib/hooks/use-hotmart";
import { ProductPicker } from "@/components/subscriptions/product-picker";
import { PeriodPicker } from "@/components/subscriptions/period-picker";
import { SubscriptionKpis } from "@/components/subscriptions/subscription-kpis";
import { StatusDistributionChart } from "@/components/subscriptions/status-distribution-chart";

const DEFAULT_MONTHS = 12;

interface Props {
  /** Renderizado apenas quando a conexão Hotmart já existe. Dashboard é leitura para todos. */
  projectId: string;
}

export function SubscriptionsDashboard({ projectId }: Props) {
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const products = useHotmartProducts(projectId, { months, enabled: true });
  const productList = products.data?.products ?? [];

  // Default = primeiro produto retornado. Se o produto selecionado sumir da
  // lista (troca de período), reseleciona o primeiro disponível.
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

  const dashboard = useHotmartDashboard(projectId, {
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

        {/* Erro ao carregar produtos */}
        {products.isError ? (
          <ErrorState onRetry={() => products.refetch()} />
        ) : products.isLoading ? (
          <DashboardSkeleton />
        ) : productList.length === 0 ? (
          <EmptyState
            title="Nenhum produto com assinaturas no período"
            subtitle="Tente ampliar o período ou verifique se há assinaturas ativas na Hotmart."
          />
        ) : dashboard.isLoading ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <ErrorState onRetry={() => dashboard.refetch()} />
        ) : dashboard.data ? (
          <div className="space-y-5">
            <SubscriptionKpis data={dashboard.data} />
            <StatusDistributionChart distribution={dashboard.data.statusDistribution} />
          </div>
        ) : (
          <EmptyState
            title="Selecione um produto"
            subtitle="Escolha um produto no seletor acima para ver o dashboard de assinaturas."
          />
        )}
      </div>
    </TooltipProvider>
  );
}

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
      <Skeleton className="h-20 rounded-xl" />
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
      <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
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
      <p className="text-sm text-muted-foreground max-w-sm">
        Não foi possível buscar os dados de assinaturas. Tente novamente em instantes.
      </p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Tentar novamente
      </Button>
    </div>
  );
}
