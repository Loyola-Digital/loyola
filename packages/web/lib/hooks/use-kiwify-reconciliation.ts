"use client";

/**
 * Conferência das vendas da etapa contra a Kiwify.
 *
 * A venda chega hoje por webhook numa planilha, e a planilha é o que o
 * dashboard lê. Esse caminho perde venda de jeitos que não dão erro: webhook
 * que falha, reenvio que vira linha duplicada, reembolso posterior que a
 * planilha não acompanha. Isto não troca a fonte — só compara e avisa.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface KiwifyStageConfig {
  productIds: string[];
  /** aaaa-mm-dd */
  startDate: string;
  /**
   * Preço de UM ingresso. Sem ele cada venda conta 1 — e a compra de três
   * ingressos, que a Kiwify manda como uma venda só, fica invisível.
   */
  ticketPrice?: number | null;
  updatedAt?: string;
}

export interface KiwifyConfigResponse {
  /** A Kiwify está conectada no PROJETO (credenciais). */
  conectado: boolean;
  config: KiwifyStageConfig | null;
}

export interface VendaConferida {
  id?: string;
  reference?: string | null;
  chave?: string | null;
  email: string | null;
  data: string | null;
  valor: number;
  produto: string | null;
}

export type KiwifyReconciliation =
  | { configurado: false }
  | {
      configurado: true;
      periodo: { de: string; ate: string };
      produtos: string[];
      /** O que a planilha tem, por produto — ajuda a ver se o recorte está certo. */
      produtosNaPlanilha: Array<{ nome: string; vendas: number }>;
      totalPlanilha: number;
      totalKiwify: number;
      diferenca: number;
      planilhaSemChave: number;
      bate: boolean;
      soNaKiwify: VendaConferida[];
      soNaPlanilha: VendaConferida[];
      soNaKiwifyTotal: number;
      soNaPlanilhaTotal: number;
      amostraLimitada: boolean;
      /** Ingressos ≠ vendas. `null` sem preço unitário configurado. */
      ingressosKiwify: number | null;
      ticketPrice: number | null;
      comprasMultiplas: Array<{
        nome: string | null;
        email: string | null;
        data: string | null;
        ingressos: number;
        precoBase: number;
      }>;
    };

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/kiwify`;
}

export function useKiwifyStageConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-stage-config", projectId, funnelId, stageId],
    queryFn: () => apiClient<KiwifyConfigResponse>(`${base(projectId, funnelId, stageId)}/config`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveKiwifyStageConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { productIds: string[]; startDate: string; ticketPrice?: number | null }) =>
      apiClient<{ config: KiwifyStageConfig }>(`${base(projectId, funnelId, stageId)}/config`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-stage-config", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["kiwify-reconciliation", projectId, funnelId, stageId] });
    },
  });
}

export function useDisableKiwifyStageConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ config: null }>(`${base(projectId, funnelId, stageId)}/config`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-stage-config", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["kiwify-reconciliation", projectId, funnelId, stageId] });
    },
  });
}

/**
 * A conferência em si. Só roda quando há configuração — sem ela a rota
 * responde `configurado: false`, e a maioria das etapas não usa Kiwify.
 *
 * `staleTime` alto de propósito: cada execução varre a API da Kiwify e lê as
 * planilhas inteiras. É uma conferência, não um número de acompanhar minuto a
 * minuto.
 */
export function useKiwifyReconciliation(
  projectId: string,
  funnelId: string,
  stageId: string,
  habilitado: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-reconciliation", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<KiwifyReconciliation>(`${base(projectId, funnelId, stageId)}/reconciliation`),
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** Produtos da conta para o seletor. `todos=1` inclui os de venda única. */
export function useKiwifyProducts(projectId: string, habilitado: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-products-todos", projectId],
    queryFn: () =>
      apiClient<{ products: Array<{ id: string; name: string }> }>(
        `/api/projects/${projectId}/kiwify/products?todos=1`,
      ),
    enabled: habilitado,
    staleTime: 30 * 60 * 1000,
  });
}
