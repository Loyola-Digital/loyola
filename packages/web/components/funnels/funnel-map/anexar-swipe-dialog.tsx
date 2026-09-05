"use client";

/**
 * Prender referências do Swipe Files a um bloco do mapa.
 *
 * ## Por que aqui não há upload
 *
 * A biblioteca é o lugar de subir; este diálogo só escolhe. Duplicar o fluxo
 * de envio faria a mesma peça entrar duas vezes no acervo — uma pelo Swipe
 * Files, outra pelo mapa — e o acervo é justamente o que dá sentido a filtrar
 * por marca ou nicho depois.
 *
 * ## A escolha é acumulada, e só vale ao confirmar
 *
 * Marcar seis peças uma a uma, cada clique gravando o mapa, seria seis
 * gravações e nenhuma chance de desistir. Aqui a seleção fica local e sai
 * inteira no "Anexar".
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSwipeFiles } from "@/lib/hooks/use-swipe-files";
import { CapaDoSwipe } from "@/components/swipe-files/capa-do-swipe";

/** Igual ao teto do `boxSchema` na API — passar disso vira mosaico ilegível. */
const MAXIMO = 12;

export function AnexarSwipeDialog({
  open,
  onOpenChange,
  jaAnexados,
  onConfirmar,
  nomeDoBloco,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jaAnexados: string[];
  onConfirmar: (ids: string[]) => void;
  nomeDoBloco: string;
}) {
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>(jaAnexados);

  // Reabrir precisa refletir o que o bloco tem AGORA: sem isto, desanexar pelo
  // painel e reabrir o diálogo mostraria a peça ainda marcada.
  useEffect(() => {
    if (open) {
      setEscolhidos(jaAnexados);
      setBusca("");
    }
  }, [open, jaAnexados]);

  const { data, isLoading } = useSwipeFiles(busca.trim() ? { q: busca.trim() } : {});
  const itens = useMemo(() => data?.items ?? [], [data]);

  const alternar = (id: string) =>
    setEscolhidos((atual) =>
      atual.includes(id)
        ? atual.filter((x) => x !== id)
        : atual.length >= MAXIMO
          ? atual
          : [...atual, id],
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Referências de “{nomeDoBloco || "bloco"}”</DialogTitle>
          <DialogDescription>
            Escolha na biblioteca o que este bloco representa — a VSL, o checkout, a página. Clicar
            na miniatura no mapa abre a referência.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, marca, tag ou anotação..."
            className="h-9 pl-8"
          />
        </div>

        {/* Menos colunas e mais altura que um grid de icones: numa landing
            page de proporção 1:8, uma célula baixa vira uma listra do meio da
            página — indistinguível da listra da página seguinte. */}
        <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
          {isLoading ? (
            <p className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando a biblioteca…
            </p>
          ) : itens.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              {busca.trim() ? `Nada com “${busca}”.` : "A biblioteca está vazia."}
            </p>
          ) : (
            itens.map((item) => {
              const marcado = escolhidos.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => alternar(item.id)}
                  title={item.title}
                  className={`group relative overflow-hidden rounded-lg border text-left transition-colors ${
                    marcado ? "border-primary ring-2 ring-primary/40" : "border-border/50 hover:border-foreground/30"
                  }`}
                >
                  <CapaDoSwipe item={item} className="h-32 w-full" />
                  <span className="block truncate px-1.5 py-1 text-[10px] leading-tight">
                    {item.title}
                  </span>
                  {marcado && (
                    <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {escolhidos.length} de {MAXIMO}
            {escolhidos.length >= MAXIMO && " — o limite do card"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onConfirmar(escolhidos);
                onOpenChange(false);
              }}
            >
              Anexar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
