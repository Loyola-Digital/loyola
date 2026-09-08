"use client";

/**
 * Adesão do time — quem usa o Loyola X, quando e onde.
 *
 * O relatório é agregado por hora no servidor (ver `services/adesao.ts`), então
 * ele não muda a cada segundo: um minuto de validade evita refazer a consulta
 * a cada troca de aba sem mostrar número velho.
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface AreaUsada {
  area: string;
  rotulo: string;
  requisicoes: number;
}

export interface PessoaNaAdesao {
  id: string;
  nome: string;
  email: string;
  papel: string;
  situacao: string;
  entrouEm: string | null;
  /** `null` = nunca abriu o produto no período. */
  ultimoUso: string | null;
  diasAtivos: number;
  requisicoes: number;
  areas: AreaUsada[];
}

export interface Adesao {
  dias: number;
  pessoas: PessoaNaAdesao[];
  porDia: { dia: string; pessoas: number }[];
}

export function useAdesao(dias: number) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["adesao", dias],
    queryFn: () => apiClient<Adesao>(`/api/admin/adesao?dias=${dias}`),
    staleTime: 60_000,
  });
}
