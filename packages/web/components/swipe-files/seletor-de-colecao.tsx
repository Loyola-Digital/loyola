"use client";

/**
 * Escolher uma coleção existente como destino.
 *
 * ## Um `<select>`, e não a lista com busca do "Salvar em…"
 *
 * Aqui a escolha é UMA e acontece antes de salvar; lá são várias e cada clique
 * já grava. Reaproveitar aquele componente traria o comportamento de gravar na
 * hora para um formulário que ainda nem foi confirmado.
 *
 * ## O caminho inteiro aparece na opção
 *
 * "anúncios" sozinho não diz de qual pasta é — e o acervo pode ter várias, uma
 * por evento. A indentação mostra a hierarquia; o caminho no `title` resolve
 * quando o nome é longo demais e o select corta.
 */

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { useColecoes, type ColecaoDoSwipe } from "@/lib/hooks/use-swipe-files";

/** As coleções em ordem de árvore, com a profundidade de cada uma. */
export function emArvore(
  colecoes: ColecaoDoSwipe[],
): { colecao: ColecaoDoSwipe; nivel: number; caminho: string }[] {
  const porPai = new Map<string | null, ColecaoDoSwipe[]>();
  for (const c of colecoes) {
    const lista = porPai.get(c.parentId ?? null) ?? [];
    lista.push(c);
    porPai.set(c.parentId ?? null, lista);
  }
  for (const lista of porPai.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  const saida: { colecao: ColecaoDoSwipe; nivel: number; caminho: string }[] = [];
  const visitados = new Set<string>();

  const descer = (pai: string | null, nivel: number, prefixo: string) => {
    for (const c of porPai.get(pai) ?? []) {
      // Guarda contra ciclo: `parent_id` é editável por rota, e uma coleção
      // que vira mãe da própria mãe faria esta recursão não terminar.
      if (visitados.has(c.id)) continue;
      visitados.add(c.id);
      const caminho = prefixo ? `${prefixo} / ${c.nome}` : c.nome;
      saida.push({ colecao: c, nivel, caminho });
      descer(c.id, nivel + 1, caminho);
    }
  };
  descer(null, 0, "");

  // Órfã — a mãe foi apagada entre o carregamento e o render, ou o dado veio
  // parcial. Aparece na raiz em vez de sumir da lista.
  for (const c of colecoes) {
    if (!visitados.has(c.id)) saida.push({ colecao: c, nivel: 0, caminho: c.nome });
  }
  return saida;
}

export function SeletorDeColecao({
  valor,
  onEscolher,
  rotulo = "Coleção",
  ajuda,
}: {
  valor: string | null;
  onEscolher: (id: string | null) => void;
  rotulo?: string;
  ajuda?: string;
}) {
  const { data, isLoading } = useColecoes();
  const arvore = useMemo(() => emArvore(data?.colecoes ?? []), [data]);

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{rotulo}</Label>
      <select
        value={valor ?? ""}
        onChange={(e) => onEscolher(e.target.value || null)}
        disabled={isLoading}
        className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="">
          {isLoading ? "Carregando…" : "Nenhuma — fica solta na biblioteca"}
        </option>
        {arvore.map(({ colecao, nivel, caminho }) => (
          <option key={colecao.id} value={colecao.id} title={caminho}>
            {/* `NBSP` porque o espaço comum é colapsado dentro de `<option>`
                em alguns navegadores, e a indentação some. */}
            {"\u00a0\u00a0".repeat(nivel)}
            {nivel > 0 ? "└ " : ""}
            {colecao.nome}
            {colecao.pecas > 0 ? ` (${colecao.pecas})` : ""}
          </option>
        ))}
      </select>
      {ajuda && <p className="text-[10px] leading-snug text-muted-foreground">{ajuda}</p>}
    </div>
  );
}
