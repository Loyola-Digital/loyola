"use client";

// Etapa Lyrio — hooks da integração RevenueCat.
// Conexão por projeto (Secret API Key), config por etapa (rcProject + webhook) e
// agregação de vendas (vinda dos webhooks). JSON via apiClient.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { tentarDeNovoAJornada, type JornadaDoLyrio } from "@/lib/utils/jornada-lyrio";
import { tentarDeNovoNoRevenuecat } from "@/lib/utils/estado-da-fonte-revenuecat";
import type { VendasPorCanalDoLyrio } from "@/lib/utils/vendas-por-canal-lyrio";
import type { PagantesPorCanal } from "@/lib/utils/aquisicao-lyrio";
import type { NovosClientesDoPeriodo } from "@/lib/utils/overview-revenuecat";

const STALE = 60 * 1000;

// ---- Tipos (espelham routes/revenuecat.ts) ----

export interface RevenuecatProject {
  id: string;
  name: string;
}

export interface RevenuecatStageConfig {
  rcProjectId: string | null;
  label: string | null;
  webhook: { path: string; token: string } | null;
  /** Story 42.4 — percentuais da Margem de Contribuição, sobre o faturamento
   * bruto. A API sempre devolve os três preenchidos (defaults 15/5/1). */
  platformFeePct: number;
  taxPct: number;
  otherCostsPct: number;
}

export interface RevenuecatSales {
  days: number;
  totalSales: number;
  revenueUsd: number;
  byCurrency: { currency: string; revenue: number; sales: number }[];
  daily: { day: string; sales: number; revenueUsd: number }[];
  byStore: { store: string; sales: number; revenueUsd: number }[];
  byProduct: { productId: string; sales: number; revenueUsd: number }[];
}

export interface RevenuecatMetric {
  id: string;
  name: string;
  value: number;
  unit: string | null;
}

export interface RevenuecatOverview {
  /** false = nenhum app do RevenueCat selecionado na etapa. */
  configured: boolean;
  metrics: RevenuecatMetric[];
}

// ---- Connection (por projeto) ----

export function useRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-connection", projectId],
    queryFn: () =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`),
    staleTime: STALE,
  });
}

export function useSaveRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`, {
        method: "PUT",
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["revenuecat-projects", projectId] });
    },
  });
}

export function useDeleteRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["revenuecat-projects", projectId] });
    },
  });
}

export function useRevenuecatProjects(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-projects", projectId],
    queryFn: () =>
      apiClient<{ projects: RevenuecatProject[] }>(`/api/projects/${projectId}/revenuecat/projects`),
    enabled,
    staleTime: STALE,
  });
}

// ---- Config + webhook (por etapa) ----

export function useRevenuecatConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-config", stageId],
    queryFn: () =>
      apiClient<RevenuecatStageConfig>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/config`,
      ),
    staleTime: STALE,
  });
}

export function useSaveRevenuecatConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    // PUT parcial: o que não vier no body é preservado pela API (Story 42.4).
    mutationFn: (data: {
      rcProjectId?: string | null;
      label?: string | null;
      platformFeePct?: number;
      taxPct?: number;
      otherCostsPct?: number;
    }) =>
      apiClient<{ ok: boolean }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/config`,
        { method: "PUT", body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-config", stageId] }),
  });
}

export function useEnsureRevenuecatWebhook(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rotate: boolean) =>
      rotate
        ? apiClient<{ path: string; token: string }>(
            `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/webhook/rotate`,
            { method: "POST" },
          )
        : apiClient<{ path: string; token: string }>(
            `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/webhook`,
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-config", stageId] }),
  });
}

// ---- Sales (agregação) ----

