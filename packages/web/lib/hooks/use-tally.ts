"use client";

/**
 * A conexão com o Tally e a leitura dos formulários.
 *
 * O modelo de Lead Scoring vinha de um fluxo do n8n e era colado como JSON na
 * aba. Com estes hooks, a aba lê o formulário de verdade e transcreve as
 * perguntas sozinha — ver `services/tally-para-scoring.ts` na API.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface FormularioDoTally {
  id: string;
  name: string;
  respostas: number;
  status?: string;
}

export interface PerguntaDoTally {
  id: string;
  titulo: string;
  tipo: string;
  opcoes: string[];
}

export function useTallyConnection(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["tally", "connection", projectId],
    queryFn: () =>
      apiClient<{ conectado: boolean; salvoEm: string | null }>(
        `/api/projects/${projectId}/tally/connection`,
      ),
    enabled: !!projectId,
    retry: false,
  });
}

export function useSalvarChaveDoTally(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiClient<{ conectado: boolean; formularios: number }>(
        `/api/projects/${projectId}/tally/connection`,
        { method: "PUT", body: JSON.stringify({ token }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tally", "connection", projectId] });
      qc.invalidateQueries({ queryKey: ["tally", "forms", projectId] });
    },
  });
}

/**
 * Os formulários da conta.
 *
 * `enabled` espera a conexão existir: sem isso a lista dispara um 409 a cada
 * abertura da aba, que polui o log sem informar ninguém.
 */
export function useTallyForms(projectId: string | null, conectado: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["tally", "forms", projectId],
    queryFn: () =>
      apiClient<{ forms: FormularioDoTally[] }>(`/api/projects/${projectId}/tally/forms`),
    enabled: !!projectId && conectado,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** As perguntas do formulário e o rascunho do modelo, numa chamada só. */
export function useTallyQuestions(projectId: string | null, formId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["tally", "questions", projectId, formId],
    queryFn: () =>
      apiClient<{ perguntas: PerguntaDoTally[]; rascunho: Record<string, unknown> }>(
        `/api/projects/${projectId}/tally/forms/${formId}/questions`,
      ),
    enabled: !!projectId && !!formId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
