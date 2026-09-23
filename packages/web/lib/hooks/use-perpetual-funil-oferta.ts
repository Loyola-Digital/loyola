"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { FunilOfertaDoFunil } from "@loyola-x/shared";

/**
 * Story 29.80 — funil e oferta de cada campanha da etapa, o dicionário do
 * expert do projeto e o que falta cadastrar (rota da 29.79).
 *
 * É também o sinal de SUPORTE (AC7): só com esta resposta em mãos o painel
 * manda `funil`/`oferta` às leituras de vendas. Uma API anterior à 29.79
 * responde 404 aqui — e ignoraria o parâmetro calada lá.
 */
export function usePerpetualFunilOferta(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  const janela = startDate && endDate ? `startDate=${startDate}&endDate=${endDate}` : `days=${days}`;
  return useQuery({
    queryKey: ["perpetual-funil-oferta", projectId, funnelId, days, startDate, endDate],
    queryFn: () =>
      apiClient<FunilOfertaDoFunil>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/funil-oferta?${janela}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: 2 * 60 * 1000,
    // Trocar o período não muda o funil/oferta de campanha nenhuma (só o gasto):
    // sem isto o filtro escolhido se desligaria enquanto a janela nova carrega, e
    // as vendas seriam pedidas duas vezes (sem e com o recorte). Só do MESMO
    // funil: a classificação de outro funil não serve de rascunho.
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === projectId && consultaAnterior?.queryKey[2] === funnelId ? anterior : undefined,
    // Rota nova: 404 = API atrás do painel. Insistir não faz a rota aparecer.
    retry: (falhas, erro) => {
      const status = (erro as { status?: number })?.status;
      if (status === 404) return false;
      return falhas < 2;
    },
  });
}
