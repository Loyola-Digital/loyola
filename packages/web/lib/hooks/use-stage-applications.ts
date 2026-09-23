"use client";

/**
 * Aplicações por dia — uma série por PÁGINA (Story 43.6).
 *
 * Story 18.84: a página de cada aplicação é o LINK DO ANÚNCIO de onde ela veio
 * (a página de vendas): `utm_content → ad_id → URL`. Aplicação sem anúncio de
 * origem (orgânica, link na bio) vai para "Sem link resolvido", com a causa.
 * Com a API anterior à 18.84, a página era a letra da aba ou do `utm_term`
 * (43.6) — os tipos abaixo aceitam as duas respostas.
 *
 * As séries vêm alinhadas pelo dia relativo (não pela data) porque a pergunta é
 * "estamos melhor que o lançamento passado NESTA altura?" — comparar por data
 * não responde isso, já que dois lançamentos começam em dias diferentes. A
 * comparação é AGREGADA (total vs total), não casada forma a forma.
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

/** Story 18.84 — por que as aplicações da série "Sem link resolvido" estão ali. */
export interface SemLinkDaAplicacao {
  /** Orgânica, link na bio, texto, vazia, macro não resolvida. */
  semAnuncio: number;
  foraDoCache: number;
  cacheDesatualizado: number;
  semLinkNaMeta: number;
}

export interface ApplicationForm {
  /** chave estável de série. */
  sheetId: string;
  /**
   * Nome mostrado no tooltip/legenda: a URL normalizada (18.84), "Sem link
   * resolvido", ou — API anterior — "PAGINA B"/label da planilha.
   */
  label: string;
  total: number;
  points: ApplicationDay[];
  /** Story 18.84: `href` da série. Ausente/`null` = série sem link. */
  url?: string | null;
  /** Story 18.84: só na série "Sem link resolvido". */
  semLink?: SemLinkDaAplicacao;
}

/** Story 43.1 — aba que não entrou no gráfico, e o motivo (AC4). */
export interface AvisoForma {
  aba: string;
  motivo: string;
}

export interface StageApplications {
  funnelName: string;
  /** nome do lançamento de comparação (compareFunnelId). null = não configurado. */
  compareFunnelName: string | null;
  /** true = nenhuma planilha do tipo "applications" vinculada. */
  semPlanilha: boolean;
  /**
   * Story 43.1 — abas que ficaram FORA do gráfico, com o motivo. Antes viravam
   * série zerada, e zerado se lê como "essa página não vendeu" em vez de
   * "não conseguimos ler essa página".
   */
  avisos: AvisoForma[];
  /**
   * Story 43.1 — LPs com investimento recente na Meta que não têm forma no
   * gráfico. Vazio em funis que nomeiam as formas por formulário, onde a
   * pergunta "cadê a LPA" não faz sentido.
   */
  lpsOrfas: string[];
  /**
   * Story 43.6 — aplicações que entraram no gráfico sem página conhecida.
   *
   * Anda junto com `lpsOrfas`: enquanto for > 0, "a LPD não teve aplicação" é
   * afirmação com ressalva, porque alguma dessas linhas pode ser dela. A tela
   * precisa poder dizer isso em vez de apresentar a lista como certeza.
   */
  aplicacoesSemPagina: number;
  /**
   * Story 43.6 — alguma série de página nasceu da quebra da aba-base?
   *
   * É o gatilho da explicação "cada linha é uma página" na tela. Separado de
   * `aplicacoesSemPagina` de propósito: a quebra acontece com ou sem órfãs, e
   * confundir os dois deixava a tela calada justamente quando todos os números
   * mudavam (QA-43.6-01).
   */
  paginasVieramDoUtmTerm: boolean;
  /**
   * Story 18.84 — as séries são o link do anúncio de origem. Ausente na API
   * anterior (a tela segue os textos da 43.6).
   */
  paginasPeloLinkDoAnuncio?: boolean;
  /**
   * Uma série por PÁGINA (Story 43.6) — não mais por planilha.
   *
   * A aba-base é o formulário genérico onde caem todas as páginas sem aba
   * própria; quem decide a página é o `utm_term` da linha. Aba com sufixo
   * (`…-PaginaB`) continua produzindo uma série só.
   */
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
 * Faixas por FORMULÁRIO (planilha) — não por página: depois da Story 18.84 o
 * gráfico acima agrupa pelo link do anúncio, e esta seção continua agrupando
 * por planilha (PO-07, fora do escopo). Cada forma quebrada por faixa de
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

// ============================================================
// Story 43.7 — a lista das aplicações, linha a linha.
// ============================================================

export interface AplicacaoLinha {
  /** aaaa-mm-dd. A lista vem ordenada do mais recente para o mais antigo. */
  data: string;
  nome: string;
  email: string;
  /** Canal declarado: `meta`, `ig`, `whatsapp`, `yt`, `mautic`… — é o exibido. */
  utmSource: string;
  /**
   * Nome do anúncio. NÃO é exibido como coluna (passa de 100 caracteres), mas
   * vai como tooltip da LP — é dele que a página é extraída, e esconder a
   * evidência tornaria a coluna LP inauditável.
   */
  utmTerm: string;
  /**
   * A página: a URL normalizada do anúncio de origem (18.84), `null` quando
   * sem link. API anterior: "PAGINA C" ou `null`.
   */
  lp: string | null;
  /** Story 18.84: `href` da página. */
  lpUrl?: string | null;
  /** Story 18.84: por que não há página. `null` quando há. */
  lpCausa?: "sem_anuncio" | "fora_do_cache" | "cache_desatualizado" | "sem_link_na_meta" | null;
  /** Story 18.84: o anúncio de origem (`utm_content`), a evidência da página. */
  adId?: string;
  /** Label da aba de origem — desempata quando duas páginas têm o mesmo nome. */
  aba: string;
}

export interface StageApplicationsList {
  semPlanilha: boolean;
  aplicacoes: AplicacaoLinha[];
  avisos: AvisoForma[];
}

/**
 * Lista completa, sem paginação de servidor.
 *
 * São dezenas de linhas por lançamento (70 no maior funil de produção hoje);
 * paginar no servidor obrigaria um round-trip ao Google a cada troca de página,
 * para dado que já está todo em memória. A tabela pagina o que recebe.
 */
export function useStageApplicationsList(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-applications-list", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageApplicationsList>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/applications-list`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 60 * 1000,
  });
}
