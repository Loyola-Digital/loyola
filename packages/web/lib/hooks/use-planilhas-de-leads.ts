"use client";
/**
 * Story 18.100 — leitura de N planilhas de leads de uma etapa.
 *
 * `useFunnelSpreadsheetData` lê UMA planilha, e hook não entra em laço. Aqui a
 * leitura é por `useQueries`, com a MESMA chave e a MESMA URL que
 * `useFunnelSpreadsheetData` (`["funnel-spreadsheets", projectId, funnelId, id,
 * "data"]`), para dividir o cache com os outros leitores. Desde a Story 18.101
 * (AC2), `useFunnelSpreadsheetData` nunca manda `campaignName`: toda leitura da
 * planilha é a planilha inteira, e o recorte de campanha (só na de vendas e no
 * fallback do hook de métricas cruzadas) é feito em memória. O teste de fio
 * `planilhas-de-leads-fio-18100.test.ts` confere que as duas chaves seguem iguais.
 *
 * Para as abas CRUAS (ponto 4), a chave é a de `useSheetData`
 * (`["google-sheets-data", spreadsheetId, sheetName]`), no mesmo padrão que
 * `use-survey-aggregation.ts` já usa para as abas de pesquisa.
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { SheetData } from "@/lib/hooks/use-google-sheets";
import type {
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
} from "@/lib/types/funnel-spreadsheet";
import { unirPlanilhasDeLeads } from "@/lib/utils/planilhas-de-leads";

/** A mesma chave de `useFunnelSpreadsheetData` sem filtro (`use-funnel-spreadsheets.ts`). */
export function chaveDosDadosDaPlanilha(projectId: string, funnelId: string, id: string) {
  return ["funnel-spreadsheets", projectId, funnelId, id, "data"] as const;
}

export interface DadosDasPlanilhasDeLeads {
  /** A união (`unirPlanilhasDeLeads`); `undefined` enquanto alguma não carregou. */
  data: FunnelSpreadsheetData | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Os dados (`named`) das planilhas, unidos. Sem `campaignName`: a planilha de
 * leads não é filtrada por campanha (AC4b, P-6 (y) do gestor).
 */
export function useDadosDasPlanilhasDeLeads(
  projectId: string,
  funnelId: string,
  planilhas: FunnelSpreadsheet[],
): DadosDasPlanilhasDeLeads {
  const apiClient = useApiClient();
  const resultados = useQueries({
    queries: planilhas.map((p) => ({
      queryKey: chaveDosDadosDaPlanilha(projectId, funnelId, p.id),
      queryFn: () =>
        apiClient<FunnelSpreadsheetData>(
          `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets/${p.id}/data`,
        ),
      enabled: Boolean(projectId && funnelId && p.id),
      staleTime: 30 * 1000,
    })),
  });

  // `useQueries` devolve um array novo a cada render; a chave abaixo só muda
  // quando alguma planilha muda de fato.
  const versao = resultados.map((r) => r.dataUpdatedAt).join(",");
  const ids = planilhas.map((p) => `${p.id}:${p.type}`).join(",");
  const data = useMemo(
    () =>
      unirPlanilhasDeLeads(
        planilhas.map((planilha, i) => ({ planilha, dados: resultados[i]?.data })),
      ),
    // `versao` e `ids` resumem `resultados` e `planilhas` (ver acima).
    [versao, ids],
  );

  return {
    data,
    isLoading: resultados.some((r) => r.isLoading),
    error: resultados.find((r) => r.error)?.error ?? null,
  };
}

export interface AbasCruasDasPlanilhas {
  /** Uma por planilha, na ordem recebida; `undefined` enquanto carrega. */
  abas: (SheetData | undefined)[];
  isLoading: boolean;
  error: Error | null;
  /** Muda quando alguma aba muda — para usar como dependência de `useMemo`. */
  versao: string;
}

/** As abas cruas das planilhas (ponto 4), com a chave de `useSheetData`. */
export function useAbasCruasDasPlanilhas(planilhas: FunnelSpreadsheet[]): AbasCruasDasPlanilhas {
  const apiClient = useApiClient();
  const resultados = useQueries({
    queries: planilhas.map((p) => ({
      queryKey: ["google-sheets-data", p.spreadsheetId, p.sheetName] as const,
      queryFn: () =>
        apiClient<SheetData>(
          `/api/google-sheets/spreadsheets/${p.spreadsheetId}/sheets/${encodeURIComponent(p.sheetName)}/data`,
        ),
      enabled: !!p.spreadsheetId && !!p.sheetName,
      staleTime: 30 * 1000,
    })),
  });
  return {
    abas: resultados.map((r) => r.data),
    isLoading: resultados.some((r) => r.isLoading),
    error: resultados.find((r) => r.error)?.error ?? null,
    versao: resultados.map((r) => r.dataUpdatedAt).join(","),
  };
}
