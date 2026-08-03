"use client";

/**
 * Spy de Conteúdo — hooks da área Global.
 *
 * O scan roda em background no servidor (~5min), então a lista faz polling
 * enquanto houver algo `queued`/`running` e para sozinha quando tudo terminou —
 * sem polling eterno numa aba esquecida aberta.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ScanStatus = "queued" | "running" | "done" | "failed";

export interface ScanProfile {
  username: string;
  fullName: string | null;
  biography: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  verified: boolean;
  isBusinessAccount: boolean;
  businessCategoryName: string | null;
  externalUrl: string | null;
  profilePicUrl: string | null;
  url: string;
}

export interface ScanListItem {
  id: string;
  username: string;
  status: ScanStatus;
  params: { limit: number; since: string | null; tzOffset: number };
  profile: ScanProfile | null;
  usage: { model: string; inputTokens: number; outputTokens: number } | null;
  error: string | null;
  requestedBy: string;
  requestedByName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ScanMetrics {
  tzOffset: number;
  janela: { primeiro: string | null; ultimo: string | null; dias: number };
  totais: {
    analisados: number;
    reels: number;
    carrosseis: number;
    imagens: number;
    patrocinados: number;
    comEngajamentoVisivel: number;
  };
  frequencia: { porSemana: number; porMes: number; intervaloMedioDias: number | null };
  engajamento: {
    mediaCurtidas: number;
    medianaCurtidas: number;
    mediaComentarios: number;
    medianaComentarios: number;
    media: number;
    mediana: number;
    taxaPorSeguidor: number | null;
    razaoComentarioCurtida: number | null;
  };
  reels: {
    total: number;
    mediaViews: number | null;
    medianaViews: number | null;
    duracaoMediaSeg: number | null;
    taxaEngajamentoPorView: number | null;
    alcanceVsSeguidores: number | null;
  };
  formatos: { formato: string; posts: number; share: number; engajamentoMedio: number }[];
  topPosts: {
    url: string;
    shortCode: string;
    formato: string;
    caption: string;
    likesCount: number | null;
    commentsCount: number | null;
    videoViewCount: number | null;
    timestamp: string | null;
    engajamento: number;
  }[];
  hashtags: { tag: string; usos: number; engajamentoMedio: number }[];
  porMes: { mes: string; posts: number; engajamentoMedio: number }[];
  porDiaSemana: { dia: string; curto: string; posts: number; engajamentoMedio: number }[];
  porFaixaHorario: { faixa: string; posts: number; engajamentoMedio: number }[];
  legenda: {
    mediaCaracteres: number;
    medianaCaracteres: number;
    buckets: { faixa: string; posts: number; engajamentoMedio: number }[];
  };
}

export interface ScanAnalysis {
  resumo_executivo: string;
  nicho: { principal: string; subnichos: string[]; justificativa: string };
  publico_alvo: { descricao: string; dores: string[]; desejos: string[] };
  posicionamento: string;
  pilares_conteudo: { nome: string; descricao: string; peso_estimado: number; exemplos: string[] }[];
  estrategia: {
    formato_dominante: string;
    padroes_de_gancho: string[];
    estrutura_narrativa: string;
    cta_predominante: string;
    tom_de_voz: string;
    uso_de_hashtags: string;
    cadencia: string;
  };
  insights_conteudo: {
    post_url: string;
    formato: string;
    tema: string;
    insight: string;
    gancho: string;
    por_que_performou: string;
  }[];
  teses_centrais: string[];
  pontos_fortes: string[];
  oportunidades: string[];
  playbook: { titulo: string; como_aplicar: string }[];
}

export interface ScanDetail extends ScanListItem {
  metrics: ScanMetrics | null;
  analysis: ScanAnalysis | null;
}

const BASE = "/api/instagram-scans";

export function useInstagramScans() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-scans"],
    queryFn: () => apiClient<{ scans: ScanListItem[] }>(BASE),
    // Enquanto houver scan em andamento, atualiza a cada 5s; depois para.
    refetchInterval: (query) => {
      const scans = query.state.data?.scans ?? [];
      return scans.some((s) => s.status === "queued" || s.status === "running") ? 5000 : false;
    },
  });
}

export function useInstagramScan(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-scan", id],
    queryFn: () => apiClient<ScanDetail>(`${BASE}/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "queued" || s === "running" ? 5000 : false;
    },
  });
}

export interface CreateScanResult {
  id: string;
  username: string;
  /** true = devolveu um scan recente em vez de criar outro (economia de crédito). */
  reused: boolean;
  message?: string;
  queuePosition?: number;
}

export function useCreateInstagramScan() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      username: string;
      limit?: number;
      since?: string;
      tzOffset?: number;
      force?: boolean;
    }) =>
      apiClient<CreateScanResult>(BASE, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instagram-scans"] }),
  });
}

export function useDeleteInstagramScan() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient<{ ok: boolean }>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instagram-scans"] }),
  });
}
