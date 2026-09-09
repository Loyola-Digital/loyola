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

export interface GrupoAnual {
  id: string;
  rotulo: string;
  cor: string;
}

interface Matriz {
  esteiras: EsteiraAnual[];
  /** As três faixas com o nome e a cor que a empresa escolheu. */
  grupos?: GrupoAnual[];
}

export function chaveDaMatriz(projectId: string | null, ano: number) {
  return ["planner-anual", projectId, ano] as const;
}

/**
 * De quanto em quanto tempo a matriz se atualiza sozinha.
 *
 * O calendário é editado por várias pessoas ao mesmo tempo — quem mexe numa
 * célula precisa aparecer para quem está olhando, sem F5. Quinze segundos é
 * curto o bastante para a mudança chegar antes de alguém refazer o trabalho, e
 * longo o bastante para o payload não pesar: a matriz inteira são doze meses
 * por esteira.
 *
 * O React Query NÃO dispara isto com a aba em segundo plano (o padrão de
 * `refetchIntervalInBackground` é `false`), então quem deixou a tela aberta
 * numa aba esquecida não gera requisição nenhuma.
 */
const INTERVALO_MS = 15_000;

/**
 * Curto de propósito, e por um motivo diferente do intervalo.
 *
 * O `staleTime` global é de cinco minutos. Com ele, VOLTAR para a aba não
 * buscava nada — era a causa de precisar de F5 mesmo depois de trocar de
 * janela e voltar. Dez segundos fazem o foco na janela valer como um pedido de
 * atualização, que é o gesto natural de quem volta para conferir.
 */
const VALIDADE_MS = 10_000;

export function useMatrizAnual(projectId: string | null, ano: number) {
  const api = useApiClient();
  return useQuery({
    queryKey: chaveDaMatriz(projectId, ano),
    queryFn: () => api<Matriz>(`${BASE}/${projectId}/${ano}`),
    enabled: Boolean(projectId),
    refetchInterval: INTERVALO_MS,
    staleTime: VALIDADE_MS,
  });
}

export function useVocabularioAnual() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["planner-anual-vocabulario"],
    queryFn: () =>
      api<{ grupos: string[]; categorias: string[]; funis: string[] }>(
        `${BASE}/vocabulario`,
      ),
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
                  ? {
                      ...e,
                      meses: e.meses.map((m, i) =>
                        i === mes - 1 ? celula : m,
                      ),
                    }
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
      api(`${BASE}/${projectId}/esteiras`, {
        method: "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

export function useCriarEsteirasIniciais(
  projectId: string | null,
  ano: number,
) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`${BASE}/${projectId}/esteiras/iniciais`, { method: "POST" }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

export function useAtualizarEsteira(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dados
    }: {
      id: string;
      grupo?: string;
      nome?: string;
    }) =>
      api(`${BASE}/esteiras/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}

/**
 * Renomeia ou recolore a faixa de um grupo.
 *
 * Otimista como o resto da tela: quem arrasta o seletor de cor vê a faixa
 * acompanhando o dedo. Esperar a rede a cada tom faria a cor piscar de volta
 * à antiga entre um e outro.
 */
export function useAtualizarGrupo(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  const chave = chaveDaMatriz(projectId, ano);

  return useMutation({
    mutationFn: ({
      grupo,
      ...dados
    }: {
      grupo: string;
      /** `null` volta ao padrão do código — ver `limparRotulo` na API. */
      rotulo?: string | null;
      cor?: string | null;
    }) =>
      api<{ grupos: GrupoAnual[] }>(`${BASE}/${projectId}/grupos/${grupo}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),

    onMutate: async ({ grupo, ...dados }) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<Matriz>(chave);
      qc.setQueryData<Matriz>(chave, (atual) =>
        atual?.grupos
          ? {
              ...atual,
              grupos: atual.grupos.map((g) =>
                g.id === grupo
                  ? {
                      ...g,
                      // Nome apagado volta ao padrão, e o padrão só o servidor
                      // conhece — então aqui a mudança otimista não acontece e
                      // a resposta é que traz o rótulo de volta.
                      ...(dados.rotulo ? { rotulo: dados.rotulo } : {}),
                      ...(dados.cor ? { cor: dados.cor } : {}),
                    }
                  : g,
              ),
            }
          : atual,
      );
      return { antes };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
    },
    onSuccess: (resp) => {
      // A resposta traz os três já resolvidos com os padrões aplicados — é o
      // que conclui o caso "apaguei o nome, quero o original de volta".
      qc.setQueryData<Matriz>(chave, (atual) =>
        atual ? { ...atual, grupos: resp.grupos } : atual,
      );
    },
  });
}

export function useExcluirEsteira(projectId: string | null, ano: number) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`${BASE}/esteiras/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: chaveDaMatriz(projectId, ano) }),
  });
}
