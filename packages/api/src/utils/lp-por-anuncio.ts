/**
 * Story 18.83 — o material da tabela "Desempenho de Testes de LPs" POR ANÚNCIO.
 *
 * A rota `creative-performance` já busca a Meta ao vivo no nível anúncio (é o
 * que alimenta a tabela de Criativos). Este módulo transforma essas linhas no
 * insumo da tabela de LPs: uma entrada por `ad_id`, com a URL de destino dele,
 * e mais nada agrupado. O agrupamento por URL acontece no web, porque é lá que
 * os leads são contados (planilha lida no navegador) e é lá que a correção
 * manual por campanha (AC5) é aplicada — os dois precisam do MESMO mapa
 * `ad_id → URL` (PO-15b). Agrupar aqui obrigaria a manter dois mapas.
 *
 * ## A invariante (AC3)
 *
 *   soma(anúncios) + soma(campanhasSemDadoPorAnuncio)
 *     === soma(campanhas)                  (gasto, impressões, cliques, LP View, pixel)
 *
 * sempre que o nível anúncio não excede o nível campanha. A segunda parcela é a
 * 5ª causa de "Sem link resolvido": GASTO que a campanha reportou e nenhum
 * anúncio explica. Campanha sem nenhuma linha de anúncio entra INTEIRA ali (o
 * caso `dg-pg02` medido no banco); campanha com anúncios entra só se sobrar
 * GASTO sem anúncio — sem isso, o Total da tabela cairia calado quando a Meta
 * devolve o nível anúncio incompleto.
 *
 * Diferença só de contagem (1 clique, 3 impressões) sem gasto NÃO abre linha:
 * medido no `bbe-pr2` (banco, 90 dias), uma campanha nova tinha 1 clique a mais
 * no nível campanha e nada de gasto — viraria uma linha "Sem link resolvido" de
 * R$ 0,00, ruído com cara de achado. Nesse caso a soma de cliques da tabela é a
 * dos anúncios (a diferença fica registrada no Dev Agent Record da 18.83).
 *
 * Pura e sem I/O, para o teste provar a invariante sem Meta nem banco.
 */

import type { CausaSemLink, LinkDoAnuncio } from "../services/lp-do-anuncio.js";
import { normalizeNumericId } from "./utm-value.js";
import { parseValorPlanilha } from "@loyola-x/shared";

export type Temperatura = "hot" | "cold" | "unknown";

/**
 * Hot/Cold continua pelo nome da CAMPANHA (AC7, 7.5) — mesma regra que a rota
 * já usava (`lpAndTempFromCampaignName`).
 */
export function temperaturaDaCampanha(campaignName: string | null | undefined): Temperatura {
  const cn = (campaignName ?? "").toLowerCase();
  return cn.includes("hot") ? "hot" : cn.includes("cold") ? "cold" : "unknown";
}

type Acao = { action_type: string; value: string };

function acao(actions: Acao[] | undefined, tipo: string): number {
  const a = actions?.find((x) => x.action_type === tipo);
  return a ? parseValorPlanilha(a.value) : 0;
}

function num(v: string | undefined): number {
  const n = parseFloat(v || "0");
  return Number.isFinite(n) ? n : 0;
}

/** O mínimo das linhas `level=ad` da Meta que a agregação lê. */
export interface LinhaDeAnuncio {
  ad_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Acao[];
}

/** O mínimo das linhas `level=campaign` da Meta. */
export interface LinhaDeCampanha {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Acao[];
}

interface Metricas {
  spend: number;
  impressions: number;
  /** Cliques no link — `inline_link_clicks`, a MESMA métrica do nível campanha. */
  clicks: number;
  landingPageViews: number;
  /** `offsite_conversion.fb_pixel_lead` — lead da LP sem formulário. */
  pixelLeads: number;
}

function metricasDe(l: LinhaDeAnuncio | LinhaDeCampanha): Metricas {
  return {
    spend: num(l.spend),
    impressions: num(l.impressions),
    clicks: num(l.inline_link_clicks),
    landingPageViews: acao(l.actions, "landing_page_view"),
    pixelLeads: acao(l.actions, "offsite_conversion.fb_pixel_lead"),
  };
}

export interface AnuncioDaLp extends Metricas {
  adId: string;
  campaignId: string;
  campaignName: string;
  temperature: Temperatura;
  /** URL crua do criativo — o `href` da linha. */
  url: string | null;
  /** Identidade da página (`normalizeLpUrl`). `null` = "Sem link resolvido". */
  lpKey: string | null;
  causa: CausaSemLink | null;
  /** Story 18.50: vendas dedupadas (tx/e-mail) atribuídas pelo `co=`. */
  vendas: number;
  faturamento: number;
  /** Story 18.60: só quando a venda é atribuída pelo `co=` (`sale_content`). */
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueUnico?: number;
  revenueTotal?: number;
}

/** 5ª causa: o que a campanha reportou e nenhum anúncio explica. */
export interface CampanhaSemDadoPorAnuncio extends Metricas {
  campaignId: string;
  campaignName: string;
  temperature: Temperatura;
  /** `true` = a campanha não tem NENHUMA linha de anúncio (caso `dg-pg02`). */
  inteira: boolean;
}

