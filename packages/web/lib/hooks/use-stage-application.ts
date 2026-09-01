"use client";

/**
 * A Etapa de Aplicação — leitura e configuração.
 *
 * O dashboard lê planilha ao vivo (pesquisa + venda), então demora mais que uma
 * consulta ao banco. O `staleTime` é curto de propósito: o time edita a
 * planilha e espera ver aqui, que é o contrato das outras telas de planilha.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

/** Uma planilha de venda do funil, candidata a fonte desta etapa. */
export interface FonteDeVenda {
  id: string;
  /** De qual etapa ela veio — "n8n-kiwify-produto" sozinho não diz nada. */
  stageName: string;
  subtype: string;
  spreadsheetName: string;
  sheetName: string;
  /** Sem UTM mapeada, a quebra por origem sai toda em "Sem Track". */
  temUtm: boolean;
}

export interface QuebraPorOrigem {
  /** Já vem legível: id de conjunto da Meta chega traduzido para o nome. */
  origem: string;
  vendas: number;
  valor: number;
  aplicacoes: number;
  /** Aplicações DESTA origem que viraram compra — o numerador da conversão. */
  converteram: number;
}

export interface ResumoDaAplicacao {
  aplicacoes: number;
  vendas: number;
  valorTotal: number;
  converteram: number;
  /** `null` quando não houve aplicação no período — não é zero. */
  taxaDeConversao: number | null;
  porUtmSource: QuebraPorOrigem[];
  porUtmMedium: QuebraPorOrigem[];
}

export interface DashboardDaAplicacao {
  periodo: { days: number | null; desde: string | null };
  resumo: ResumoDaAplicacao;
  fontes: { aplicacoes: number; vendas: number };
  avisos: string[];
}

function base(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/application`;
}

export function useFontesDaAplicacao(projectId: string, funnelId: string, stageId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["application-sources", projectId, funnelId, stageId],
    queryFn: () =>
      api<{ disponiveis: FonteDeVenda[]; escolhidas: string[] }>(
        `${base(projectId, funnelId, stageId)}/sources`,
      ),
  });
}

export function useSalvarFontesDaAplicacao(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (salesSpreadsheetIds: string[]) =>
      api<{ ok: true; escolhidas: string[] }>(`${base(projectId, funnelId, stageId)}/sources`, {
        method: "PUT",
        body: JSON.stringify({ salesSpreadsheetIds }),
      }),
    onSuccess: () => {
      // O dashboard depende da escolha: sem invalidar, a tela continua
      // mostrando "escolha uma fonte" depois de a pessoa ter escolhido.
      void qc.invalidateQueries({ queryKey: ["application-sources", projectId, funnelId, stageId] });
      void qc.invalidateQueries({ queryKey: ["application-dashboard", projectId, funnelId, stageId] });
    },
  });
}

export function useDashboardDaAplicacao(
  projectId: string,
  funnelId: string,
  stageId: string,
  days: number | null,
) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["application-dashboard", projectId, funnelId, stageId, days],
    queryFn: () =>
      api<DashboardDaAplicacao>(
        `${base(projectId, funnelId, stageId)}/dashboard${days ? `?days=${days}` : ""}`,
      ),
    staleTime: 30_000,
  });
}
