"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

/**
 * Story 29.46 — estado da API que está de fato atendendo este painel.
 *
 * `/api/health` é público por bypass explícito (`api/src/middleware/auth.ts:10`),
 * e isso é deliberado aqui: a divergência de versão precisa ser detectável
 * mesmo quando a autenticação está quebrada — cenário em que o gestor mais
 * precisa saber que o problema não é ele.
 */
export interface ApiHealthResponse {
  status: string;
  db: string;
  timestamp: string;
  /** Ausente em API anterior à 29.46 — ver `compareApiContract`. */
  contract?: number;
  commit?: string | null;
}

export function useApiHealth() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["api-health"],
    queryFn: () => apiClient<ApiHealthResponse>("/api/health"),
    // Uma consulta por sessão, na prática: o build da API não muda enquanto a
    // aba está aberta, e o endpoint faz `SELECT 1` — barato, mas não de graça.
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    // API fora do ar é problema de outro aviso. Aqui, silêncio: um banner de
    // versão que aparece por indisponibilidade seria diagnóstico errado.
    retry: false,
  });
}
