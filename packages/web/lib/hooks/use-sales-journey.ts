"use client";

/**
 * Etapa de Vendas: comparação D-day, origem dos compradores e jornada do lead.
 *
 * As três leem Google Sheets ao vivo no servidor, então o staleTime é generoso —
 * remontar a aba não deve custar uma nova rodada de leitura de planilha.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface SalesDay {
  /** 1 = primeiro dia com venda daquele funil. */
  dia: number;
  date: string;
  vendas: number;
  acumulado: number;
  /** Quebra das vendas do dia por origem (utm_source da venda), desc. */
  porSource: { source: string; vendas: number }[];
}

export interface SalesDailyComparison {
  funnelName: string;
  /** true = nenhuma planilha de produto principal vinculada. */
  semPlanilha: boolean;
  total: number;
  /** Vendas descartadas por não terem data válida na planilha. */
  semData: number;
  points: SalesDay[];
  comparacao: {
    funnelName: string;
    points: SalesDay[];
    total: number;
    semPlanilha: boolean;
  } | null;
  /** Acumulado atual vs. o do anterior NO MESMO D-day. null = sem base. */
  deltaPercent: number | null;
}

export interface BuyersOrigin {
  semDados: boolean;
  totalCompradores: number;
  casados: number;
  /** Comprou sem passar pela aplicação, ou usou outro e-mail no checkout. */
  semOrigem: number;
  /**
   * Cada dimensão responde uma pergunta diferente sobre os mesmos compradores.
   * `comInfo` = quantos tinham aquela informação no utm_term — sem isso, "3
   * vieram da lpa" esconde que só 5 dos 27 tinham LP registrada.
   */
  dimensoes: {
    key: string;
    label: string;
    comInfo: number;
    itens: { nome: string; compradores: number }[];
  }[];
  /** Compradores cujo utm_term seguia o padrão estruturado do Meta. */
  comTermEstruturado: number;
  /** Toda planilha conectada no funil (menos as de venda) e quantos casou. */
  fontes: { label: string; tipo: "pesquisa" | "aplicacao" | "captacao"; compradores: number }[];
}

export interface JourneyEvent {
  kind: "captacao" | "aplicacao" | "pesquisa" | "compra" | "venda_manual" | "comercial";
  date: string | null;
  titulo: string;
  detalhe: string | null;
  funnelName: string;
  stageName: string | null;
  campos: { label: string; valor: string }[];
}

export interface LeadJourney {
  email: string;
  scope: "funnel" | "project";
  encontrado: boolean;
  eventos: JourneyEvent[];
  resumo: {
    total: number;
    compras: number;
    primeiroContato: string | null;
    funis: string[];
  };
}

/** Uma LP no mini-funil: o meio do funil que só existe nas planilhas. */
export interface LpFunnelRow {
  /** "LPA" — mesma chave que a tabela de LPs usa. */
  lp: string;
  /** Rótulos finos fundidos nesta chave ("LPAA"). Vazio quando não houve. */
  variantes: string[];
  leads: number;
  aplicacoes: number;
  pesquisas: number;
  compras: number;
  receita: number;
}

export interface LpFunnel {
  semDados: boolean;
  lps: LpFunnelRow[];
  /** Pessoas cuja LP não foi identificada — NÃO rateadas entre as páginas. */
  semLp: { leads: number; aplicacoes: number; pesquisas: number; compras: number };
  /**
   * Como cada pessoa foi atribuída. `heranca` alto significa que a LP veio do
   * lead de captação, não do registro da própria etapa — o card avisa.
   */
  cobertura: { term: number; campanha: number; heranca: number; semLp: number };
  fontes: {
    label: string;
    tipo: "pesquisa" | "aplicacao" | "captacao";
    linhas: number;
    comLp: number;
    erro: boolean;
    semColunaTerm: boolean;
    /** Linhas descartadas por data ilegível na coluna de data da aba. */
    dataIlegivel: number;
  }[];
}

