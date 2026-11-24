"use client";

import { useAuth } from "@clerk/nextjs";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { baixarHtml } from "@/lib/utils/baixar-debriefing";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  InstagramMonthlyReportRecord,
  InstagramMonthlyReportListItem,
} from "@loyola-x/shared";

export function useInstagramReport(
  projectId: string | null,
  reportId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-report", projectId, reportId],
    queryFn: () =>
      apiClient<InstagramMonthlyReportRecord>(
        `/api/projects/${projectId}/reports/instagram/${reportId}`,
      ),
    enabled: !!projectId && !!reportId,
    staleTime: 60 * 60 * 1000, // 1h — relatório é snapshot, raramente muda
  });
}

export function useInstagramReports(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-reports", projectId],
    queryFn: () =>
      apiClient<(InstagramMonthlyReportListItem & { generatedByName?: string })[]>(
        `/api/projects/${projectId}/reports/instagram`,
      ),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5min
  });
}

export function useGenerateInstagramReport(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: string }) =>
      apiClient<InstagramMonthlyReportRecord>(
        `/api/projects/${projectId}/reports/instagram/generate`,
        {
          method: "POST",
          body: JSON.stringify({ month: input.month }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram-reports", projectId] });
    },
  });
}

/**
 * Baixa o relatório do mês como arquivo HTML.
 *
 * Pedido do Social Media: o relatório já era GUARDADO (fica no banco), mas não
 * havia como levar embora — para mandar por e-mail, anexar no ClickUp ou abrir
 * sem acesso ao painel.
 *
 * A rota devolve `text/html`, e não JSON, então aqui é `fetch` direto em vez do
 * `apiClient` (que espera JSON e tentaria parsear o documento inteiro). O nome
 * do arquivo sai do mês, pelo mesmo sanitizador do download do debriefing.
 */
export function useBaixarRelatorioEmHtml(projectId: string) {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (input: { reportId: string; monthLabel: string }) => {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/projects/${projectId}/reports/instagram/${input.reportId}/html`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        let msg = `Falha ao gerar o arquivo (${res.status})`;
        try {
          const corpo = (await res.json()) as { error?: string };
          msg = corpo.error ?? msg;
        } catch {
          // a rota de erro responde JSON; corpo não-JSON mantém a mensagem acima
        }
        throw new Error(msg);
      }
      return { html: await res.text(), monthLabel: input.monthLabel };
    },
    onSuccess: ({ html, monthLabel }) => {
      baixarHtml(`Instagram - ${monthLabel}.html`, html);
    },
  });
}
