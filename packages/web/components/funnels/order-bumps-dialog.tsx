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
import { mapaParaPersistir } from "@/lib/utils/classificacao-produtos";
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
/** Story 18.69 — os cinco papéis, na ordem em que fazem sentido para o gestor. */
const TIPOS_DE_PRODUTO = [
  { valor: "ingresso", rotulo: "Ingresso" },
  { valor: "order_bump", rotulo: "Order bump" },
  { valor: "combo", rotulo: "Combo" },
  { valor: "upsell", rotulo: "Upsell" },
  { valor: "principal", rotulo: "Principal (outra etapa)" },
] as const;

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
  /**
   * Story 18.69 — `produto → tipo`, o vocabulário de cinco papéis.
   *
   * Nasce do mapa quando ele existe; senão é derivado da lista antiga, que só
   * distinguia bump de não-bump. É a migração por LEITURA do AC2: nenhum
   * registro é reescrito até o gestor salvar.
   */
  const [tipos, setTipos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && data) {
      setMarked(new Set(data.orderBumpProducts.map((p) => p.trim().toLowerCase())));
      const doMapa = (data as { productTypes?: Record<string, string> }).productTypes ?? {};
      const bumps = new Set(data.orderBumpProducts.map((p) => p.trim().toLowerCase()));
      const derivado: Record<string, string> = {};
      for (const p of data.products ?? []) {
        const k = p.name.trim().toLowerCase();
        derivado[k] = doMapa[k] ?? (bumps.has(k) ? "order_bump" : "ingresso");
      }
      setTipos(derivado);
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
    /**
     * Story 18.69 — grava também o MAPA de tipos, que é o vocabulário novo.
     *
     * A lista continua sendo escrita: enquanto houver código lendo dela, parar
     * de escrevê-la quebraria quem ainda não migrou. O backend prefere o mapa
     * quando ele existe.
     */
    // Gate QA: só o que DIFERE do default é gravado. Derivar `ingresso` para
    // todo produto não marcado persistiria uma suposição sobre a Mentoria e as
    // Automações, fazendo-as ancorar checkouts de captação.
    const productTypes = mapaParaPersistir(products, tipos);
    try {
      await updateOrderBumps.mutateAsync({ current: spreadsheet, orderBumpProducts, productTypes });
      toast.success("Produtos classificados");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar order bumps");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Classificar produtos</DialogTitle>
          <DialogDescription>
            Diga o papel de cada produto nesta etapa. Produto não classificado é
            tratado como <strong>ingresso</strong>.
            <br />
            <span className="text-[11px] text-muted-foreground">
              <strong>Ingresso</strong>: o que a captação vende ·{" "}
              <strong>Order bump</strong>: extra marcado no checkout ·{" "}
              <strong>Combo</strong>: substitui o ingresso, com o extra embutido ·{" "}
              <strong>Principal</strong>: produto de OUTRA etapa, fica fora das
              métricas da captação
            </span>
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
                const tipo = tipos[key] ?? (marked.has(key) ? "order_bump" : "ingresso");
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 rounded-md border border-border/50 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.count} {p.count === 1 ? "venda" : "vendas"}
                      </p>
                    </div>
                    <select
                      value={tipo}
                      onChange={(e) => {
                        const novo = e.target.value;
                        setTipos((t) => ({ ...t, [key]: novo }));
                        // A lista antiga continua sendo mantida em paralelo:
                        // enquanto houver código lendo dela, parar de escrevê-la
                        // quebraria quem ainda não migrou.
                        setMarked((m) => {
                          const next = new Set(m);
                          if (novo === "order_bump") next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                      className="text-xs rounded border border-border/60 bg-background px-2 py-1"
                    >
                      {TIPOS_DE_PRODUTO.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {TIPOS_DE_PRODUTO.map((t) => {
                const n = products.filter(
                  (p) => (tipos[p.name.trim().toLowerCase()] ?? "ingresso") === t.valor,
                ).length;
                return n > 0 ? `${n} ${t.rotulo.toLowerCase()}` : null;
              })
                .filter(Boolean)
                .join(" · ")}
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
