"use client";

/**
 * A volta da faixa para o Meta: configuração, simulação e envio.
 *
 * Ver `services/meta-capi.ts` na API para o que sai (hash, nunca PII em claro)
 * e por que o `event_id` é determinístico.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ConfigDoEnvioAoMeta {
  datasetId: string;
  metaAccountId: string | null;
  /** O nome BASE; cada faixa tem o seu, em `eventosPorFaixa`. */
  eventName: string;
  /** Nome do evento de cada faixa: `{ A: "LeadFaixaA" }`. Faltando, cai no padrão. */
  eventosPorFaixa: Record<string, string>;
  bands: string[];
  testEventCode: string | null;
  ativo: boolean;
  ultimoEnvioEm: string | null;
  ultimoResultado: ResumoDoEnvio | null;
}

export interface ResumoDoEnvio {
  candidatos: number;
  aEnviar: number;
  jaEnviados: number;
  semIdentificador: number;
  faixas: string[];
  evento: string;
  /** Um por faixa — é o que se escolhe no Gerenciador do Meta. */
  eventos?: string[];
  teste: boolean;
  enviados?: number;
  recebidos?: number;
  simulado?: boolean;
}

export interface ContaDeAnuncio {
  id: string;
  nome: string;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/lead-capi`;
}

export function useEnvioAoMeta(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-capi", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ config: ConfigDoEnvioAoMeta | null; contas: ContaDeAnuncio[] }>(
        base(projectId, funnelId, stageId),
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    retry: false,
  });
}

export function useSalvarEnvioAoMeta(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Omit<ConfigDoEnvioAoMeta, "ultimoEnvioEm" | "ultimoResultado">) =>
      apiClient(base(projectId, funnelId, stageId), {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-capi", projectId, funnelId, stageId] });
    },
  });
}

/**
 * Simular não envia nada — devolve só a conta do que sairia.
 *
 * O custo de conferir precisa ser zero, senão ninguém confere antes de ensinar
 * o algoritmo.
 */
export function useEnviarAoMeta(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (simular: boolean) =>
      apiClient<ResumoDoEnvio>(
        `${base(projectId, funnelId, stageId)}/enviar?simular=${simular ? "true" : "false"}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-capi", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["lead-capi-enviados", projectId, funnelId, stageId] });
    },
  });
}

export function useLeadsJaEnviados(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-capi-enviados", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ total: number; porFaixa: { faixa: string; total: number }[] }>(
        `${base(projectId, funnelId, stageId)}/enviados`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    retry: false,
  });
}
