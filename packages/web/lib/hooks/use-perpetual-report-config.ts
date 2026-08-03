"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 41.7 — Config do relatório de funil perpétuo (botão 3, complemento §C.2).

/** Origens de tráfego que costumam contar como pago. O usuário pode digitar outras. */
export const PERPETUAL_ORIGENS_SUGERIDAS = ["meta", "fb", "ig", "google"] as const;

export type RateOrigem = "config" | "default";

export interface PerpetualRates {
  plataforma: number;
  imposto: number;
  outros: number;
  reembolso: number;
  receitaLiquidaPct: number;
  fonte: { plataforma: RateOrigem; imposto: RateOrigem; outros: RateOrigem };
}

export interface PerpetualReportConfig {
  prefixoCampanha: string | null;
  produto: string | null;
  produtosOrderBump: string[];
  temSplitFormato: boolean;
  origensPagas: string[];
  inicioTrafego: string | null;
  impostoPct: number;
  impostoOrigem: RateOrigem;
  taxaPlataformaPct: number | null;
  taxaImpostoPct: number | null;
  taxaOutrosPct: number | null;
  validado: boolean;
  validadoEm: string | null;
  validadoPor: string | null;
  validadoPorNome: string | null;
}

export interface PerpetualReportConfigResponse {
  funnel: { id: string; name: string; type: string };
  config: PerpetualReportConfig | null;
  /** Vem do funil, não da config — exibido em leitura. */
  herdado: { metaAccountId: string | null; campanhasVinculadas: number };
  resolvido: { comStatusReal: PerpetualRates; semStatusReal: PerpetualRates };
  defaults: Record<
    string,
    { plataforma: number; imposto: number; outros: number; reembolso: number }
  >;
  /** null = relatório liberado. Preenchido = motivo do bloqueio (§C.8). */
  bloqueio: { erro: string; detalhe: string; acao: string } | null;
}

export interface PerpetualConfigInput {
  prefixoCampanha?: string | null;
  produto?: string | null;
  produtosOrderBump?: string[];
  temSplitFormato?: boolean;
  origensPagas?: string[];
  inicioTrafego?: string | null;
  impostoPct?: number | null;
  taxaPlataformaPct?: number | null;
  taxaImpostoPct?: number | null;
  taxaOutrosPct?: number | null;
}

function basePath(projectId: string, funnelId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/perpetual-report-config`;
}

function queryKey(projectId: string, funnelId: string) {
  return ["perpetual-report-config", projectId, funnelId] as const;
}

export function usePerpetualReportConfig(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: queryKey(projectId ?? "", funnelId ?? ""),
    queryFn: () => apiClient<PerpetualReportConfigResponse>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
    staleTime: 30 * 1000,
  });
}

export function useSavePerpetualReportConfig(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PerpetualConfigInput) =>
      apiClient<{ ok: true; validadoResetado: boolean }>(basePath(projectId, funnelId), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(projectId, funnelId) });
    },
  });
}

export function useValidatePerpetualReportConfig(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true; validado: boolean }>(`${basePath(projectId, funnelId)}/validate`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(projectId, funnelId) });
    },
  });
}

/** Checklist do §C.11 — exibido no ato de validar, não escondido na doc. */
export const PERPETUAL_VALIDATION_CHECKLIST = [
  "Prefixo de campanha confere com o ciclo vigente (ele muda por mês)",
  "Todas as campanhas do funil estão vinculadas no picker da aba Meta Ads",
  "Origens pagas cobrem o que realmente veio de mídia paga",
  "Order bumps listados batem com os produtos da planilha",
  "Taxas conferidas contra o extrato da plataforma",
  "Investimento com gross-up de imposto bate com o Gerenciador",
  "Faturamento e nº de vendas batem com a planilha no mesmo período",
  "Split de formato marcado só se os nomes de campanha trazem vídeos/estáticos",
] as const;
