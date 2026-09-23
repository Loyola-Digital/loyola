// ============================================================
// Story 18.83 — "Desempenho de Testes de LPs" do lançamento, pela URL do anúncio.
//
// A tabela identificava a página pela letra `lpX` no nome da CAMPANHA. No
// `bbe-pr2` isso errava de página: 24 anúncios da leva03 rodavam em campanhas
// `…videos-lpa` e levavam à captura-d — 22,2 % do "LPA" era gasto de outra
// página, e 16 dos 69 leads "LPA" vinham de anúncios que levam à D.
//
// Agora a linha é a URL de destino do anúncio (padrão do perpétuo, 29.40). A
// API manda o material POR ANÚNCIO (`lpPorAnuncio`); o agrupamento por URL
// acontece aqui porque os leads são contados no navegador e a correção manual
// por campanha também é aplicada aqui — e os dois precisam do MESMO mapa
// `ad_id → URL` (PO-15b). Gasto, lead e venda passam todos por `linkDoAnuncio`.
//
// A invariante (AC3):
//
//   soma(linhas, INCLUINDO "Sem link resolvido")
//     === soma(anúncios) + soma(campanhas sem dado por anúncio)
//
// em investimento, impressões, cliques no link, LP View e pixel — trocar a
// chave só redistribui. Leads NÃO são invariantes por construção (PO-03).
// ============================================================

import { normalizeLpUrl } from "@loyola-x/shared/src/lp-url";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import { leadsDaLp, type FonteDeLeads } from "@/lib/utils/leads-da-lp";
import type { LeadsPorTemperatura } from "@/lib/utils/contagem-de-leads";

/** Chave da linha sem URL. `normalizeLpUrl` nunca devolve isto (sem host). */
export const CHAVE_SEM_LINK = "—";
export const ROTULO_SEM_LINK = "Sem link resolvido";

export type Temperatura = "hot" | "cold" | "unknown";
export type Publico = "todos" | "hot" | "cold";
export type CausaSemLink = "fora_do_cache" | "cache_desatualizado" | "sem_link_na_meta";

/** Uma entrada por anúncio — espelho de `utils/lp-por-anuncio.ts` da API. */
export interface AnuncioDaLp {
  adId: string;
  campaignId: string;
  campaignName: string;
  temperature: Temperatura;
  url: string | null;
  lpKey: string | null;
  /** Ausente = API não informou a causa → "causa não determinada" (gate QA-11). */
  causa?: CausaSemLink | null;
  /** Gasto CRU, sem imposto — o imposto entra uma vez só, na linha. */
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  pixelLeads: number;
  vendas: number;
  faturamento: number;
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueUnico?: number;
  revenueTotal?: number;
}

/** 5ª causa: o que a campanha reportou e nenhum anúncio explica. */
export interface CampanhaSemDadoPorAnuncio {
  campaignId: string;
  campaignName: string;
  temperature: Temperatura;
  inteira: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  pixelLeads: number;
}

export interface LpPorAnuncio {
  anuncios: AnuncioDaLp[];
  campanhasSemDadoPorAnuncio: CampanhaSemDadoPorAnuncio[];
}

/** Por que a linha "Sem link resolvido" existe — o tooltip (AC5). */
export interface SemLinkDaLinha {
  foraDoCache: number;
  cacheDesatualizado: number;
  semLinkNaMeta: number;
  causaIndeterminada: number;
  /** Campanhas com gasto sem dado por anúncio (5ª causa). */
  semDadoPorAnuncio: number;
  /** Campanhas com gasto nesta linha — a correção manual escolhe uma (AC5). */
  campanhas: { id: string; nome: string; investimento: number }[];
}