export function useRevenuecatSales(
  projectId: string,
  funnelId: string,
  stageId: string,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-sales", stageId, days],
    queryFn: () =>
      apiClient<RevenuecatSales>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/sales?days=${days}`,
      ),
    staleTime: STALE,
  });
}

// Overview agregado puxado da API do RevenueCat (não depende do webhook).
// Story 42.14 (PO-D4 (6)): sem insistir em 429 — o limite de 25 consultas por
// minuto é compartilhado com receita e gráficos, e repetir só o gasta.
export function useRevenuecatOverview(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-overview", stageId],
    queryFn: () =>
      apiClient<RevenuecatOverview>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/overview`,
      ),
    staleTime: STALE,
    retry: tentarDeNovoNoRevenuecat,
  });
}

// ============================================================
// Backfill do histórico de assinaturas
// ============================================================

/**
 * O webhook só registra o que acontece depois de plugado; o backfill traz o que
 * veio antes, lendo as assinaturas cliente a cliente na API v2. É percurso
 * longo (milhares de clientes), então roda por LOTE: cada disparo avança um
 * pedaço e salva o cursor, e `temMais` diz se ainda falta.
 */
export interface RevenuecatBackfillStatus {
  status: "idle" | "running" | "done" | "error";
  customersProcessed: number;
  subscriptionsUpserted: number;
  temMais: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  temAlgumaAssinatura: boolean;
}

export interface RevenuecatBackfillResult {
  status: "done" | "partial" | "error";
  customersProcessed: number;
  subscriptionsUpserted: number;
  temMais: boolean;
  error?: string;
}

export function useRevenuecatBackfillStatus(
  projectId: string,
  funnelId: string,
  stageId: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-backfill", stageId],
    queryFn: () =>
      apiClient<RevenuecatBackfillStatus>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/backfill`,
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 10 * 1000,
  });
}

export function useRunRevenuecatBackfill(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limite?: number) =>
      apiClient<RevenuecatBackfillResult>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/backfill`,
        { method: "POST", body: JSON.stringify(limite ? { limite } : {}) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-backfill", stageId] }),
  });
}

// ============================================================
// Story 42.9 (AC8) — as métricas que a API não entrega.
// ============================================================

export interface RevenuecatMetricasDerivadas {
  novasAssinaturasPagas: number;
  novosTrials: number;
  conversoesDeTrial: number;
  taxaDeConversaoDeTrial: number | null;
  churnPagante: number;
  abandonoDeTrial: number;
  cancelamentosPagantes: number;
  movimentoDeAssinaturas: number;
  /** Data do primeiro evento de ASSINATURA. Antes disso não há série (AC5). */
  serieDesde: string | null;
  totalDeEventos: number;
  /**
   * Story 42.14 (AC10b) — o ECO da janela aplicada. A API anterior ignora
   * `?days=` e não manda estes campos: sem eles, o número é da série inteira.
   */
  days?: number | null;
  desde?: string | null;
}

/**
 * Story 42.14 — com `days`, os números são da janela (N dias de SP); a resposta
 * ecoa a janela, e é o eco (não o pedido) que decide a etiqueta (PO-10).
 */
export function useRevenuecatMetricasDerivadas(
  projectId: string,
  funnelId: string,
  stageId: string,
  days?: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-metricas-derivadas", stageId, days ?? null],
    queryFn: () =>
      apiClient<RevenuecatMetricasDerivadas>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/metricas-derivadas${days != null ? `?days=${days}` : ""}`,
      ),
    staleTime: STALE,
  });
}

// ============================================================
// Story 42.14 (D22) — a receita do RevenueCat na janela do filtro.
// ============================================================

/** Espelha `GET …/revenuecat/receita` (`routes/revenuecat.ts`). */
export interface RevenuecatReceita {
  /** false = nenhum app do RevenueCat selecionado na etapa. */
  configured: boolean;
  days: number;
  /** Primeiro e último dia da janela (`AAAA-MM-DD`, SP), enviados como start/end_date. */
  desde: string;
  ate: string;
  /** Receita bruta em US$; `null` só quando `configured` é false. */
  valorUsd: number | null;
  moeda?: string;
  tipoDeReceita?: string | null;
  intervaloDaApi?: { inicio: string | null; fim: string | null };
}

/**
 * ⚠️ Rota NOVA (contrato 58): com a API anterior responde 404 — a tela trata
 * como API atrás (`estadoDaFonte` → oculto). Sem insistir em 429 nem 404
 * (PO-D4 (6)). Resumo e Overview pedem a MESMA chave: uma chamada por janela,
 * que conta uma vez no limite de 25/min do RevenueCat.
 */
export function useRevenuecatReceita(projectId: string, funnelId: string, stageId: string, days: number, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-receita", stageId, days],
    queryFn: () =>
      apiClient<RevenuecatReceita>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/receita?days=${days}`,
      ),
    enabled,
    staleTime: STALE,
    retry: tentarDeNovoNoRevenuecat,
  });
}

