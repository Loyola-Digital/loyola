"use client";

/**
 * O termo digitado, mas só depois que a pessoa parou.
 *
 * Existe para separar duas buscas que andam juntas: a por texto roda a cada
 * tecla (é local e instantânea), a por contexto custa uma ida ao modelo. Sem
 * esta espera, digitar "escassez" dispararia oito chamadas — uma por letra —
 * e as sete primeiras seriam descartadas antes de responder.
 */

import { useEffect, useState } from "react";

export function useTermoEmRepouso(valor: string, ms = 700): string {
  const [emRepouso, setEmRepouso] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setEmRepouso(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);

  return emRepouso;
}
