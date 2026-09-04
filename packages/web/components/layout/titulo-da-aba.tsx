"use client";

/**
 * Mantém o título da aba de acordo com a tela aberta.
 *
 * ## Por que no cliente
 *
 * O `metadata` do Next só existe em Server Component, e todas as telas do app
 * são `"use client"` — nenhuma pode exportá-lo. A aba ficava com o `default`
 * do layout raiz: "Loyola X" em todas as cinco que a pessoa deixa abertas.
 *
 * ## Um único ponto escreve o título
 *
 * A primeira versão tinha dois: a página definia o título com o nome do funil
 * e o layout definia o da rota. Parecia funcionar e falhava de forma
 * intermitente — o React roda os efeitos dos FILHOS antes dos pais, então com
 * o dado já em cache a página escrevia "FZ BLACK · Funil" e o layout
 * sobrescrevia com "Funil" no mesmo ciclo. Sem cache, o dado chegava depois e
 * o nome aparecia; foi por isso que passou nos primeiros testes.
 *
 * Agora a tela apenas ANUNCIA o contexto num store, e só este componente
 * escreve em `document.title`. Não há ordem de efeitos a acertar.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { tituloDaAba } from "@/lib/utils/titulo-da-aba";

interface ContextoDaAba {
  /** O que a tela está mostrando: nome do funil, do mapa, da empresa. */
  contexto: string | null;
  definir: (v: string | null) => void;
}

const useContextoDaAba = create<ContextoDaAba>((set) => ({
  contexto: null,
  definir: (contexto) => set({ contexto }),
}));

/** Aplica o título. Montado uma vez, no shell do app. */
export function TituloDaAba() {
  const pathname = usePathname();
  const contexto = useContextoDaAba((s) => s.contexto);

  useEffect(() => {
    document.title = tituloDaAba(pathname ?? "/", contexto);
  }, [pathname, contexto]);

  return null;
}

/**
 * Anuncia o que esta tela está mostrando, para entrar no título da aba.
 *
 * `null` ou `undefined` não limpa nada enquanto o dado carrega — é o estado
 * normal do primeiro render, e apagar ali faria o título piscar a cada
 * recarga. A limpeza acontece ao SAIR da tela, senão o nome do funil anterior
 * ficaria na aba durante a navegação seguinte.
 */
export function useTituloDaAba(contexto: string | null | undefined) {
  const definir = useContextoDaAba((s) => s.definir);

  useEffect(() => {
    if (contexto) definir(contexto);
  }, [contexto, definir]);

  useEffect(() => {
    return () => definir(null);
  }, [definir]);
}
