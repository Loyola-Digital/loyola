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
    mutationFn: (data: { baseUrl: string; apiKey?: string }) =>
      apiClient<{ configured: boolean; baseUrl: string; aviso: string | null }>("/api/plausible/config", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plausible-config"] });
      qc.invalidateQueries({ queryKey: ["plausible-site"] });
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

/** Sites da instância. `disponivel: false` = digitar o domínio à mão. */
export function usePlausibleSites(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["plausible-sites"],
    queryFn: () => apiClient<{ disponivel: boolean; sites: Array<{ domain: string }> }>("/api/plausible/sites"),
    enabled,
    staleTime: STALE,
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
