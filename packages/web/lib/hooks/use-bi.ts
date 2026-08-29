"use client";

/**
 * Os dados do construtor de BI.
 *
 * Duas coisas são estáticas do lado do servidor (catálogo e presets) e por isso
 * têm `staleTime` longo. O resto gira em torno de um dashboard: o documento
 * (definição e geometria) e os resultados (recalculados, nunca salvos).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { CampoDoCatalogo, Dashboard, ResultadoDaQuery, Widget } from "@/lib/bi/tipos";

export interface PresetNaGaleria {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  tipo: Widget["tipo"];
  entity: string;
  metricas: string[];
  dimensoes: string[];
  tamanho: { w: number; h: number };
  /** Motivo pelo qual ainda não dá para inserir. `null` = disponível. */
  bloqueado: string | null;
}

/** Resultado por widget: ou linhas, ou o motivo de aquele card não ter carregado. */
export type ResultadoDoWidget = ResultadoDaQuery | { erro: string; campo?: string };

export function ehErro(r: ResultadoDoWidget | undefined): r is { erro: string; campo?: string } {
  return Boolean(r && "erro" in r);
}

const UM_DIA = 24 * 60 * 60 * 1000;

export function useCatalogoDeBi() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["bi", "catalogo"],
    queryFn: () =>
      apiClient<{ metrics: CampoDoCatalogo[]; dimensions: CampoDoCatalogo[] }>("/api/bi/catalogo"),
    // Declarado em código no servidor: só muda em deploy.
    staleTime: UM_DIA,
  });
}

export function usePresetsDeBi() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["bi", "presets"],
    queryFn: () => apiClient<{ presets: PresetNaGaleria[] }>("/api/bi/presets"),
    staleTime: UM_DIA,
  });
}

export function useDashboards(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["bi", "dashboards", projectId],
    queryFn: () =>
      apiClient<{ dashboards: Dashboard[] }>(`/api/projects/${projectId}/bi/dashboards`),
    enabled: Boolean(projectId),
  });
}

export function useDashboard(projectId: string | null, id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["bi", "dashboard", projectId, id],
    queryFn: () => apiClient<Dashboard>(`/api/projects/${projectId}/bi/dashboards/${id}`),
    enabled: Boolean(projectId && id),
  });
}

/**
 * Os resultados do dashboard inteiro, num request só.
 *
 * `POST` porque a 45.6 vai mandar o recorte no corpo — e porque resultado não é
 * coisa de cache de navegador: ele muda quando o dado muda, não quando a URL
 * muda.
 */
export function useResultados(projectId: string | null, id: string | null, versao: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["bi", "resultados", projectId, id, versao],
    queryFn: () =>
      apiClient<{ resultados: Record<string, ResultadoDoWidget> }>(
        `/api/projects/${projectId}/bi/dashboards/${id}/execute`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    enabled: Boolean(projectId && id),
    staleTime: 60 * 1000,
  });
}

export function useCriarDashboard(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nome: string) =>
      apiClient<Dashboard>(`/api/projects/${projectId}/bi/dashboards`, {
        method: "POST",
        body: JSON.stringify({ nome }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi", "dashboards", projectId] }),
  });
}

/** O patch parcial. Mandar `{nome}` não pode encostar em `widgets`. */
export function useSalvarDashboard(projectId: string | null, id: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Dashboard, "nome" | "widgets" | "dateRange" | "slicers">>) =>
      apiClient<Dashboard>(`/api/projects/${projectId}/bi/dashboards/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: (dash) => {
      qc.setQueryData(["bi", "dashboard", projectId, id], dash);
      qc.invalidateQueries({ queryKey: ["bi", "dashboards", projectId] });
    },
  });
}

export function useDuplicarDashboard(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Dashboard>(`/api/projects/${projectId}/bi/dashboards/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi", "dashboards", projectId] }),
  });
}

export function useApagarDashboard(projectId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: true }>(`/api/projects/${projectId}/bi/dashboards/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bi", "dashboards", projectId] }),
  });
}

/** Insere um preset. A resposta traz o widget E o resultado já calculado. */
export function useInserirWidget(projectId: string | null, id: string | null) {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (
      entrada:
        | { presetId: string; geometria?: { x: number; y: number } }
        // O editor manda o widget inteiro; o id é do servidor.
        | { widget: Omit<Widget, "id"> },
    ) =>
      apiClient<{ widget: Widget; resultado: ResultadoDoWidget }>(
        `/api/projects/${projectId}/bi/dashboards/${id}/widgets`,
        { method: "POST", body: JSON.stringify(entrada) },
      ),
  });
}

export function useRemoverWidget(projectId: string | null, id: string | null) {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (widgetId: string) =>
      apiClient<{ ok: true }>(
        `/api/projects/${projectId}/bi/dashboards/${id}/widgets/${widgetId}`,
        { method: "DELETE" },
      ),
  });
}
