"use client";

/**
 * As metas do mês de uma conta.
 *
 * Vêm todas de uma vez (são poucas linhas, uma por mês) e ficam no cache: a
 * aba Decisões troca de mês o tempo todo, e uma busca por mês faria a tela
 * piscar a cada clique.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { MetasPorFormato } from "@/lib/utils/instagram-metas";

export interface ItemDoPlano {
  oQue: string;
  responsavel?: string;
  prazo?: string;
  status?: "a-fazer" | "em-andamento" | "concluido";
}

export interface MetaDoMes {
  mes: string;
  saldoSeguidores: number | null;
  alcance: number | null;
  posts: number | null;
  metasPorFormato: MetasPorFormato | null;
  /** As três frases do relatório: onde estamos, o que aprendemos, a prioridade. */
  resumoOndeEstamos?: string | null;
  resumoAprendizado?: string | null;
  resumoPrioridade?: string | null;
  plano?: ItemDoPlano[] | null;
  atualizadoEm?: string;
}

export function useMetasDoInstagram(accountId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-metas", accountId],
    queryFn: () => apiClient<{ metas: MetaDoMes[] }>(`/api/instagram/accounts/${accountId}/metas`),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalvarMetas(accountId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mes, ...metas }: Omit<MetaDoMes, "atualizadoEm">) =>
      apiClient<MetaDoMes>(`/api/instagram/accounts/${accountId}/metas/${mes}`, {
        method: "PUT",
        body: JSON.stringify(metas),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram-metas", accountId] });
    },
  });
}
