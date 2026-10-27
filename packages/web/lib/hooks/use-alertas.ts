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
  /** Nulo = vale para todos os projetos que alguém siga. */
  projectId: string | null;
  /** O nome do projeto, ou nulo quando a regra é de todos. */
  projeto: string | null;
  /** Quantas pessoas receberiam este alerta hoje. */
  alcance: number;
  metrica: MetricaDeAlerta;
  rotulo: string;
  comparador: "menor" | "maior";
  /** Connect rate em razão (0,6 = 60%); ROAS em múltiplo; o resto em reais. */
  valor: number;
  gastoMinimo: number | null;
  janelaDias: number;
  ativo: boolean;
}

export interface EntradaDeRegra {
  projectId: string | null;
  metrica: MetricaDeAlerta;
  comparador: "menor" | "maior";
  valor: number;
  gastoMinimo: number | null;
  janelaDias: number;
  ativo: boolean;
}

/** O veredito de UM funil: é funil a funil que a regra julga. */
export interface VereditoDeFunil {
  /** `funnel_id`, ou "" no item "(sem funil)". */
  chave: string;
  nome: string;
  estourou: boolean;
  motivo?: "sem_dado" | "gasto_abaixo_do_piso" | "dentro_da_faixa" | "ja_avisou_hoje";
  leitura: { valor: number | null; gasto: number; faturamento: number | null };
  previa: { titulo: string; corpo: string };
}

export interface Veredito {
  /** Em qual projeto a conferência foi feita — a regra global precisa de um. */
  projeto: string;
  /** Vazio quando nenhum funil teve movimento na janela. */
  funis: VereditoDeFunil[];
}

export function useAlertas() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["alertas"],
    queryFn: () =>
      apiClient<{ regras: RegraDeAlerta[]; projetosSeguidos: number }>("/api/notificacoes/alertas"),
    staleTime: 60 * 1000,
  });
}

export function useSalvarRegra() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: EntradaDeRegra & { id?: string }) =>
      apiClient<{ regra: RegraDeAlerta }>(`/api/notificacoes/alertas${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });
}

export function useExcluirRegra() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/notificacoes/alertas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });
}

/** Avalia a regra agora e devolve o número — sem notificar ninguém. */
export function useTestarRegra() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId?: string }) =>
      apiClient<Veredito>(`/api/notificacoes/alertas/${id}/testar`, {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
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

export interface PreferenciasDeNotificacao {
  resumoAtivo: boolean;
  /** Hora local de São Paulo, entre 8 e 21 (a janela em que o agendador roda). */
  horaDoResumo: number;
  lastDigestDate: string | null;
}

export function usePreferenciasDeNotificacao() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["notificacoes-preferencias"],
    queryFn: () => apiClient<PreferenciasDeNotificacao>("/api/notificacoes/preferencias"),
    staleTime: 60 * 1000,
  });
}

export function useSalvarPreferencias() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { resumoAtivo: boolean; horaDoResumo: number }) =>
      apiClient<PreferenciasDeNotificacao>("/api/notificacoes/preferencias", {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-preferencias"] }),
  });
}
