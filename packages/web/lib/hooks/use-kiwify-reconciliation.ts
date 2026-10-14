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
  /**
   * aaaa-mm-dd. Nulo desde a 0171: como FONTE de vendas a etapa pode pegar tudo
   * que a sincronização tem. A CONFERÊNCIA ainda exige — sem ela a rota recusa
   * com `SEM_DATA_DE_INICIO`.
   */
  startDate: string | null;
  /**
   * aaaa-mm-dd — até quando contar (0172). Nulo = janela aberta.
   *
   * Serve o produto que vende SEM oferta e é reaproveitado em mais de um
   * funil: ali não há oferta para marcar, e só a janela separa os dois.
   */
  endDate?: string | null;
  /**
   * De onde a etapa tira as vendas. `kiwify` SUBSTITUI a planilha: ela
   * costuma ser um espelho da própria Kiwify, e somar as duas contaria a mesma
   * venda duas vezes.
   */
  fonteDeVendas?: "planilha" | "kiwify";
  /**
   * Ofertas escolhidas. Vazio = TODAS as ofertas dos produtos. `sem-oferta`
   * inclui a venda sem oferta nenhuma, que sem isso não teria como entrar.
   */
  offerIds?: string[];
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
      /** `lotes` = contagem oficial do evento; `preco` = derivado do valor. */
      fonteDosIngressos: "lotes" | "preco" | null;
      ticketPrice: number | null;
      ingressosPorLote: Array<{
        produto: string;
        lote: string;
        preco: number;
        emitidos: number;
        disponiveis: number;
        total: number;
      }>;
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
    mutationFn: (dados: {
      productIds: string[];
      startDate?: string | null;
      endDate?: string | null;
      fonteDeVendas?: "planilha" | "kiwify";
      offerIds?: string[];
      ticketPrice?: number | null;
    }) =>
      apiClient<{ config: KiwifyStageConfig }>(`${base(projectId, funnelId, stageId)}/config`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-stage-config", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["kiwify-reconciliation", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["kiwify-ofertas", projectId, funnelId, stageId] });
      // Trocar a fonte muda TODO número de venda da etapa — os quatro
      // endereços que leem venda têm de ser refeitos, senão a tela mostra o
      // faturamento novo com a conversão antiga.
      qc.invalidateQueries({ queryKey: ["sales-data"] });
      qc.invalidateQueries({ queryKey: ["sales-conversion"] });
      qc.invalidateQueries({ queryKey: ["hot-cold-buyers"] });
      qc.invalidateQueries({ queryKey: ["sales-data-daily"] });
    },
  });
}

export interface OfertaDaKiwify {
  /** `sem-oferta` quando a venda não tem oferta nenhuma. */
  id: string;
  nome: string;
  produto: string | null;
  /** O id do produto — usado para soltar a oferta quando o produto é desmarcado. */
  produtoId: string | null;
  vendas: number;
  /** Primeira e última venda desta oferta (aaaa-mm-dd). Distingue duas ofertas
   *  do mesmo produto que vendem para funis diferentes. */
  de: string | null;
  ate: string | null;
}

/**
 * As ofertas que existem nas vendas já sincronizadas.
 *
 * Sai das VENDAS porque `/v1/products` da Kiwify não lista ofertas. Por isso
 * `sincronizadoEm` vem junto: sem ele, lista vazia parece "não tem oferta"
 * quando a verdade é "ninguém sincronizou ainda".
 */
export function useKiwifyOfertas(
  projectId: string,
  funnelId: string,
  stageId: string,
  habilitado: boolean,
  /**
   * Os produtos MARCADOS na tela. Sem eles a rota usa os salvos, e a lista só
   * mudava depois de salvar e reabrir — quem marcava o produto via as ofertas
   * do produto anterior.
   */
  produtos: string[] = [],
) {
  const apiClient = useApiClient();
  // Ordenado para a ordem dos cliques não virar duas entradas de cache da
  // mesma pergunta.
  const chave = [...produtos].sort().join(",");
  return useQuery({
    queryKey: ["kiwify-ofertas", projectId, funnelId, stageId, chave],
    queryFn: () =>
      apiClient<{
        ofertas: OfertaDaKiwify[];
        sincronizadoEm: string | null;
        sincronizadoDe: string | null;
      }>(
        `${base(projectId, funnelId, stageId)}/ofertas${
          chave ? `?produtos=${encodeURIComponent(chave)}` : ""
        }`,
      ),
    enabled: habilitado,
    staleTime: 60 * 1000,
  });
}

/** Puxa as vendas da Kiwify para o banco. Escreve, então é POST. */
export function useSincronizarVendasKiwify(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { desde?: string | null } = {}) =>
      apiClient<{ de: string; ate: string; lidas: number; gravadas: number; semId: number }>(
        `/api/projects/${projectId}/kiwify/sales/sync`,
        { method: "POST", body: JSON.stringify(dados) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-ofertas"] });
      qc.invalidateQueries({ queryKey: ["sales-data"] });
      qc.invalidateQueries({ queryKey: ["sales-conversion"] });
      qc.invalidateQueries({ queryKey: ["hot-cold-buyers"] });
      qc.invalidateQueries({ queryKey: ["sales-data-daily"] });
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
