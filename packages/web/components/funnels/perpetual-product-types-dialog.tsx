"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, Star, TrendingUp } from "lucide-react";
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
  usePerpetualProducts,
  useSavePerpetualProductTypes,
} from "@/lib/hooks/use-perpetual-spreadsheet";
import { productKey, contarPorTipo, TIPO_PADRAO } from "@/lib/utils/perpetual-product-types";
import type { PerpetualProductType } from "@loyola-x/shared";

/**
 * Story 29.49 — classificação dos produtos da planilha do funil perpétuo.
 *
 * ## Por que não é o `order-bumps-dialog.tsx` reaproveitado
 *
 * A estrutura é a mesma (carregando / coluna não mapeada / sem produtos /
 * lista + rodapé), e ela foi seguida de perto. O que muda é o controle: lá a
 * decisão é binária e cabe num checkbox; aqui são **três** tipos, e o gestor
 * pediu os três. Trocar o checkbox por um seletor de três estados, o resumo de
 * dois números por três, e os rótulos, passaria do limite de 30% de adaptação
 * do IDS — e deixaria o diálogo da Captação Paga carregando um modo que
 * ninguém usa lá.
 *
 * O que **é** reuso literal: a estrutura de estados, a chave canônica
 * (`trim().toLowerCase()`) e o padrão de hidratar o estado local ao abrir.
 */

const TIPOS: Array<{
  valor: PerpetualProductType;
  rotulo: string;
  Icone: typeof Star;
  classe: string;
}> = [
  { valor: "principal", rotulo: "Principal", Icone: Star, classe: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  { valor: "order_bump", rotulo: "Order bump", Icone: Package, classe: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { valor: "upsell", rotulo: "Upsell", Icone: TrendingUp, classe: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
];

interface Props {
  projectId: string;
  funnelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PerpetualProductTypesDialog({ projectId, funnelId, open, onOpenChange }: Props) {
  const { data, isLoading } = usePerpetualProducts(projectId, funnelId, open);
  const salvar = useSavePerpetualProductTypes(projectId, funnelId);

  // Estado local por chave canônica, hidratado a cada abertura — mesmo padrão
  // do diálogo da Captação Paga: refetch no meio da edição não pode apagar o
  // que o gestor acabou de escolher.
  const [tipos, setTipos] = useState<Record<string, PerpetualProductType>>({});
  useEffect(() => {
    if (open && data) {
      setTipos(Object.fromEntries(data.products.map((p) => [productKey(p.name), p.type])));
    }
  }, [open, data]);

  const produtos = data?.products ?? [];
  const productMapped = data?.productMapped ?? true;
  const resumo = useMemo(() => contarPorTipo(Object.values(tipos)), [tipos]);

  async function handleSave() {
    // Envia os nomes ORIGINAIS — o backend canonicaliza. Mandar a chave já
    // normalizada faria o mapa perder a grafia que o gestor reconhece caso
    // algum dia a tela precise exibi-lo.
    const payload: Record<string, PerpetualProductType> = {};
    for (const p of produtos) payload[p.name] = tipos[productKey(p.name)] ?? TIPO_PADRAO;
    try {
      await salvar.mutateAsync(payload);
      toast.success("Produtos classificados");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar a classificação");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Classificar produtos</DialogTitle>
          <DialogDescription>
            Diga o que é <strong>produto principal</strong>, <strong>order bump</strong> e{" "}
            <strong>upsell</strong>. Produto não classificado é tratado como principal.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !productMapped ? (
          /* Não é o mesmo que "planilha sem produtos": aqui a ação é voltar ao
             wizard e mapear a coluna. Dizer "nenhum produto encontrado" mandaria
             o gestor procurar na planilha um problema que está na configuração. */
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              A coluna <strong>Produto</strong> não está mapeada. Abra o wizard da planilha,
              mapeie o campo &quot;Produto&quot; e volte aqui para classificar.
            </p>
          </div>
        ) : produtos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            A coluna Produto está mapeada, mas nenhuma linha da planilha tem produto preenchido.
          </p>
        ) : (
          <>
            <div className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1">
              {produtos.map((p) => {
                const key = productKey(p.name);
                const atual = tipos[key] ?? TIPO_PADRAO;
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
                    <div className="flex shrink-0 gap-1">
                      {TIPOS.map(({ valor, rotulo, Icone, classe }) => {
                        const ativo = atual === valor;
                        return (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => setTipos((prev) => ({ ...prev, [key]: valor }))}
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                              ativo ? classe : "border-transparent text-muted-foreground hover:bg-muted/50"
                            }`}
                          >
                            <Icone className="h-3 w-3" />
                            {rotulo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo.principal} principal · {resumo.order_bump} order bump · {resumo.upsell} upsell
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={salvar.isPending || isLoading || !productMapped}>
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
