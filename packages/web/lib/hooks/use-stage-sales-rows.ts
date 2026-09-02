"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

/**
 * Story 18.72 — as LINHAS das planilhas de venda da etapa.
 *
 * `useStageSalesSpreadsheets` devolve só o cadastro (id, sheetName,
 * columnMapping) e `useStageSalesData` devolve KPIs já somados. Nenhum dos dois
 * serve para agrupar linha a linha, que é o que a tabela por UTM faz — por isso
 * ela enxergava zero venda em toda etapa cuja planilha vive em
 * `stage_sales_spreadsheets` e não em `funnel_spreadsheets`.
 *
 * O `named` vem do backend já no vocabulário comum (`value`, `date`, `utm_*`),
 * não no desta tabela (`valorBruto`, `dataVenda`).
 */
export interface StageSalesSheetRows {
  id: string;
  subtype: string;
  sheetName: string;
  headers: string[];
  rows: Array<{ values: string[]; named: Record<string, string> }>;
  /** Presente quando a planilha existe mas não pôde ser lida (AC4). */
  erro?: string;
}

const STALE_TIME = 2 * 60 * 1000;

export function useStageSalesRows(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-sales-rows", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageSalesSheetRows[]>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/rows`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
