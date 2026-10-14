"use client";

/**
 * Regras de alerta por projeto e os projetos que a pessoa segue.
 *
 * Seguir é por PESSOA (vale em todos os aparelhos dela); a inscrição de push é
 * por aparelho e mora no [[use-push]]. Quem segue um projeto sem nenhum
 * aparelho inscrito não recebe nada — e é por isso que a tela mostra as duas
 * coisas juntas.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type MetricaDeAlerta = "connect_rate" | "roas" | "investiu_sem_vender";

export interface RegraDeAlerta {
  id: string;
  metrica: MetricaDeAlerta;
  rotulo: string;
  comparador: "menor" | "maior";
  /** Connect rate em razão (0,6 = 60%); ROAS em múltiplo; o resto em reais. */
  valor: number;
  gastoMinimo: number | null;
  janelaDias: number;
  ativo: boolean;
  lastSentDate: string | null;
}

export interface EntradaDeRegra {
  metrica: MetricaDeAlerta;
  comparador: "menor" | "maior";
  valor: number;
  gastoMinimo: number | null;
  janelaDias: number;
  ativo: boolean;
}

export interface Veredito {
  estourou: boolean;
  motivo?: "sem_dado" | "gasto_abaixo_do_piso" | "dentro_da_faixa" | "ja_avisou_hoje";
  leitura: { valor: number | null; gasto: number; faturamento: number | null };
  previa: { titulo: string; corpo: string };
}

export function useAlertasDoProjeto(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["alertas", projectId],
    queryFn: () =>
      apiClient<{ regras: RegraDeAlerta[]; seguidores: number }>(
        `/api/projects/${projectId}/alertas`,
      ),
    enabled: Boolean(projectId),
    staleTime: 60 * 1000,
  });
}

export function useSalvarRegra(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: EntradaDeRegra & { id?: string }) =>
      apiClient<{ regra: RegraDeAlerta }>(
        `/api/projects/${projectId}/alertas${id ? `/${id}` : ""}`,
        { method: id ? "PUT" : "POST", body: JSON.stringify(dados) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas", projectId] }),
  });
}

export function useExcluirRegra(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/projects/${projectId}/alertas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas", projectId] }),
  });
}

/** Avalia a regra agora e devolve o número — sem notificar ninguém. */
export function useTestarRegra(projectId: string | null) {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Veredito>(`/api/projects/${projectId}/alertas/${id}/testar`, { method: "POST" }),
  });
}

export function useProjetosSeguidos() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["notificacoes-projetos"],
    queryFn: () => apiClient<{ projectIds: string[] }>("/api/notificacoes/projetos"),
    staleTime: 60 * 1000,
  });
}

export function useSalvarProjetosSeguidos() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectIds: string[]) =>
      apiClient("/api/notificacoes/projetos", {
        method: "PUT",
        body: JSON.stringify({ projectIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-projetos"] }),
  });
}
