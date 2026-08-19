"use client";

/**
 * Plausible Analytics (self-hosted) — alternativa ao GA4.
 *
 * A credencial é GLOBAL (uma instância para todos os experts) e o que varia por
 * projeto é só qual site dela ler. Escolher um site DESLIGA o GA4 daquele
 * projeto — não há um "modo" separado: a fonte é derivada do que está
 * configurado, e o dashboard sai pela mesma rota de sempre.
 *
 * A chave da API nunca chega aqui: o backend devolve só `configured` e a URL.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const STALE = 5 * 60 * 1000;

export interface PlausibleConfig {
  configured: boolean;
  baseUrl: string | null;
  updatedAt: string | null;
  /**
   * Login do painel, quando cadastrado — serve SÓ para listar os sites. A senha
   * nunca volta do servidor; só o e-mail, que é identificador, não segredo.
   */
  loginEmail: string | null;
  /** Só admin edita a config global — a chave vale por todo mundo. */
  podeEditar: boolean;
}

export interface PlausibleTeste {
  ok: boolean;
  detalhe: string;
  /** A instância respondeu, mas a chave não pôde ser verificada sem um site. */
  inconclusivo?: boolean;
}

export interface PlausibleProjectSite {
  siteId: string | null;
  updatedAt: string | null;
  configGlobal: { configured: boolean; baseUrl: string | null };
}

export function usePlausibleConfig() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["plausible-config"],
    queryFn: () => apiClient<PlausibleConfig>("/api/plausible/config"),
    staleTime: STALE,
  });
}

export function useSavePlausibleConfig() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { baseUrl: string; apiKey?: string; loginEmail?: string; loginPassword?: string }) =>
      apiClient<{ configured: boolean; baseUrl: string; aviso: string | null; sitesEncontrados: number | null }>("/api/plausible/config", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plausible-config"] });
      qc.invalidateQueries({ queryKey: ["plausible-site"] });
      qc.invalidateQueries({ queryKey: ["plausible-sites"] });
    },
  });
}

export function useDeletePlausibleConfig() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<{ configured: boolean }>("/api/plausible/config", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plausible-config"] });
      qc.invalidateQueries({ queryKey: ["plausible-site"] });
    },
  });
}

/** Testa as credenciais digitadas; sem corpo, testa as já salvas. */
export function useTestPlausible() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: { baseUrl?: string; apiKey?: string }) =>
      apiClient<PlausibleTeste>("/api/plausible/test", { method: "POST", body: JSON.stringify(data) }),
  });
}

/**
 * Sites da instância.
 *
 * `fonte` explica por que a lista pode vir vazia: `sites-api` só existe na
 * edição Enterprise do Plausible, `sessao` exige o login cadastrado na config
 * global, e `indisponivel` é o caso em que resta digitar o domínio à mão.
 */
export function usePlausibleSites(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["plausible-sites"],
    queryFn: () =>
      apiClient<{
        disponivel: boolean;
        sites: Array<{ domain: string }>;
        fonte: "sites-api" | "sessao" | "indisponivel";
      }>("/api/plausible/sites"),
    enabled,
    staleTime: STALE,
  });
}

// ---- Dashboard completo (mesmo recorte da tela do Plausible) ----

export type PlausiblePeriodo = "day" | "7d" | "30d" | "month" | "6mo" | "12mo";

export interface LinhaBreakdown {
  nome: string;
  visitors: number;
  /** Fração do total do bloco (0..1) — vira a barra de proporção. */
  share: number;
}

export interface BlocoBreakdown {
  chave: string;
  rows: LinhaBreakdown[];
}

export interface PlausibleDashboardCompleto {
  siteId: string;
  periodo: PlausiblePeriodo;
  pageFilter: string | null;
  /** Visitantes nos últimos 5 minutos. */
  agora: number;
  totals: {
    visitors: number;
    visits: number;
    pageviews: number;
    viewsPerVisit: number;
    bounceRate: number;
    visitDuration: number;
  };
  serie: Array<{ label: string; visitors: number; pageviews: number }>;
  fontes: BlocoBreakdown[];
  paginas: BlocoBreakdown[];
  locais: BlocoBreakdown[];
  dispositivos: BlocoBreakdown[];
}

export function usePlausibleDashboard(
  projectId: string,
  opts: { periodo: PlausiblePeriodo; pageFilter?: string | null; enabled: boolean },
) {
  const apiClient = useApiClient();
  const filtro = opts.pageFilter?.trim() || "";
  return useQuery({
    queryKey: ["plausible-dashboard", projectId, opts.periodo, filtro],
    queryFn: () =>
      apiClient<PlausibleDashboardCompleto>(
        `/api/projects/${projectId}/plausible/dashboard?periodo=${opts.periodo}` +
          (filtro ? `&pageFilter=${encodeURIComponent(filtro)}` : ""),
      ),
    enabled: opts.enabled,
    // Curto de propósito: a tela mostra "visitantes agora", e um número de
    // tempo real com cinco minutos de cache não é tempo real.
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ---- Site do projeto ----

export function usePlausibleSite(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["plausible-site", projectId],
    queryFn: () => apiClient<PlausibleProjectSite>(`/api/projects/${projectId}/plausible/site`),
    staleTime: STALE,
  });
}

export function useSetPlausibleSite(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) =>
      apiClient<{ siteId: string; detalhe: string }>(`/api/projects/${projectId}/plausible/site`, {
        method: "PUT",
        body: JSON.stringify({ siteId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plausible-site", projectId] });
      // O dashboard da etapa vem da mesma rota do GA4 — trocar a fonte tem de
      // invalidar aquele cache, senão a tela segue mostrando o número antigo.
      qc.invalidateQueries({ queryKey: ["ga4-stage-analytics", projectId] });
      qc.invalidateQueries({ queryKey: ["ga4-connection", projectId] });
    },
  });
}

export function useDeletePlausibleSite(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ siteId: null }>(`/api/projects/${projectId}/plausible/site`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plausible-site", projectId] });
      qc.invalidateQueries({ queryKey: ["ga4-stage-analytics", projectId] });
      qc.invalidateQueries({ queryKey: ["ga4-connection", projectId] });
    },
  });
}
