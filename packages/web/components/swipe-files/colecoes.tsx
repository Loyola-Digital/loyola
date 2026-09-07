"use client";

/**
 * As coleções do Swipe Files — a organização feita à mão.
 *
 * ## Por que existe, se já há filtros
 *
 * Filtro responde "me mostre tudo de marca X". Coleção responde "o que eu
 * separei para o lançamento de outubro" — um critério que não está em campo
 * nenhum e que só a pessoa conhece. A biblioteca precisa das duas coisas: uma
 * para procurar, outra para pousar o olho.
 *
 * ## Coleção, e não pasta
 *
 * Uma peça está em várias ao mesmo tempo. Chamar de pasta prometeria que o
 * arquivo mora num lugar só, e a primeira vez que alguém precisasse do
 * contrário faria uma cópia.
 */

import { useState } from "react";
import { FolderPlus, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useColecoes,
  useCriarColecao,
  useExcluirColecao,
  type ColecaoDoSwipe,
} from "@/lib/hooks/use-swipe-files";

function quando(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return `há ${Math.floor(dias / 365)} ano${dias >= 730 ? "s" : ""}`;
}

export function GradeDeColecoes({
  onAbrir,
}: {
  onAbrir: (colecao: ColecaoDoSwipe) => void;
}) {
  const { data, isLoading } = useColecoes();
  const criar = useCriarColecao();
  const excluir = useExcluirColecao();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);

  const colecoes = data?.colecoes ?? [];

  function confirmarCriacao() {
    const n = nome.trim();
    if (!n) {
      setCriando(false);
      return;
    }
    criar
      .mutateAsync({ nome: n })
      .then((c) => {
        // O nome pode voltar diferente: repetido ganha sufixo em vez de ser
        // recusado, e quem digitou precisa saber com o que ficou.
        toast.success(c.nome === n ? `“${c.nome}” criada` : `Já existia uma — criei “${c.nome}”`);
        setNome("");
        setCriando(false);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui criar"));
  }

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando as coleções…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {criando ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarCriacao();
              if (e.key === "Escape") {
                setNome("");
                setCriando(false);
              }
            }}
            placeholder="Nome da coleção — ex: Black Friday 2026"
            className="h-9 max-w-sm"
          />
          <Button size="sm" className="h-9" onClick={confirmarCriacao} disabled={criar.isPending}>
            {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Criar"}
          </Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setCriando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setCriando(true)}>
          <FolderPlus className="h-3.5 w-3.5" />
          Nova coleção
        </Button>
      )}

      {colecoes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <p className="text-sm font-medium">Nenhuma coleção ainda</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            Coleção é o recorte que os filtros não fazem: “o que separei para o lançamento”, “o que
            mandei pro cliente”. Uma peça pode estar em várias.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colecoes.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border border-border/60 bg-card transition-colors hover:border-foreground/25"
            >
              <button
                type="button"
                onClick={() => onAbrir(c)}
                className="flex w-full flex-col gap-1 p-4 text-left"
              >
                <span className="truncate pr-6 text-[14px] font-semibold">{c.nome}</span>
                <span className="text-[12px] text-muted-foreground">
                  {c.pecas} {c.pecas === 1 ? "referência" : "referências"}
                  {c.mexidaEm ? ` · ${quando(c.mexidaEm)}` : ""}
                </span>
                {c.descricao && (
                  <span className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                    {c.descricao}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMenuAberto(menuAberto === c.id ? null : c.id)}
                aria-label={`Opções de ${c.nome}`}
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {menuAberto === c.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuAberto(null)} />
                  <div className="absolute right-2 top-8 z-50 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuAberto(null);
                        excluir.mutate(c.id, {
                          onSuccess: () =>
                            toast.success(`“${c.nome}” apagada`, {
                              // Sem isto a pessoa hesita em apagar qualquer
                              // coleção, achando que leva as peças junto.
                              description: "As referências continuam na biblioteca.",
                            }),
                          onError: () => toast.error("Não consegui apagar"),
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      Apagar coleção
                    </button>
                    <p className="px-2 pb-1 pt-0.5 text-[10px] text-muted-foreground">
                      As referências continuam na biblioteca.
                    </p>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
