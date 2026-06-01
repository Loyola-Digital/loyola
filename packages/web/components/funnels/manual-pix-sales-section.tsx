"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import type { ManualSale } from "@loyola-x/shared";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useManualSales, useDeleteManualSale } from "@/lib/hooks/use-manual-sales";

interface ManualPixSalesSectionProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  days: number;
  onLaunchClick: () => void;
  onEditSale?: (sale: ManualSale) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

interface CardProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function StatCard({ label, value, highlight }: CardProps) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

export function ManualPixSalesSection({
  projectId,
  funnelId,
  stageId,
  days,
  onLaunchClick,
  onEditSale,
}: ManualPixSalesSectionProps) {
  const { data, isLoading } = useManualSales(projectId, funnelId, stageId, days);
  const deleteMutation = useDeleteManualSale(projectId, funnelId, stageId);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteMutation.mutateAsync(confirmDeleteId);
      toast.success("Venda removida");
      setConfirmDeleteId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao remover venda";
      toast.error(message);
    }
  }

  const sales = data?.sales ?? [];
  const summary = data?.summary;
  const totalSales = summary?.totalSales ?? 0;

  return (
    <section className="space-y-4 pt-6 border-t border-border/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Vendas PIX Direto</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {totalSales} vendas
          </span>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunchClick}>
          <Plus className="h-3.5 w-3.5" />
          Lançar venda manual
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Vendas registradas direto no PIX, separadas das vendas vindas da planilha.
        Filtro: últimos {days} dias.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : totalSales === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Nenhuma venda PIX direto lançada nos últimos {days} dias.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunchClick}>
            <Plus className="h-3.5 w-3.5" />
            Lançar venda manual
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total de vendas" value={String(totalSales)} />
            <StatCard
              label="Faturamento bruto"
              value={formatCurrency(summary?.totalRevenue ?? 0)}
              highlight
            />
            <StatCard label="Ticket médio" value={formatCurrency(summary?.avgTicket ?? 0)} />
          </div>

          {summary && summary.sellersRanking.length > 0 ? (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 text-xs font-medium">
                Ranking de vendedores
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/10 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                    <th className="text-right px-3 py-2 font-medium">Vendas</th>
                    <th className="text-right px-3 py-2 font-medium">Faturamento</th>
                    <th className="text-right px-3 py-2 font-medium">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sellersRanking.map((row) => {
                    const avg =
                      row.totalSales > 0 ? row.totalRevenue / row.totalSales : 0;
                    return (
                      <tr
                        key={row.sellerUserId ?? `name:${row.sellerName}`}
                        className="border-t border-border/30"
                      >
                        <td className="px-3 py-2">{row.sellerName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.totalSales}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatCurrency(row.totalRevenue)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(avg)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 text-xs font-medium">
              Vendas lançadas
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/10 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Data</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Contato</th>
                  <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                  <th className="text-right px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-border/30">
                    <td className="px-3 py-2 tabular-nums">{formatDate(sale.saleDate)}</td>
                    <td className="px-3 py-2">{sale.customerName}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sale.customerEmail ?? sale.customerPhone ?? "—"}
                    </td>
                    <td className="px-3 py-2">{sale.sellerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(sale.value)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEditSale && (
                          <button
                            type="button"
                            onClick={() => onEditSale(sale)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Editar venda"
                            title="Editar venda"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(sale.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remover venda"
                          title="Remover venda"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa venda manual será apagada. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
