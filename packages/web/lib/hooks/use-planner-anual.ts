"use client";

/**
 * O calendário anual — leitura e escrita da matriz.
 *
 * ## A escrita é por CÉLULA, e otimista
 *
 * Quem preenche a matriz atravessa dezenas de campos em sequência. Esperar a
 * rede a cada saída de campo faria o valor piscar de volta ao antigo antes de
 * assentar — e a pessoa relê a célula para conferir. Aqui o cache muda na hora
 * e reconcilia depois; se o servidor recusar, volta ao que era.
 *
 * ## Sem invalidação a cada tecla
 *
 * Uma célula gravada não recarrega a matriz inteira. São 84 células por ano, e
 * refazer o `GET` a cada campo transformaria o preenchimento normal da tela
 * numa enxurrada de requisições — cada uma reescrevendo o cache por baixo de
 * quem ainda está digitando na célula seguinte.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

const BASE = "/api/planner/anual";

export interface CelulaAnual {
  frequencia: string | null;
  produto: string | null;
  categoria: string | null;
  funil: string | null;
}

export interface EsteiraAnual {
  id: string;
  grupo: string;
  nome: string;
  sortOrder: number;
  /** Sempre 12 posições, índice 0 = Janeiro. */
  meses: CelulaAnual[];
}

interface Matriz {
  esteiras: EsteiraAnual[];
}

export function chaveDaMatriz(projectId: string | null, ano: number) {
  return ["planner-anual", projectId, ano] as const;
}

export function useMatrizAnual(projectId: string | null, ano: number) {
  const api = useApiClient();
  return useQuery({
    queryKey: chaveDaMatriz(projectId, ano),
    queryFn: () => api<Matriz>(`${BASE}/${projectId}/${ano}`),
    enabled: Boolean(projectId),
  });
}

export function useVocabularioAnual() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["planner-anual-vocabulario"],
    queryFn: () =>
      api<{ grupos: string[]; categorias: string[]; funis: string[] }>(`${BASE}/vocabulario`),
    // O vocabulário é fixo no servidor: buscar uma vez por sessão basta.
    staleTime: Infinity,
  });
}

export function useGravarCelula(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  const chave = chaveDaMatriz(projectId, ano);

  return useMutation({
    mutationFn: ({
      trackId,
      mes,
      celula,
    }: {
      trackId: string;
      mes: number;
      celula: CelulaAnual;
    }) =>
      api<CelulaAnual>(`${BASE}/esteiras/${trackId}/${ano}`, {
        method: "PUT",
        body: JSON.stringify({ mes, ...celula }),
      }),

    onMutate: async ({ trackId, mes, celula }) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<Matriz>(chave);
      qc.setQueryData<Matriz>(chave, (atual) =>
        atual
          ? {
              esteiras: atual.esteiras.map((e) =>
                e.id === trackId
                  ? { ...e, meses: e.meses.map((m, i) => (i === mes - 1 ? celula : m)) }
                  : e,
              ),
            }
          : atual,
      );
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      // Melhor a célula recuar visivelmente do que exibir um valor que o
      // servidor recusou — a pessoa segue preenchendo achando que gravou.
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
    },
  });
}

export function useCriarEsteira(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { grupo: string; nome?: string }) =>
      api(`${BASE}/${projectId}/esteiras`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

export function useCriarEsteirasIniciais(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`${BASE}/${projectId}/esteiras/iniciais`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

export function useAtualizarEsteira(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: { id: string; grupo?: string; nome?: string }) =>
      api(`${BASE}/esteiras/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

export function useExcluirEsteira(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`${BASE}/esteiras/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}
