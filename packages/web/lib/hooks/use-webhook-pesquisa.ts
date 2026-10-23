"use client";

/**
 * A pesquisa que chega por webhook — a alternativa ao Tally e à planilha.
 *
 * A prévia é uma mutation, e não uma query, de propósito: ela não é um dado do
 * servidor que se observa, é uma pergunta pontual ("se eu mandar isto, como
 * vocês leem?") feita a cada vez que a pessoa cola outro exemplo.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type DestinoDaColuna =
  | { tipo: "data" }
  | { tipo: "pergunta"; perguntaId: string; rotulo: string }
  | { tipo: "contato"; campo: string }
  | { tipo: "nao_usado" };

export interface ColunaDaPrevia {
  coluna: string;
  exemplo: string;
  destino: DestinoDaColuna;
}

export interface PreviaDoWebhook {
  colunas: ColunaDaPrevia[];
  /** Quantas perguntas do modelo de scoring casaram com alguma coluna. */
  perguntasCasadas: number;
  /** `true` quando não há etapa com modelo para casar as perguntas. */
  semModelo: boolean;
}

export interface PesquisaPorWebhook {
  surveyId: string;
  /** Caminho; a tela prefixa com a base da API para formar a URL. */
  path: string;
  /** `null` para convidado — o token autoriza escrever resposta na pesquisa. */
  token: string | null;
  recebidos: number;
  ultimoEm: string | null;
  colunas: string[];
  ultimas: { recebidoEm: string; valores: Record<string, string> }[];
}

function chave(projectId: string, funnelId: string, surveyId: string) {
  return ["webhook-pesquisa", projectId, funnelId, surveyId] as const;
}

export function usePreviaDoWebhook(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: { exemplo: string; contentType?: string; stageId?: string }) =>
      apiClient<PreviaDoWebhook>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-pesquisa/previa`,
        { method: "POST", body: JSON.stringify(data) },
      ),
  });
}

export function usePesquisaPorWebhook(
  projectId: string,
  funnelId: string,
  surveyId: string | null | undefined,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: chave(projectId, funnelId, surveyId ?? ""),
    queryFn: () =>
      apiClient<PesquisaPorWebhook>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-pesquisa/${surveyId}`,
      ),
    enabled: Boolean(projectId && funnelId && surveyId),
    retry: false,
  });
}

export function useCriarPesquisaPorWebhook(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      stageId?: string;
      label: string;
      surveyType?: "paid" | "organic";
      columnMapping?: Record<string, unknown>;
    }) =>
      apiClient<PesquisaPorWebhook & { survey: { id: string } }>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-pesquisa`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      // Ela entra na lista de pesquisas do funil como qualquer outra.
      qc.invalidateQueries({ queryKey: ["funnel-surveys", projectId, funnelId] });
    },
  });
}

export function useRotacionarPesquisaPorWebhook(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (surveyId: string) =>
      apiClient<{ surveyId: string; path: string; token: string }>(
        `/api/projects/${projectId}/funnels/${funnelId}/webhook-pesquisa/${surveyId}/rotate`,
        { method: "POST" },
      ),
    onSuccess: (_data, surveyId) => {
      qc.invalidateQueries({ queryKey: chave(projectId, funnelId, surveyId) });
    },
  });
}
