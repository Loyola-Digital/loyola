"use client";

/**
 * Match de origem — leads sem `utm_source` e as regras que os recuperam.
 *
 * O diagnóstico e o agrupamento leem a planilha inteira; as regras não. Por
 * isso são queries separadas: editar uma regra não pode custar uma releitura
 * de planilha a cada clique.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type OperadorDeRegra = "igual" | "contem" | "comeca_com" | "vazio";

export interface RegraDeOrigem {
  id: string;
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
  origem: string;
  ordem: number;
  ativa: boolean;
}

export interface DiagnosticoDeOrigem {
  total: number;
  comOrigem: number;
  semOrigem: number;
  recuperadas: number;
  pago: number;
  organico: number;
  indefinido: number;
}

export interface GrupoDeOrfaos {
  valor: string;
  label: string;
  quantidade: number;
  exemplos: string[];
}

export interface GrupoParaClassificar {
  valor: string;
  label: string;
  quantidade: number;
  /** Grafias do mesmo canal, quando há mais de uma ("whatsapp" e "WhatsApp"). */
  variacoes: string[];
}

export interface RespostaDoDiagnostico {
  semPlanilha: boolean;
  diagnostico: DiagnosticoDeOrigem | null;
  colunas: string[];
  aClassificar: GrupoParaClassificar[];
  regras: RegraDeOrigem[];
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/source-match`;
}

export function useDiagnosticoDeOrigem(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["source-match", "diagnostico", projectId, funnelId, stageId],
    queryFn: () => apiClient<RespostaDoDiagnostico>(`${base(projectId, funnelId, stageId)}/diagnostico`),
    // A planilha é lida a cada chamada: um staleTime curto evita releitura a
    // cada foco de janela sem deixar o número velho na tela.
    staleTime: 2 * 60 * 1000,
  });
}

export function useOrfasPorCampo(
  projectId: string,
  funnelId: string,
  stageId: string,
  campo: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["source-match", "orfas", projectId, funnelId, stageId, campo],
    queryFn: () =>
      apiClient<{ grupos: GrupoDeOrfaos[] }>(
        `${base(projectId, funnelId, stageId)}/orfas?campo=${encodeURIComponent(campo ?? "")}`,
      ),
    enabled: !!campo,
    staleTime: 2 * 60 * 1000,
  });
}

export interface EntradaDeRegra {
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
  origem: string;
  ordem?: number;
  ativa?: boolean;
}

export function useCriarRegras(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regras: EntradaDeRegra | EntradaDeRegra[]) =>
      apiClient<{ regras: RegraDeOrigem[] }>(`${base(projectId, funnelId, stageId)}/regras`, {
        method: "POST",
        body: JSON.stringify(regras),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

export function useAtualizarRegra(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<EntradaDeRegra> }) =>
      apiClient<{ regra: RegraDeOrigem }>(`${base(projectId, funnelId, stageId)}/regras/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

export function useRemoverRegra(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`${base(projectId, funnelId, stageId)}/regras/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-match"] }),
  });
}

/**
 * Monta a origem a partir do canal digitado — o mesmo que o servidor faz.
 *
 * Replicado aqui só para a PRÉVIA ("vai ficar `organic_instagram`"). Quem grava
 * continua sendo o servidor: se as duas divergirem, vale a dele.
 */
export function montarOrigem(tipo: "pago" | "organico", canal: string): string {
  const limpo = canal
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${tipo === "pago" ? "paid" : "organic"}_${limpo}`;
}