export interface LpRow {
  /** Rótulo exibido: a URL normalizada, "Sem link resolvido" ou "LPA" (API antiga). */
  lpName: string;
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  leads: number;
  /** `pixel` = LP sem formulário; os leads vêm do pixel da Meta. */
  leadsFonte?: FonteDeLeads;
  vendas?: number;
  faturamento?: number;
  // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP (Captação Paga)
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueUnico?: number;
  revenueTotal?: number;
  /**
   * Story 18.83: presente = linha de URL (API nova). É a identidade da linha e
   * a chave do card do mini-funil. `CHAVE_SEM_LINK` na linha sem URL.
   */
  lpKey?: string;
  /** `href` da linha (URL crua do criativo ou da correção). */
  url?: string | null;
  /** Só na linha "Sem link resolvido". */
  semLink?: SemLinkDaLinha;
  /** Campanhas cuja correção manual trouxe gasto para esta linha (AC5 — remover). */
  correcoes?: { campaignId: string; campaignName: string }[];
}

/** O destino de um anúncio: a URL dele, a da correção, ou nenhuma. */
export interface LinkDoAnuncio {
  chave: string | null;
  url: string | null;
  corrigido: boolean;
}

/**
 * AC5 (PO-15b) — O mapa `ad_id → URL`. Gasto, lead e venda passam por aqui, e
 * é isso que faz a correção manual levar gasto E lead para a mesma linha.
 *
 * A correção vale SÓ para o que está sem link: anúncio com URL resolvida nunca
 * muda por causa dela.
 */
export function linkDoAnuncio(
  anuncio: { lpKey: string | null; url: string | null; campaignId: string },
  correcoes: Record<string, string> | null | undefined,
): LinkDoAnuncio {
  if (anuncio.lpKey) return { chave: anuncio.lpKey, url: anuncio.url, corrigido: false };
  const urlCorrigida = correcoes?.[anuncio.campaignId];
  const chave = normalizeLpUrl(urlCorrigida);
  // O `href` só sai com esquema http(s): o PUT já exige, mas um valor sem
  // esquema viraria link RELATIVO ao painel.
  if (chave) {
    const url = urlCorrigida && /^https?:\/\//i.test(urlCorrigida) ? urlCorrigida : `https://${chave}`;
    return { chave, url, corrigido: true };
  }
  return { chave: null, url: null, corrigido: false };
}

function passaNoPublico(t: Temperatura, publico: Publico): boolean {
  return publico === "todos" || t === publico;
}

type Acc = {
  lpKey: string;
  url: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  pixelLeads: number;
  vendas: number;
  faturamento: number;
  ingressosUnicos: number;
  ingressosTotais: number;
  revenueUnico: number;
  revenueTotal: number;
  semLink: SemLinkDaLinha | null;
  campanhas: Map<string, { nome: string; spend: number }>;
  correcoes: Map<string, string>;
};

