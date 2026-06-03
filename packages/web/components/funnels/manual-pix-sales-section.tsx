"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Wallet, FileSpreadsheet, ReceiptText } from "lucide-react";
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
import { useAllSales, useDeleteManualSale, useManualSales } from "@/lib/hooks/use-manual-sales";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function InvoiceBadge({ status }: { status: "emitida" | "pendente" | null }) {
  if (!status) return <span className="text-muted-foreground/60">—</span>;
  if (status === "emitida") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <ReceiptText className="h-2.5 w-2.5" />
        Emitida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <ReceiptText className="h-2.5 w-2.5" />
      Pendente
    </span>
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
  const { data, isLoading } = useAllSales(projectId, funnelId, stageId, "all", days);
  const { data: manualPayload } = useManualSales(projectId, funnelId, stageId, days);
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
  const manualMap = new Map<string, ManualSale>(
    (manualPayload?.sales ?? []).map((s) => [s.id, s]),
  );

  return (
    <section className="space-y-4 pt-6 border-t border-border/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Vendas (Kiwify + PIX direto)</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {summary?.totalSales ?? 0} venda(s)
          </span>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunchClick}>
          <Plus className="h-3.5 w-3.5" />
          Lançar venda manual
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Vendas da planilha Kiwify e vendas PIX direto lançadas manualmente. Filtro: últimos {days} dias.
        Só vendas manuais podem ser editadas/removidas.
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : sales.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Nenhuma venda registrada nos últimos {days} dias.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunchClick}>
            <Plus className="h-3.5 w-3.5" />
            Lançar venda manual
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total de vendas" value={String(summary?.totalSales ?? 0)} />
            <StatCard
              label="Faturamento total"
              value={formatCurrency(summary?.totalRevenue ?? 0)}
              highlight
              tooltip={
                summary
                  ? `Planilha: ${formatCurrency(summary.spreadsheetRevenue)} (${summary.spreadsheetSales})\nManuais: ${formatCurrency(summary.manualRevenue)} (${summary.manualSales})`
                  : undefined
              }
            />
            <StatCard
              label="Ticket médio"
              value={formatCurrency(
                summary && summary.totalSales > 0
                  ? summary.totalRevenue / summary.totalSales
                  : 0,
              )}
            />
          </div>

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 text-xs font-medium flex items-center gap-2">
              <span>Vendas</span>
              <span className="text-muted-foreground font-normal">
                · Manuais aparecem com 🟢 e podem ser editadas/removidas
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted/10 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Data</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Produto</th>
                  <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                  <th className="text-left px-3 py-2 font-medium">NF</th>
                  <th className="text-right px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-border/30">
                    <td className="px-3 py-2 tabular-nums">{formatDate(sale.saleDate)}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate" title={sale.customerName ?? ""}>
                      <span className="inline-flex items-center gap-1.5">
                        {sale.source === "manual" ? (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                            title="Venda manual (PIX direto)"
                          />
                        ) : (
                          <FileSpreadsheet
                            className="h-3 w-3 text-muted-foreground/60 shrink-0"
                            aria-label="Vinda da planilha"
                          />
                        )}
                        <span className="truncate">{sale.customerName ?? "—"}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">
                      {sale.product ?? "—"}
                    </td>
                    <td className="px-3 py-2">{sale.sellerName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <InvoiceBadge status={sale.invoiceStatus} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(sale.value)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {sale.source === "manual" && sale.manualSaleId ? (
                        <div className="flex items-center justify-end gap-2">
                          {onEditSale && (
                            <button
                              type="button"
                              onClick={() => {
                                const ms = manualMap.get(sale.manualSaleId!);
                                if (ms) onEditSale(ms);
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Editar venda"
                              title="Editar venda"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(sale.manualSaleId!)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Remover venda"
                            title="Remover venda"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40" title="Vendas da planilha são read-only">
                          —
                        </span>
                      )}
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

interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: string;
}

function StatCard({ label, value, highlight, tooltip }: StatCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-1 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}
      title={tooltip}
    >
      <p className="text-xs text-muted-foreground">
        {label}
        {tooltip && (
          <span
            className="ml-1 text-[9px] text-muted-foreground/60 cursor-help"
            title={tooltip}
          >
            (i)
          </span>
        )}
      </p>
      <p
        className={`text-lg font-bold ${highlight ? "text-primary" : ""} whitespace-pre-wrap`}
      >
        {value}
      </p>
    </div>
  );
}
