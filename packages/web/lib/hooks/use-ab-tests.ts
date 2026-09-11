"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface VariacaoDoTeste {
  id: string;
  nome: string;
  /** Caminho da página no Plausible — `/oferta-b`, não a URL completa. */
  url: string;
}

export interface TesteAB {
  id: string;
  projectId: string;
  nome: string;
  status: "rascunho" | "ativo" | "encerrado";
  metaConversao: string | null;
  variacoes: VariacaoDoTeste[];
  iniciadoEm: string | null;
  encerradoEm: string | null;
  createdAt: string;
}

export interface LinhaDoResultado extends VariacaoDoTeste {
  visitas: number;
  conversoes: number;
  /** `null` sem visita — nunca 0. */
  taxa: number | null;
  vencedora: boolean;
}

export interface ResultadoDoTeste {
  teste: { id: string; nome: string; status: string };
  periodo: { inicio: string; fim: string };
  estado: "sem_amostra" | "inconclusivo" | "vencedor";
  linhas: LinhaDoResultado[];
  mensagem: string;
  pValor: number | null;
  alfaEfetivo: number;
  comparacoes: number;
}

const base = (projectId: string) => `/api/projects/${projectId}/ab-tests`;

/** As metas do Plausible, para a tela oferecer lista em vez de texto livre. */
export function useMetasDoPlausible(projectId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["ab-tests", projectId, "metas"],
    queryFn: () =>
      api<{ metas: { nome: string; conversoes: number }[] }>(
        `${base(projectId)}/metas`,
      ),
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
  });
}

export function useTestesAB(projectId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["ab-tests", projectId],
    queryFn: () => api<{ testes: TesteAB[] }>(base(projectId)),
    enabled: Boolean(projectId),
  });
}

export function useResultadoAB(
  projectId: string,
  testeId: string | null,
  periodo: string,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["ab-tests", projectId, testeId, "resultado", periodo],
    queryFn: () =>
      api<ResultadoDoTeste>(
        `${base(projectId)}/${testeId}/resultado?periodo=${periodo}`,
      ),
    enabled: Boolean(testeId),
    // O Plausible é consultado uma vez por variação; refazer a cada foco
    // gastaria cota da instância para um número que muda devagar.
    staleTime: 60_000,
    retry: false,
  });
}

export function useSalvarTesteAB(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dados
    }: {
      id?: string;
      nome?: string;
      metaConversao?: string | null;
      status?: TesteAB["status"];
      /** Sem `id`: a tela manda nome e URL, o servidor gera os ids. */
      variacoes?: { nome: string; url: string }[];
    }) =>
      api<TesteAB>(id ? `${base(projectId)}/${id}` : base(projectId), {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["ab-tests", projectId] }),
  });
}

export function useExcluirTesteAB(projectId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`${base(projectId)}/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["ab-tests", projectId] }),
  });
}