export function montarLinhasDeLpPorUrl(args: {
  lpPorAnuncio: LpPorAnuncio;
  /** `funnel_stages.lp_campaign_urls` — campaign_id → URL. */
  correcoes: Record<string, string> | null | undefined;
  /** `useCrossReferenceLeads().leadsPagosPorAnuncio`. */
  leadsPorAnuncio: Record<string, LeadsPorTemperatura> | null | undefined;
  publico: Publico;
  /** Data para a regra do imposto (2026+). */
  dataDoImposto: string;
}): LpRow[] {
  const { lpPorAnuncio, correcoes, publico } = args;
  const linhas = new Map<string, Acc>();

  const pegar = (chave: string | null, url: string | null): Acc => {
    const k = chave ?? CHAVE_SEM_LINK;
    let a = linhas.get(k);
    if (!a) {
      a = {
        lpKey: k,
        url: chave ? url : null,
        spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, pixelLeads: 0,
        vendas: 0, faturamento: 0,
        ingressosUnicos: 0, ingressosTotais: 0, revenueUnico: 0, revenueTotal: 0,
        semLink: chave
          ? null
          : {
              foraDoCache: 0, cacheDesatualizado: 0, semLinkNaMeta: 0,
              causaIndeterminada: 0, semDadoPorAnuncio: 0, campanhas: [],
            },
        campanhas: new Map(),
        correcoes: new Map(),
      };
      linhas.set(k, a);
    }
    return a;
  };

  // O mapa `ad_id → linha` de TODOS os anúncios da etapa (qualquer temperatura):
  // o lead entra pela temperatura do TEXTO dele (PO-07), não da campanha.
  const destinoDoAnuncio = new Map<string, LinkDoAnuncio>();

  for (const ad of lpPorAnuncio.anuncios) {
    const destino = linkDoAnuncio(ad, correcoes);
    destinoDoAnuncio.set(ad.adId, destino);
    if (!passaNoPublico(ad.temperature, publico)) continue;

    const a = pegar(destino.chave, destino.url);
    a.spend += ad.spend;
    a.impressions += ad.impressions;
    a.clicks += ad.clicks;
    a.landingPageViews += ad.landingPageViews;
    a.pixelLeads += ad.pixelLeads;
    a.vendas += ad.vendas ?? 0;
    a.faturamento += ad.faturamento ?? 0;
    a.ingressosUnicos += ad.ingressosUnicos ?? 0;
    a.ingressosTotais += ad.ingressosTotais ?? 0;
    a.revenueUnico += ad.revenueUnico ?? 0;
    a.revenueTotal += ad.revenueTotal ?? 0;
    if (destino.corrigido) a.correcoes.set(ad.campaignId, ad.campaignName);

    if (a.semLink) {
      // Ordem de precedência da 29.43 — a API já classificou; ausência de
      // causa (API que não informa) é causa NÃO determinada, nunca "a Meta
      // não tem" (gate QA-11).
      if (ad.causa === "fora_do_cache") a.semLink.foraDoCache += 1;
      else if (ad.causa === "cache_desatualizado") a.semLink.cacheDesatualizado += 1;
      else if (ad.causa === "sem_link_na_meta") a.semLink.semLinkNaMeta += 1;
      else a.semLink.causaIndeterminada += 1;
      const c = a.campanhas.get(ad.campaignId) ?? { nome: ad.campaignName, spend: 0 };
      c.spend += ad.spend;
      a.campanhas.set(ad.campaignId, c);
    }
  }

  // 5ª causa: sem dado por anúncio. Nunca some do Total (AC3); com correção
  // da campanha, vai inteira para a URL informada (PO-15a: só o que é de nível
  // campanha — lead e venda dependem do vínculo anúncio → campanha).
  for (const camp of lpPorAnuncio.campanhasSemDadoPorAnuncio) {
    if (!passaNoPublico(camp.temperature, publico)) continue;
    const destino = linkDoAnuncio({ lpKey: null, url: null, campaignId: camp.campaignId }, correcoes);
    const a = pegar(destino.chave, destino.url);
    a.spend += camp.spend;
    a.impressions += camp.impressions;
    a.clicks += camp.clicks;
    a.landingPageViews += camp.landingPageViews;
    a.pixelLeads += camp.pixelLeads;
    if (destino.corrigido) a.correcoes.set(camp.campaignId, camp.campaignName);
    if (a.semLink) {
      a.semLink.semDadoPorAnuncio += 1;
      const c = a.campanhas.get(camp.campaignId) ?? { nome: camp.campaignName, spend: 0 };
      c.spend += camp.spend;
      a.campanhas.set(camp.campaignId, c);
    }
  }

  // AC4: o lead pago vai para a linha do anúncio dele, pelo MESMO mapa do
  // gasto. Lead de anúncio fora da etapa no período fica fora — o mesmo
  // universo das vendas (PO-05).
  const planilhaPorLinha = new Map<string, LeadsPorTemperatura>();
  for (const [adId, n] of Object.entries(args.leadsPorAnuncio ?? {})) {
    const destino = destinoDoAnuncio.get(adId);
    if (!destino) continue;
    const k = destino.chave ?? CHAVE_SEM_LINK;
    const atual = planilhaPorLinha.get(k) ?? { hot: 0, cold: 0, total: 0 };
    atual.hot += n.hot;
    atual.cold += n.cold;
    atual.total += n.total;
    planilhaPorLinha.set(k, atual);
  }

  const out: LpRow[] = [];
  for (const a of linhas.values()) {
    const semLink = a.lpKey === CHAVE_SEM_LINK;
    const planilha = planilhaPorLinha.get(a.lpKey);
    // "LP sem formulário → pixel" é regra de PÁGINA, avaliada por URL. A linha
    // sem link não é uma página: nela a regra não se aplica, e o pixel não
    // entra — afirmar "sem formulário" de uma página desconhecida seria palpite.
    const { leads, fonte } = semLink
      ? {
          leads: publico === "hot" ? planilha?.hot ?? 0 : publico === "cold" ? planilha?.cold ?? 0 : planilha?.total ?? 0,
          fonte: "planilha" as const,
        }
      : leadsDaLp(planilha, a.pixelLeads, publico);

    out.push({
      lpName: semLink ? ROTULO_SEM_LINK : a.lpKey,
      lpKey: a.lpKey,
      url: a.url,
      // Imposto Meta (12,15 %) UMA vez, sobre a soma crua da linha — linear,
      // então o Total da tabela fecha com o de antes.
      investimento: applyMetaAdsTax(a.spend, args.dataDoImposto),
      cliques: a.clicks,
      impressoes: a.impressions,
      conversoes: a.clicks,
      lpViews: a.landingPageViews,
      leads,
      leadsFonte: fonte,
      vendas: a.vendas,
      faturamento: a.faturamento,
      ingressosUnicos: a.ingressosUnicos,
      ingressosTotais: a.ingressosTotais,
      revenueUnico: a.revenueUnico,
      revenueTotal: a.revenueTotal,
      ...(a.semLink
        ? {
            semLink: {
              ...a.semLink,
              campanhas: [...a.campanhas]
                .map(([id, c]) => ({ id, nome: c.nome, investimento: applyMetaAdsTax(c.spend, args.dataDoImposto) }))
                .sort((x, y) => y.investimento - x.investimento),
            },
          }
        : {}),
      ...(a.correcoes.size > 0
        ? { correcoes: [...a.correcoes].map(([campaignId, campaignName]) => ({ campaignId, campaignName })) }
        : {}),
    });
  }

  // Investimento desc; "Sem link resolvido" sempre no fim (como no perpétuo).
  return out.sort((x, y) => {
    const sx = x.lpKey === CHAVE_SEM_LINK ? 1 : 0;
    const sy = y.lpKey === CHAVE_SEM_LINK ? 1 : 0;
    return sx - sy || y.investimento - x.investimento;
  });
}