// ============================================================
// Story 42.11 — jornada do usuário por canal (webhook, agregada na API).
// ============================================================

/**
 * ⚠️ Rota NOVA: a API em produção pode ser mais velha que o painel e responder
 * 404 — o bloco some (`estadoDoBlocoDaJornada`) e o banner de versão explica.
 * Insistir não adianta: a rota não passa a existir entre um retry e outro.
 */
export function useRevenuecatJornada(projectId: string, funnelId: string, stageId: string, days: number) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-jornada", stageId, days],
    queryFn: () =>
      apiClient<JornadaDoLyrio>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/jornada?days=${days}`,
      ),
    staleTime: STALE,
    retry: tentarDeNovoAJornada,
  });
}

// ============================================================
// Story 42.12 — vendas pagas por canal (Meta · Google · orgânico · sem atribuição)
// ============================================================

/**
 * ⚠️ Rota NOVA (contrato 41): com a API anterior responde 404 — os blocos novos
 * somem (`estadoDasVendasPorCanal`) e o banner de versão explica. Mesmo `retry`
 * da Jornada: um 404 não vira outra coisa entre tentativas. O Resumo pede
 * `days=28` e o bloco RevenueCat/Detalhamento o `days` do cabeçalho — chaves
 * diferentes no cache, uma consulta por janela.
 */
export function useRevenuecatVendasPorCanal(projectId: string, funnelId: string, stageId: string, days: number, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-vendas-por-canal", stageId, days],
    queryFn: () =>
      apiClient<VendasPorCanalDoLyrio>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/vendas-por-canal?days=${days}`,
      ),
    enabled,
    staleTime: STALE,
    retry: tentarDeNovoAJornada,
  });
}

/**
 * Story 42.14 (D22) — "Novos clientes" na janela do filtro, pelo chart
 * `customers_new` (rota nova, contrato 58). 404 da rota → API atrás (o card fica
 * nos 28 dias do overview, declarado). Sem insistir em 429 nem 404 (PO-D4 (6)).
 * Resumo e Overview pedem a mesma chave: uma chamada por janela.
 */
export function useRevenuecatNovosClientes(projectId: string, funnelId: string, stageId: string, days: number, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-novos-clientes", stageId, days],
    queryFn: () =>
      apiClient<NovosClientesDoPeriodo>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/novos-clientes?days=${days}`,
      ),
    enabled,
    staleTime: STALE,
    retry: tentarDeNovoNoRevenuecat,
  });
}

// ============================================================
// Story 42.14 (AC6, AC7, AC8) — novos pagantes por pessoa, renovações e LTV.
// ============================================================

/**
 * ⚠️ Rota NOVA (contrato 58): com a API anterior responde 404 — os cards de CAC,
 * LTV e renovação não aparecem (`cardsDeAquisicao`) e o banner de versão
 * explica. Mesmo `retry` da Jornada: um 404 não vira outra coisa entre
 * tentativas. O Resumo pede o filtro e os 28 dias; o Overview, os 28 dias (a
 * mesma chave).
 */
export function useRevenuecatPagantesPorCanal(projectId: string, funnelId: string, stageId: string, days: number, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-pagantes-por-canal", stageId, days],
    queryFn: () =>
      apiClient<PagantesPorCanal>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/pagantes-por-canal?days=${days}`,
      ),
    enabled,
    staleTime: STALE,
    retry: tentarDeNovoAJornada,
  });
}
