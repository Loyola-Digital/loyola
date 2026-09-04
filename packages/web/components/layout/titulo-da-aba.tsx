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
 * ## O contexto
 *
 * `useTituloDaAba` deixa qualquer tela acrescentar o que ela está mostrando —
 * o nome da empresa, do funil, do mapa. É o que faz duas abas de funil
 * deixarem de ser idênticas; sem isso as duas dizem "Funil".
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tituloDaAba } from "@/lib/utils/titulo-da-aba";

/** Aplica o título da rota. Montado uma vez, no shell do app. */
export function TituloDaAba() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = tituloDaAba(pathname ?? "/");
  }, [pathname]);

  return null;
}

/**
 * Acrescenta o nome do que está aberto ao título da aba.
 *
 * Passar `null` ou `undefined` não faz nada — é o estado normal enquanto o
 * dado ainda está carregando, e escrever "undefined · Funil" na aba nesse
 * intervalo seria pior que esperar.
 *
 * Ao sair da tela, o título volta ao da rota: sem isso o nome do funil
 * anterior ficaria na aba durante a navegação seguinte.
 */
export function useTituloDaAba(contexto: string | null | undefined) {
  const pathname = usePathname();

  useEffect(() => {
    if (!contexto) return;
    document.title = tituloDaAba(pathname ?? "/", contexto);
    return () => {
      document.title = tituloDaAba(pathname ?? "/");
    };
  }, [pathname, contexto]);
}
