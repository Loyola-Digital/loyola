"use client";

/**
 * Story 44.21 — o panorama do projeto para o topo da aba "Inácio".
 *
 * ⚠️ Chama a rota INTERNA (`/api/projects/:projectId/panorama-cac`), não a
 * pública. A pública exige `x-api-key` e o web autentica com Clerk — as duas
 * servem o MESMO payload, da mesma função, com teste provando isso
 * (`panorama-do-projeto.test.ts`, T1).
 *
 * ⚠️ Usa `useApiClient`, nunca `fetch` cru: em produção a Vercel bloqueia o
 * request direto com `DNS_HOSTNAME_RESOLVED_PRIVATE`, porque o backend mora em
 * outro hostname.
 *
 * ⚠️ **Não existe `?fresh=1` aqui** (QA-4420-01): forçar recompute de venda em
 * cada etapa levava o maior projeto a 15 s. Dado de venda recomputado se pede na
 * etapa, em `/stages/{id}/cadeia-cac?fresh=1`.
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { PanoramaPayload } from "@/lib/utils/panorama-view";

export type { PanoramaPayload };

export function usePanorama(projectId: string | undefined) {
  const api = useApiClient();

  return useQuery({
    queryKey: ["panorama-cac", projectId],
    enabled: Boolean(projectId),
    queryFn: () => api<PanoramaPayload>(`/api/projects/${projectId}/panorama-cac`),
    /**
     * O panorama é o contexto do dia, não um número que muda a cada minuto —
     * e ele dispara N leituras de cadeia no backend. 5 min de `staleTime` evita
     * refazer isso a cada troca de etapa dentro do mesmo expert, que é
     * exatamente o uso que a story descreve.
     */
    staleTime: 5 * 60_000,
  });
}