function base(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

/**
 * Mini-funil por LP. Lê todas as planilhas do funil no servidor, então só
 * dispara quando alguém abre um card (`enabled`) — e o resultado é compartilhado
 * entre todas as LPs, porque a query não depende de qual linha foi expandida.
 */
export function useLpFunnel(
  projectId: string,
  funnelId: string,
  stageId: string,
  days?: number,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lp-funnel", projectId, funnelId, stageId, days ?? null],
    queryFn: () =>
      apiClient<LpFunnel>(
        `${base(projectId, funnelId, stageId)}/lp-funnel${days ? `?days=${days}` : ""}`,
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

export interface LpFunnelView {
  byLp: Record<string, LpFunnelRow>;
  /** Conversão lead → compra somando TODAS as LPs — a régua de cada card. */
  refConversao: number | null;
  /** % das atribuições que vieram por herança do lead de captação. */
  pctHeranca: number | null;
  /** Que tipos de planilha a etapa tem. Etapa sem fonte sai da cadeia do card. */
  temFonte: { aplicacao: boolean; pesquisa: boolean };
  /** Rótulos das planilhas por etapa, para o tooltip dizer de ONDE veio o número. */
  fontesPorEtapa: { captacao: string[]; aplicacao: string[]; pesquisa: string[] };
  /** Linhas descartadas por data ilegível — some do card sem isso. */
  dataIlegivel: number;
}

/**
 * Deriva o que o card precisa a partir da resposta crua. Vive aqui, e não em
 * cada dashboard, porque as duas telas que mostram a tabela de LPs (lançamento e
 * Meta Ads Teste) precisam exatamente das mesmas contas — e uma régua calculada
 * de dois jeitos diferentes é como o mesmo número acaba divergindo entre abas.
 */
export function useLpFunnelView(data: LpFunnel | undefined): LpFunnelView {
  const byLp: Record<string, LpFunnelRow> = {};
  let leads = 0;
  let compras = 0;
  for (const l of data?.lps ?? []) {
    byLp[l.lp.toUpperCase()] = l;
    leads += l.leads;
    compras += l.compras;
  }

  const c = data?.cobertura;
  const atribuidos = c ? c.term + c.campanha + c.heranca : 0;

  // Antes de carregar (`data` undefined) nada é afirmável: dizer "sem fonte"
  // aqui removeria etapas da cadeia e elas voltariam ao chegar a resposta.
  const labels = (tipo: "captacao" | "aplicacao" | "pesquisa"): string[] =>
    (data?.fontes ?? []).filter((f) => f.tipo === tipo && !f.erro).map((f) => f.label);

  return {
    byLp,
    refConversao: leads > 0 ? (compras / leads) * 100 : null,
    pctHeranca: atribuidos > 0 ? (c!.heranca / atribuidos) * 100 : null,
    temFonte: {
      aplicacao: !data || labels("aplicacao").length > 0,
      pesquisa: !data || labels("pesquisa").length > 0,
    },
    fontesPorEtapa: {
      captacao: labels("captacao"),
      aplicacao: labels("aplicacao"),
      pesquisa: labels("pesquisa"),
    },
    dataIlegivel: (data?.fontes ?? []).reduce((s, f) => s + (f.dataIlegivel ?? 0), 0),
  };
}

export function useSalesDailyComparison(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-daily-comparison", projectId, funnelId, stageId],
    queryFn: () => apiClient<SalesDailyComparison>(`${base(projectId, funnelId, stageId)}/sales-daily-comparison`),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBuyersOrigin(
  projectId: string,
  funnelId: string,
  stageId: string,
  days?: number,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["buyers-origin", projectId, funnelId, stageId, days ?? null],
    queryFn: () =>
      apiClient<BuyersOrigin>(
        `${base(projectId, funnelId, stageId)}/buyers-origin${days ? `?days=${days}` : ""}`,
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * A jornada só dispara quando há um e-mail buscado — varrer planilha sem alvo
 * seria puro desperdício de leitura do Sheets.
 */
export function useLeadJourney(
  projectId: string,
  funnelId: string,
  stageId: string,
  email: string | null,
  scope: "funnel" | "project",
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-journey", projectId, funnelId, stageId, email, scope],
    queryFn: () =>
      apiClient<LeadJourney>(
        `${base(projectId, funnelId, stageId)}/lead-journey?email=${encodeURIComponent(email ?? "")}&scope=${scope}`,
      ),
    enabled: !!email && email.length >= 3 && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}
