"use client";

/**
 * Aplicações por dia — uma série por planilha de aplicação (forma) do funil.
 *
 * O time pode ter mais de uma planilha de aplicação no mesmo lançamento (ex.:
 * "form com ticket" e "form sem ticket"); cada uma vira uma forma nomeada pelo
 * `label`. As séries vêm alinhadas pelo dia relativo (não pela data) porque a
 * pergunta é "estamos melhor que o lançamento passado NESTA altura?" — comparar
 * por data não responde isso, já que dois lançamentos começam em dias
 * diferentes. A comparação é casada forma a forma pelo nome.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface ApplicationDay {
  /** 1 = primeiro dia com aplicação do lançamento. */
  dia: number;
  date: string;
  aplicacoes: number;
  acumulado: number;
}

export interface ApplicationForm {
  /** id da planilha (funnel_spreadsheets) — chave estável de série. */
  sheetId: string;
  /** nome amigável da forma (label da planilha) — mostrado no tooltip/legenda. */
  label: string;
  total: number;
  points: ApplicationDay[];
}

export interface StageApplications {
  funnelName: string;
  /** nome do lançamento de comparação (compareFunnelId). null = não configurado. */
  compareFunnelName: string | null;
  /** true = nenhuma planilha do tipo "applications" vinculada. */
  semPlanilha: boolean;
  /** uma série por planilha de aplicação (lançamento atual). */
  forms: ApplicationForm[];
  /** total AGREGADO do lançamento anterior (soma das planilhas), no eixo D-day.
   *  É a linha tracejada de comparação — casa lançamento vs lançamento, não por
   *  nome de forma. null = sem lançamento de comparação / sem dados. */
  comparison: { points: ApplicationDay[]; total: number } | null;
  /** soma das aplicações de todas as formas do lançamento atual. */
  currentTotal: number;
  /** Acumulado total atual vs. o do anterior NO MESMO D-day. null = sem base. */
  deltaPercent: number | null;
}

export function useStageApplications(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-applications", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageApplications>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/applications-daily`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 60 * 1000,
  });
}

// ============================================================
// Faixas por formulário
// ============================================================

/**
 * Mesma lista de formas do gráfico acima, agora quebrada por faixa de
 * qualificação e cruzada com quem comprou — responde "qual página traz lead
 * melhor", não só "qual página traz mais lead".
 *
 * A faixa sai da coluna "Faixa 1" da própria aba do formulário quando ela
 * existe; senão, do cruzamento por e-mail/telefone com as pesquisas do funil.
 * Leitura do lançamento inteiro — não acompanha o filtro de dias do dashboard.
 */
export interface ApplicationBandRow {
  /** Faixa (A/B/C/D…). null = aplicou mas não foi encontrado na pesquisa. */
  band: string | null;
  /** Contatos únicos que aplicaram nesta forma dentro da faixa. */
  aplicacoes: number;
  compradores: number;
  /** % de compradores sobre aplicações da faixa. */
  conversao: number;
  receita: number;
}

export interface ApplicationBandGroup {
  aplicacoes: number;
  /** Quantos contatos tiveram faixa identificada (resto é `band: null`). */
  comFaixa: number;
  compradores: number;
  conversao: number;
  receita: number;
  bands: ApplicationBandRow[];
}

export interface ApplicationBandForm extends ApplicationBandGroup {
  sheetId: string;
  label: string;
  /** Planilha ilegível (permissão/aba renomeada) — a forma aparece zerada. */
  erro: boolean;
  /** Linhas com contato. Maior que `aplicacoes` quando alguém aplica 2x. */
  linhas: number;
  /**
   * "form" = coluna de faixa na própria aba (cobertura total).
   * "cruzamento" = faixa veio da pesquisa por e-mail/telefone (cobertura
   * parcial). null = nenhuma faixa encontrada pra esta forma.
   */
  fonteFaixa: "form" | "cruzamento" | null;
}

export interface StageApplicationBands {
  /** true = nenhuma planilha do tipo "applications" vinculada ao funil. */
  semPlanilha: boolean;
  /** true = nenhuma pesquisa do funil tem coluna de faixa. */
  semFaixa: boolean;
  bandLabels: string[];
  forms: ApplicationBandForm[];
  /** Consolidado, deduplicado por contato entre as formas. */
  total: ApplicationBandGroup | null;
}

export function useStageApplicationBands(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-application-bands", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageApplicationBands>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/application-bands`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 60 * 1000,
  });
}
