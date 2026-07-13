"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useStageSalesProducts,
  useUpdateOrderBumps,
} from "@/lib/hooks/use-stage-sales-spreadsheets";
import type { StageSalesSpreadsheet } from "@loyola-x/shared";

interface OrderBumpsDialogProps {
  projectId: string;
  funnelId: string;
  stageId: string;
  spreadsheet: StageSalesSpreadsheet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Story 18.51a: dialog pra marcar quais produtos da planilha de vendas são
 * ORDER BUMPS. Produto não marcado = produto da captação (o ingresso). A
 * marcação alimenta as métricas únicas (dedup por e-mail, só captação) vs
 * totais (todos os produtos) da etapa Paga.
 */
export function OrderBumpsDialog({
  projectId,
  funnelId,
  stageId,
  spreadsheet,
  open,
  onOpenChange,
}: OrderBumpsDialogProps) {
  const { data, isLoading } = useStageSalesProducts(
    projectId,
    funnelId,
    stageId,
    spreadsheet.id,
    open,
  );
  const updateOrderBumps = useUpdateOrderBumps(projectId, funnelId, stageId);

  // Set local (lowercased) das marcações — inicializa do servidor ao abrir.
  const [marked, setMarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && data) {
      setMarked(new Set(data.orderBumpProducts.map((p) => p.trim().toLowerCase())));
    }
  }, [open, data]);

  const products = data?.products ?? [];
  const productMapped = data?.productMapped ?? true;

  const capturaCount = useMemo(
    () => products.filter((p) => !marked.has(p.name.trim().toLowerCase())).length,
    [products, marked],
  );

  function toggle(name: string) {
    const key = name.trim().toLowerCase();
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    // Persiste os nomes ORIGINAIS (case preservado) dos produtos marcados.
    const orderBumpProducts = products
      .filter((p) => marked.has(p.name.trim().toLowerCase()))
      .map((p) => p.name);
    try {
      await updateOrderBumps.mutateAsync({ current: spreadsheet, orderBumpProducts });
      toast.success("Order bumps atualizados");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar order bumps");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Marcar order bumps</DialogTitle>
          <DialogDescription>
            Marque os produtos que são <strong>order bump</strong>. Os produtos
            não marcados são tratados como <strong>produto da captação</strong>{" "}
            (o ingresso) — base das métricas de ingressos/faturamento únicos.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !productMapped ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Mapeie a coluna de <strong>Produto</strong> na planilha para separar
              ingressos de order bumps. Sem isso, tudo é contado como produto da
              captação (únicos = totais).
            </p>
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum produto encontrado na planilha.
          </p>
        ) : (
          <>
            <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1">
              {products.map((p) => {
                const key = p.name.trim().toLowerCase();
                const isBump = marked.has(key);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-3 rounded-md border border-border/50 p-2.5 cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={isBump}
                      onChange={() => toggle(p.name)}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.count} {p.count === 1 ? "venda" : "vendas"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                        isBump
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {isBump ? (
                        <>
                          <Package className="h-3 w-3" /> Order bump
                        </>
                      ) : (
                        <>
                          <Ticket className="h-3 w-3" /> Captação
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {capturaCount} produto(s) de captação · {marked.size} order bump(s)
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateOrderBumps.isPending || isLoading || !productMapped}
          >
            {updateOrderBumps.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