/**
 * O texto do tooltip da linha "Sem link resolvido" (AC5): as causas, cada uma
 * com a ação que pede. Pura para o teste — o tooltip é a documentação da linha.
 */
export function descreverSemLink(s: SemLinkDaLinha): string {
  const partes = [
    s.cacheDesatualizado > 0
      ? `${s.cacheDesatualizado} anúncio(s) com cache desatualizado — a auto-cura busca o link em segundo plano`
      : null,
    s.foraDoCache > 0
      ? `${s.foraDoCache} anúncio(s) fora do cache de criativos — a auto-cura busca o link em segundo plano`
      : null,
    s.semLinkNaMeta > 0 ? `${s.semLinkNaMeta} anúncio(s) sem link na Meta` : null,
    s.causaIndeterminada > 0 ? `${s.causaIndeterminada} anúncio(s) com causa não determinada` : null,
    s.semDadoPorAnuncio > 0
      ? `${s.semDadoPorAnuncio} campanha(s) com gasto sem dado por anúncio`
      : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "sem LP identificada";
}

/**
 * A chave com que o card do mini-funil casa com a linha (AC9).
 *
 * URL (contém `.` ou `/`) casa EXATA — o path preserva maiúsculas, e
 * `/Inscricao` ≠ `/inscricao` é a regra do `normalizeLpUrl`. Rótulo da API
 * antiga ("LPA") casa em maiúsculas, como antes.
 */
export function chaveDoCardDaLp(lp: string): string {
  return /[./]/.test(lp) ? lp : lp.toUpperCase();
}

/**
 * Mescla uma correção no mapa — o PUT substitui o mapa inteiro. `""` vai como
 * está: é a remoção (o servidor descarta a chave), e apagá-la devolve o gasto
 * da campanha para "Sem link resolvido".
 */
export function mesclarCorrecao(
  atuais: Record<string, string> | null | undefined,
  campaignId: string,
  url: string,
): Record<string, string> {
  return { ...(atuais ?? {}), [campaignId]: url.trim() };
}
