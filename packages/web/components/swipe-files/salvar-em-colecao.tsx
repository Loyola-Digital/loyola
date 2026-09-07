"use client";

/**
 * "Salvar em…" — põe uma referência numa coleção.
 *
 * A lista mostra em quais ela já está, com a marca ligada: sem isso, quem
 * abriu o menu não sabe se está adicionando ou repetindo, e clica de novo por
 * garantia. Criar uma coleção nova acontece aqui mesmo — sair da peça para ir
 * criar a coleção e depois voltar para encontrá-la é o caminho que faz a
 * pessoa desistir de organizar.
 */

import { useState } from "react";
import { Check, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  useColecoes,
  useCriarColecao,
  useMexerNaColecao,
} from "@/lib/hooks/use-swipe-files";

export function SalvarEmColecao({
  swipeIds,
  emQuaisJaEsta = [],
  onFechar,
}: {
  /** Uma peça, ou várias de uma vez. */
  swipeIds: string[];
  emQuaisJaEsta?: string[];
  onFechar: () => void;
}) {
  const { data, isLoading } = useColecoes();
  const criar = useCriarColecao();
  const mexer = useMexerNaColecao();
  const [busca, setBusca] = useState("");

  const colecoes = data?.colecoes ?? [];
  const filtradas = busca.trim()
    ? colecoes.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : colecoes;

  const quantas = swipeIds.length;
  const rotulo = quantas === 1 ? "a referência" : `as ${quantas} referências`;

  function alternar(id: string, nome: string, jaEsta: boolean) {
    mexer.mutate(
      { id, [jaEsta ? "remover" : "adicionar"]: swipeIds },
      {
        onSuccess: () =>
          toast.success(jaEsta ? `Tirei de “${nome}”` : `Salvo em “${nome}”`),
        onError: () => toast.error("Não consegui salvar"),
      },
    );
  }

  return (
    <div className="w-64 rounded-lg border border-border bg-popover p-1.5 shadow-xl">
      <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Salvar {rotulo} em
      </p>

      <Input
        autoFocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar();
          // Enter num nome que não existe CRIA — é o caminho curto, e o
          // rótulo do botão abaixo diz que é isso que vai acontecer.
          if (e.key === "Enter" && busca.trim() && filtradas.length === 0) {
            criar
              .mutateAsync({ nome: busca.trim() })
              .then((c) => {
                mexer.mutate({ id: c.id, adicionar: swipeIds });
                toast.success(`“${c.nome}” criada e salva`);
                setBusca("");
              })
              .catch(() => toast.error("Não consegui criar"));
          }
        }}
        placeholder="Buscar ou criar…"
        className="h-7 text-[12px]"
      />

      <div className="mt-1 max-h-56 overflow-y-auto">
        {isLoading ? (
          <p className="flex items-center justify-center gap-1.5 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Carregando…
          </p>
        ) : (
          filtradas.map((c) => {
            const jaEsta = emQuaisJaEsta.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => alternar(c.id, c.nome, jaEsta)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[12px] hover:bg-muted"
              >
                <span
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border ${
                    jaEsta ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {jaEsta && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  {c.pecas}
                </span>
              </button>
            );
          })
        )}

        {!isLoading && busca.trim() && filtradas.length === 0 && (
          <button
            type="button"
            onClick={() =>
              criar
                .mutateAsync({ nome: busca.trim() })
                .then((c) => {
                  mexer.mutate({ id: c.id, adicionar: swipeIds });
                  toast.success(`“${c.nome}” criada e salva`);
                  setBusca("");
                })
                .catch(() => toast.error("Não consegui criar"))
            }
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-2 text-left text-[12px] text-primary hover:bg-muted"
          >
            <FolderPlus className="h-3 w-3 shrink-0" />
            Criar “{busca.trim()}” e salvar aqui
          </button>
        )}

        {!isLoading && !busca.trim() && colecoes.length === 0 && (
          <p className="px-1.5 py-3 text-[11px] leading-snug text-muted-foreground">
            Nenhuma coleção ainda. Digite um nome acima para criar a primeira.
          </p>
        )}
      </div>
    </div>
  );
}
