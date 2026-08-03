/**
 * Spy de Conteúdo — tipos compartilhados do scan de perfil do Instagram.
 *
 * Portado de C:\Users\Lucas\Documents\CODES\insta-scrapper (CLI em JS). O que
 * era `output/<user>.raw.json` + HTML agora é JSONB no banco: o front renderiza
 * em React, e o JSON permite comparar perfis depois sem re-scrapar (cada scan
 * custa 2 runs de Apify + ~70k tokens).
 */

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

export type PostFormato = "Reel" | "Carrossel" | "Imagem";

export interface ScanPost {
  id: string;
  shortCode: string;
  url: string;
  type: string | null;
  productType: string | null;
  formato: PostFormato;
  caption: string;
  hashtags: string[];
  mentions: string[];
  /** null = contagem oculta pelo Instagram (vem -1 na API), não zero. */
  likesCount: number | null;
  commentsCount: number | null;
  videoViewCount: number | null;
  videoDuration: number | null;
  timestamp: string | null;
  displayUrl: string | null;
  isSponsored: boolean;
  childrenCount: number | null;
  musicTitle: string | null;
}

export interface ScrapeResult {
  scrapedAt: string;
  username: string;
  profile: ScanProfile;
  posts: ScanPost[];
  runs: { details: string; posts: string };
}

// ---- Métricas (todas calculadas em código — nada vem do LLM) ----

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
  topPosts: (ScanPost & { engajamento: number })[];
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

// ---- Análise qualitativa (Claude) ----

export interface ScanAnalysis {
  resumo_executivo: string;
  nicho: { principal: string; subnichos: string[]; justificativa: string };
  publico_alvo: { descricao: string; dores: string[]; desejos: string[] };
  posicionamento: string;
  pilares_conteudo: {
    nome: string;
    descricao: string;
    peso_estimado: number;
    exemplos: string[];
  }[];
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

export interface ScanUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}
