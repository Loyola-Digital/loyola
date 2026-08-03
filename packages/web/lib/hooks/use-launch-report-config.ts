"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 41.1 — Config do gerador de Resumão/Comparativo (por etapa e por projeto).

export const LAUNCH_REPORT_TIPOS = [
  { value: "pago", label: "Pago" },
  { value: "gratuito", label: "Gratuito" },
  { value: "perpetuo", label: "Perpétuo" },
] as const;

export const LAUNCH_REPORT_ETAPAS = [
  { value: "vendas-captacao", label: "Captação paga (vendas-captacao)" },
  { value: "leads-captacao", label: "Captação gratuita (leads-captacao)" },
  { value: "vendas-principal", label: "Carrinho (vendas-principal)" },
  { value: "leads-downsell", label: "Downsell — leads" },
  { value: "vendas-downsell", label: "Downsell — vendas" },
] as const;

export const LAUNCH_REPORT_ENTIDADES = [
  { value: "vendas", label: "Vendas (transações)" },
  { value: "leads", label: "Leads (cadastros)" },
] as const;

/** Campos canônicos que o bloco de qualificação do Resumão espera (§4/§12.4). */
export const SURVEY_CANONICAL_FIELDS = [
  { value: "faixa", label: "Faixa (lead score)", required: true },
  { value: "idade", label: "Idade", required: false },
  { value: "sexo", label: "Sexo", required: false },
  { value: "estado_civil", label: "Estado civil", required: false },
  { value: "escolaridade", label: "Escolaridade", required: false },
  { value: "renda", label: "Renda", required: false },
  { value: "profissao", label: "Profissão", required: false },
  { value: "setor", label: "Setor de atuação", required: false },
  { value: "funcionarios", label: "Nº de funcionários", required: false },
  { value: "religiao", label: "Religião", required: false },
] as const;

export type LaunchReportTipo = (typeof LAUNCH_REPORT_TIPOS)[number]["value"];
export type LaunchReportEtapa = (typeof LAUNCH_REPORT_ETAPAS)[number]["value"];
export type LaunchReportEntidade = (typeof LAUNCH_REPORT_ENTIDADES)[number]["value"];
export type SurveyCanonicalField = (typeof SURVEY_CANONICAL_FIELDS)[number]["value"];

export type ImpostoOrigem = "stage" | "project" | "default";

export interface LaunchReportStageConfig {
  tipo: LaunchReportTipo;
  etapa: LaunchReportEtapa;
  entidadeCaptura: LaunchReportEntidade;
  dataInicio: string | null;
  dataFim: string | null;
  validado: boolean;
  validadoEm: string | null;
  validadoPor: string | null;
  validadoPorNome: string | null;
}

export interface LaunchReportConfigResponse {
  stage: LaunchReportStageConfig | null;
  expert: {
    impostoPct: number | null;
    camposPesquisa: Partial<Record<SurveyCanonicalField, string>>;
  };
  resolvido: { impostoPct: number; impostoOrigem: ImpostoOrigem };
  /** null = gerador liberado. Preenchido = motivo do bloqueio (§12.2). */
  bloqueio: { erro: string; detalhe: string; acao: string } | null;
  escopoValidado: { tipo: string; etapa: string };
  /** §2.8 — período derivado do dado, usado para pré-preencher os campos vazios. */
  sugestaoPeriodo: { dataInicio: string | null; dataFim: string | null };
}

export interface StageConfigInput {
  tipo: LaunchReportTipo;
  etapa: LaunchReportEtapa;
  entidadeCaptura: LaunchReportEntidade;
  dataInicio?: string | null;
  dataFim?: string | null;
  impostoPct?: number | null;
}

export interface ExpertConfigInput {
  impostoPct?: number | null;
  camposPesquisa?: Partial<Record<SurveyCanonicalField, string>>;
}

function basePath(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/report-config`;
}

function queryKey(projectId: string, funnelId: string, stageId: string) {
  return ["launch-report-config", projectId, funnelId, stageId] as const;
}

export function useLaunchReportConfig(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: queryKey(projectId ?? "", funnelId ?? "", stageId ?? ""),
    queryFn: () => apiClient<LaunchReportConfigResponse>(basePath(projectId!, funnelId!, stageId!)),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 30 * 1000,
  });
}

export interface SurveyQuestionsResponse {
  questions: { key: string; label: string }[];
  semPesquisa: boolean;
}

/** Perguntas reais da pesquisa da etapa — opções do mapa de campos canônicos. */
export function useLaunchReportSurveyQuestions(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  enabled: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["launch-report-survey-questions", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<SurveyQuestionsResponse>(
        `${basePath(projectId!, funnelId!, stageId!)}/survey-questions`,
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveLaunchReportConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StageConfigInput) =>
      apiClient<{ ok: true; validacaoResetada: boolean }>(basePath(projectId, funnelId, stageId), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(projectId, funnelId, stageId) });
    },
  });
}

export function useValidateLaunchReportConfig(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: true; validadoEm: string }>(
        `${basePath(projectId, funnelId, stageId)}/validate`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(projectId, funnelId, stageId) });
    },
  });
}

export function useSaveExpertReportConfig(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpertConfigInput) =>
      apiClient<{ ok: true }>(`/api/projects/${projectId}/report-config`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(projectId, funnelId, stageId) });
    },
  });
}