export interface LpPorAnuncio {
  anuncios: AnuncioDaLp[];
  campanhasSemDadoPorAnuncio: CampanhaSemDadoPorAnuncio[];
}

export interface VendasPorAnuncio {
  vendas: Map<string, { vendas: number; faturamento: number }>;
  /** `null` = a etapa não atribui venda pelo `co=`; os campos ficam fora. */
  ingressos: {
    ingressosUnicosByAdId: Map<string, number>;
    ingressosTotaisByAdId: Map<string, number>;
    revenueUnicoByAdId: Map<string, number>;
    revenueTotalByAdId: Map<string, number>;
  } | null;
}

/**
 * Tolerância da diferença campanha × anúncio. Meio centavo no gasto e meia
 * unidade nas contagens: abaixo disso é arredondamento da Meta, e uma linha
 * "Sem link resolvido" de R$ 0,00 seria ruído com cara de achado.
 */
const TOLERANCIA: Metricas = {
  spend: 0.005,
  impressions: 0.5,
  clicks: 0.5,
  landingPageViews: 0.5,
  pixelLeads: 0.5,
};

const CAMPOS = ["spend", "impressions", "clicks", "landingPageViews", "pixelLeads"] as const;

export function montarLpPorAnuncio(args: {
  anuncios: LinhaDeAnuncio[];
  campanhas: LinhaDeCampanha[];
  /** Campanhas da etapa — a mesma lista que filtrou os dois fetches. */
  campanhasPermitidas: string[];
  links: Map<string, LinkDoAnuncio>;
  vendas: VendasPorAnuncio;
}): LpPorAnuncio {
  const permitidas = new Set(args.campanhasPermitidas);
  const porAnuncio = new Map<string, AnuncioDaLp>();
  const somaPorCampanha = new Map<string, Metricas>();

  for (const linha of args.anuncios) {
    const adId = normalizeNumericId(linha.ad_id ?? "");
    const campaignId = linha.campaign_id ?? "";
    if (!adId) continue;
    if (permitidas.size > 0 && campaignId && !permitidas.has(campaignId)) continue;
    const m = metricasDe(linha);

    const soma = somaPorCampanha.get(campaignId) ?? {
      spend: 0, impressions: 0, clicks: 0, landingPageViews: 0, pixelLeads: 0,
    };
    for (const c of CAMPOS) soma[c] += m[c];
    somaPorCampanha.set(campaignId, soma);

    const existente = porAnuncio.get(adId);
    if (existente) {
      for (const c of CAMPOS) existente[c] += m[c];
      continue;
    }
    const link = args.links.get(adId) ?? { url: null, chave: null, causa: "fora_do_cache" as const };
    const venda = args.vendas.vendas.get(adId);
    const ing = args.vendas.ingressos;
    porAnuncio.set(adId, {
      adId,
      campaignId,
      campaignName: linha.campaign_name ?? "",
      temperature: temperaturaDaCampanha(linha.campaign_name),
      url: link.chave ? link.url : null,
      lpKey: link.chave,
      causa: link.chave ? null : link.causa,
      ...m,
      vendas: venda?.vendas ?? 0,
      faturamento: venda?.faturamento ?? 0,
      ...(ing
        ? {
            ingressosUnicos: ing.ingressosUnicosByAdId.get(adId) ?? 0,
            ingressosTotais: ing.ingressosTotaisByAdId.get(adId) ?? 0,
            revenueUnico: ing.revenueUnicoByAdId.get(adId) ?? 0,
            revenueTotal: ing.revenueTotalByAdId.get(adId) ?? 0,
          }
        : {}),
    });
  }

  const campanhasSemDadoPorAnuncio: CampanhaSemDadoPorAnuncio[] = [];
  // A mesma campanha pode vir em mais de uma linha (paginação); soma antes.
  const porCampanha = new Map<string, { nome: string; m: Metricas }>();
  for (const c of args.campanhas) {
    if (permitidas.size > 0 && !permitidas.has(c.campaign_id)) continue;
    const m = metricasDe(c);
    const atual = porCampanha.get(c.campaign_id);
    if (atual) for (const k of CAMPOS) atual.m[k] += m[k];
    else porCampanha.set(c.campaign_id, { nome: c.campaign_name ?? "", m });
  }
  for (const [campaignId, { nome, m }] of porCampanha) {
    const dosAnuncios = somaPorCampanha.get(campaignId);
    const diferenca = { ...m };
    for (const k of CAMPOS) {
      const d = m[k] - (dosAnuncios?.[k] ?? 0);
      // Nível anúncio ACIMA do nível campanha não vira número negativo: não há
      // como tirar de uma linha o que a Meta mediu a mais noutra.
      diferenca[k] = d > TOLERANCIA[k] ? d : 0;
    }
    // Só abre linha por GASTO sem anúncio (ou campanha sem anúncio nenhum que
    // tenha alguma métrica) — ver o cabeçalho.
    if (dosAnuncios ? diferenca.spend === 0 : CAMPOS.every((k) => diferenca[k] === 0)) continue;
    campanhasSemDadoPorAnuncio.push({
      campaignId,
      campaignName: nome,
      temperature: temperaturaDaCampanha(nome),
      inteira: !dosAnuncios,
      ...diferenca,
    });
  }

  return { anuncios: [...porAnuncio.values()], campanhasSemDadoPorAnuncio };
}
