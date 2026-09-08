"use client";

/**
 * A tabela mensal do orgânico.
 *
 * O mês fechado não muda mais: meia hora de validade evita refazer seis
 * chamadas à Graph API a cada troca de aba, e o cache do servidor já guarda
 * cada janela por período.
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface MesDoOrganico {
  mes: string;
  seguidoresNoFim: number | null;
  novosSeguidores: number;
  unfollows: number;
  crescimento: number;
  alcance: number;
  views: number;
  interacoes: number;
  engajamento: number | null;
  posts: number;
  melhorPost: {
    id: string;
    titulo: string;
    permalink: string | null;
    formato: string | null;
    interacoes: number;
    alcance: number;
    engajamento: number | null;
  } | null;
  variacao: {
    alcance: number | null;
    views: number | null;
    interacoes: number | null;
    crescimento: number | null;
    /** Em PONTOS percentuais. */
    engajamento: number | null;
  };
}

export function useInstagramMensal(accountId: string | null, meses = 6) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-mensal", accountId, meses],
    queryFn: () =>
      apiClient<{
        conta: { id: string; username: string | null };
        seguidoresHoje: number | null;
        meses: MesDoOrganico[];
      }>(`/api/instagram/accounts/${accountId}/mensal?meses=${meses}`),
    enabled: Boolean(accountId),
    staleTime: 30 * 60 * 1000,
  });
}
