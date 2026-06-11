"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Wallet, FileSpreadsheet, ReceiptText } from "lucide-react";
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
import {
  useAllSales,
  useDeleteManualSale,
  useManualSales,
  type UnifiedSale,
} from "@/lib/hooks/use-manual-sales";

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

// Filtro por plataforma/origem. Os dados unificados só distinguem 3 fontes de
// forma limpa: venda manual (PIX), planilha TMB e planilha de Produto Principal
// (export do checkout — ex: Kiwify). Captação e "Outras planilhas" não entram
// nessa tabela, então não aparecem como opção.
type Platform = "all" | "main" | "tmb" | "manual";

const PLATFORM_LABELS: Record<Exclude<Platform, "all">, string> = {
  main: "Produto Principal",
  tmb: "TMB",
  manual: "Manual (PIX)",
};

function salePlatform(sale: UnifiedSale): Exclude<Platform, "all"> {
  if (sale.source === "manual") return "manual";
  if (sale.sourceLabel === "TMB") return "tmb";
  return "main";
}

export function ManualPixSalesSection({
  projectId,
  funnelId,
  stageId,
  days,
  onLaunchClick,
  onEditSale,
}: ManualPixSalesSectionProps) {
  // Tabela unificada puxa só Produto Principal + TMB (planilhas) + vendas
  // manuais (PIX). Captação e "Outras planilhas" (subtype sales) ficam de fora.
  const { data, isLoading } = useAllSales(projectId, funnelId, stageId, "main_product,tmb", days);
  const { data: manualPayload } = useManualSales(projectId, funnelId, stageId, days);
  const deleteMutation = useDeleteManualSale(projectId, funnelId, stageId);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

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

  const [platform, setPlatform] = useState<Platform>("all");

  // Contagem por plataforma pros chips de filtro (sobre o conjunto completo).
  const counts = useMemo(() => {
    const c = { all: sales.length, main: 0, tmb: 0, manual: 0 };
    for (const s of sales) c[salePlatform(s)] += 1;
    return c;
  }, [sales]);

  const filteredSales = useMemo(
    () =>
      platform === "all"
        ? sales
        : sales.filter((s) => salePlatform(s) === platform),
    [sales, platform],
  );

  // Cards refletem o filtro ativo: total, faturamento e ticket médio são
  // recalculados sobre o conjunto filtrado.
  const filteredSummary = useMemo(() => {
    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.value, 0);
    return {
      totalSales: filteredSales.length,
      totalRevenue,
      ticket: filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0,
    };
  }, [filteredSales]);

  function selectPlatform(p: Platform) {
    setPlatform(p);
    setPage(0);
  }

  // Story 19.9 ext: paginação 10/página (sobre o conjunto filtrado)
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleSales = useMemo(
    () => filteredSales.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filteredSales, safePage],
  );

  return (
    <section className="space-y-4 pt-6 border-t border-border/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Vendas (Produto Principal + TMB + PIX direto)</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            {filteredSummary.totalSales} venda(s)
            {platform !== "all" && (
              <span className="opacity-70"> · {PLATFORM_LABELS[platform]}</span>
            )}
          </span>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onLaunchClick}>
          <Plus className="h-3.5 w-3.5" />
          Lançar venda manual
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Vendas das planilhas de Produto Principal e TMB, mais vendas PIX direto lançadas manualmente.
        Não inclui Captação. Filtro: últimos {days} dias. Só vendas manuais podem ser editadas/removidas.
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
          {/* Filtro por plataforma/origem */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "main", "tmb", "manual"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => selectPlatform(p)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  platform === p
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                    : "text-muted-foreground border-border/50 hover:bg-muted/40"
                }`}
              >
                {p === "all" ? "Todas" : PLATFORM_LABELS[p]}
                <span className="ml-1 tabular-nums opacity-70">{counts[p]}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total de vendas" value={String(filteredSummary.totalSales)} />
            <StatCard
              label="Faturamento total"
              value={formatCurrency(filteredSummary.totalRevenue)}
              highlight
              tooltip={
                platform === "all" && summary
                  ? `Planilha: ${formatCurrency(summary.spreadsheetRevenue)} (${summary.spreadsheetSales})\nManuais: ${formatCurrency(summary.manualRevenue)} (${summary.manualSales})`
                  : undefined
              }
            />
            <StatCard label="Ticket médio" value={formatCurrency(filteredSummary.ticket)} />
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
                {visibleSales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhuma venda de {PLATFORM_LABELS[platform as Exclude<Platform, "all">] ?? "—"} nos últimos {days} dias.
                    </td>
                  </tr>
                )}
                {visibleSales.map((sale) => (
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
                        {sale.sourceLabel && (
                          <span
                            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                            title={`Venda da fonte ${sale.sourceLabel}`}
                          >
                            {sale.sourceLabel}
                          </span>
                        )}
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
            {/* Story 19.9 ext: paginação 10/página */}
            {filteredSales.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/10 border-t border-border/30 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {safePage * PAGE_SIZE + 1}–
                  {Math.min((safePage + 1) * PAGE_SIZE, filteredSales.length)} de {filteredSales.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="p-1 rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular-nums px-2">
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="p-1 rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
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
