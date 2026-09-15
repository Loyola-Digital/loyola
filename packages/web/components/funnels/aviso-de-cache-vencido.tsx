"use client";

import { AlertTriangle } from "lucide-react";
import {
  textoDeCacheVencido,
  type CacheDaResposta,
} from "@/lib/utils/recomputo-creative-performance";

/**
 * Story 18.81 (AC4): quando a rota de creative-performance serve cache
 * VENCIDO porque a Meta falhou (`_cache.stale`), a tela diz de quando é o
 * dado. Antes era silêncio — dado de dias atrás com cara de dado de agora, e
 * "não tem LPB" onde havia uma falha. Renderiza nada quando não há aviso.
 */
export function AvisoDeCacheVencido({ cache }: { cache: CacheDaResposta | undefined | null }) {
  const texto = textoDeCacheVencido(cache);
  if (!texto) return null;
  return (
    <p
      role="status"
      className="text-[11px] text-amber-600/90 dark:text-amber-400/90 flex items-start gap-1 max-w-xl"
    >
      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
      <span>{texto}</span>
    </p>
  );
}
