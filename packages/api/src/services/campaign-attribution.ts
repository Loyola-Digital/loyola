/**
 * Story 44.3 — venda e lead reais, atribuídos a campanha.
 *
 * Nem venda nem lead carregam `campaignId`. O que existe é a cadeia:
 *
 *     venda.utm_content → adId → meta_ad_insights_daily.campaignId
 *
 * O `utm_content` é o **Ad ID**, e `meta_ad_insights_daily` tem `adId` e
 * `campaignId` (índice `idx_meta_ad_insights_campaign`). O nível mais fino
 * disponível é anúncio; campanha é agregação dele.
 *
 * ## A perda é o ponto deste serviço, não um detalhe
 *
 * Venda sem `utm_content` — orgânico, tráfego direto, recuperação, venda manual
 * — não é atribuível a campanha nenhuma. Isso deixa a Conv. Checkout por
 * campanha com **numerador parcial e denominador completo** (o
 * `initiate_checkout` vem do pixel, que não perde nada), subestimando a taxa em
 * medida que varia por campanha.
 *
 * Por isso `coberturaVendas` e `coberturaLeads` são campos de primeira classe:
 * entregar a taxa sem declarar a cobertura seria servir um número que parece
 * medido e não é.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { metaAdInsightsDaily } from "../db/schema.js";
import { classifyRefundStatus, isRevenueBucket } from "./sales-status.js";

/** Uma venda já lida da planilha, reduzida ao que a atribuição precisa. */
export interface VendaParaAtribuir {
  /** `utm_content` da linha — o Ad ID. `null` quando a coluna não veio. */
  utmContent: string | null;
  valorBruto: number;
  /** Status cru da planilha. `null` quando a coluna não está mapeada. */
  status: string | null;
}

/** Um lead já lido da planilha de leads. */
export interface LeadParaAtribuir {
  utmContent: string | null;
  /** Chave de dedup: e-mail normalizado ou telefone. */
  chave: string;
}

export interface AtribuicaoPorCampanha {
  campaignId: string;
  vendasAtribuidas: number;
  receitaAtribuida: number;
  leadsUnicosAtribuidos: number;
}

export interface ResultadoAtribuicao {
  porCampanha: AtribuicaoPorCampanha[];
  /** Totais da ETAPA — denominador da cobertura. Nunca só o atribuído. */
  totalVendas: number;
  totalReceita: number;
  totalLeadsUnicos: number;
  /** atribuído ÷ total da etapa. `null` quando não há total (divisão por zero). */
  coberturaVendas: number | null;
  coberturaLeads: number | null;
  /**
   * `utm_content` que não resolveu para nenhum anúncio conhecido — distinto de
   * "veio vazio". Um id que não resolve é sintoma de cache desatualizado ou de
   * anúncio de outra conta; um vazio é tráfego sem UTM. As duas causas pedem
   * ações diferentes, então não podem virar o mesmo número.
   */
  utmContentNaoResolvido: number;
}

/**
 * Mapa `adId → campaignId` para os ids observados.
 *
 * Busca pelos `adId` que apareceram nas vendas/leads, não pelo período: uma
 * venda de hoje pode vir de um anúncio que rodou semanas atrás, e filtrar por
 * data perderia justamente a atribuição mais antiga.
 */
export async function mapearAdsParaCampanhas(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!adIds.length) return out;

  const rows = await db
    .selectDistinct({ adId: metaAdInsightsDaily.adId, campaignId: metaAdInsightsDaily.campaignId })
    .from(metaAdInsightsDaily)
    .where(
      and(eq(metaAdInsightsDaily.projectId, projectId), inArray(metaAdInsightsDaily.adId, adIds)),
    );

  for (const r of rows) {
    if (!r.campaignId) continue;
    // Um adId com DOIS campaignId no histórico = anúncio movido de campanha.
    // Fica com o primeiro e é sinalizado ao chamador via `adsAmbiguos`.
    if (!out.has(r.adId)) out.set(r.adId, r.campaignId);
  }
  return out;
}

/** `adId`s que aparecem com mais de um `campaignId` — decisão que ninguém tomou. */
export async function adsAmbiguos(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<string[]> {
  if (!adIds.length) return [];
  const rows = await db
    .selectDistinct({ adId: metaAdInsightsDaily.adId, campaignId: metaAdInsightsDaily.campaignId })
    .from(metaAdInsightsDaily)
    .where(
      and(eq(metaAdInsightsDaily.projectId, projectId), inArray(metaAdInsightsDaily.adId, adIds)),
    );
  const porAd = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.campaignId) continue;
    porAd.set(r.adId, (porAd.get(r.adId) ?? new Set()).add(r.campaignId));
  }
  return [...porAd.entries()].filter(([, s]) => s.size > 1).map(([a]) => a);
}

/** `utm_content` só é Ad ID quando é numérico — o resto é UTM de outra coisa. */
function comoAdId(utmContent: string | null): string | null {
  if (!utmContent) return null;
  const t = utmContent.trim();
  return /^\d{5,}$/.test(t) ? t : null;
}

/**
 * Agrega vendas e leads por campanha, e declara a cobertura.
 *
 * Função pura sobre os dados já lidos — a leitura de planilha fica com o
 * chamador, e é o que torna isto testável sem Google.
 */
export function atribuirPorCampanha(
  vendas: VendaParaAtribuir[],
  leads: LeadParaAtribuir[],
  adParaCampanha: Map<string, string>,
): ResultadoAtribuicao {
  const porCampanha = new Map<string, AtribuicaoPorCampanha>();
  const get = (c: string) => {
    let x = porCampanha.get(c);
    if (!x) {
      x = { campaignId: c, vendasAtribuidas: 0, receitaAtribuida: 0, leadsUnicosAtribuidos: 0 };
      porCampanha.set(c, x);
    }
    return x;
  };

  let totalVendas = 0;
  let totalReceita = 0;
  let naoResolvido = 0;

  for (const v of vendas) {
    // AC3: só status PAGO entra. `isRefundBucket` não serve aqui — ele exclui
    // reembolso e chargeback, mas deixa passar o bucket "other" (recusada,
    // pendente, aguardando pagamento), que não é reembolso e também não é
    // receita. É o débito aberto em `stage-sales-data`, e não foi herdado.
    if (v.status !== null && !isRevenueBucket(classifyRefundStatus(v.status, true))) continue;

    // AC6: o total da ETAPA conta a venda mesmo quando ela não é atribuível.
    // Somar só o atribuído e chamar de total trocaria um número incompleto por
    // um número errado.
    totalVendas += 1;
    totalReceita += v.valorBruto;

    const adId = comoAdId(v.utmContent);
    if (!adId) continue;
    const campanha = adParaCampanha.get(adId);
    if (!campanha) {
      naoResolvido += 1;
      continue;
    }
    const alvo = get(campanha);
    alvo.vendasAtribuidas += 1;
    alvo.receitaAtribuida += v.valorBruto;
  }

  // AC4: lead único por e-mail/telefone. Um lead que aplicou duas vezes conta
  // uma — e conta uma no total mesmo que só uma das linhas tenha UTM.
  const vistos = new Set<string>();
  const porCampanhaLead = new Map<string, Set<string>>();
  for (const l of leads) {
    if (!l.chave) continue;
    vistos.add(l.chave);
    const adId = comoAdId(l.utmContent);
    if (!adId) continue;
    const campanha = adParaCampanha.get(adId);
    if (!campanha) continue;
    porCampanhaLead.set(campanha, (porCampanhaLead.get(campanha) ?? new Set()).add(l.chave));
  }
  for (const [campanha, chaves] of porCampanhaLead) {
    get(campanha).leadsUnicosAtribuidos = chaves.size;
  }

  const atribVendas = [...porCampanha.values()].reduce((s, x) => s + x.vendasAtribuidas, 0);

  // ⚠️ QA-44-01: cobertura de lead é UNIÃO das chaves atribuídas, não soma dos
  // conjuntos por campanha. O mesmo lead pode aparecer em duas campanhas — ele
  // aplicou duas vezes, por anúncios diferentes — e aí soma 2 no numerador
  // contra 1 no denominador (`vistos`, que já deduplica). O resultado passava
  // de 100%.
  //
  // `leadsUnicosAtribuidos` POR CAMPANHA continua contando a sobreposição, e
  // está certo: "quantos leads esta campanha trouxe" tem resposta legítima com
  // o mesmo lead em duas. O que não pode é somar essas respostas para derivar
  // cobertura, que é uma fração do mesmo denominador deduplicado.
  const chavesAtribuidas = new Set<string>();
  for (const chaves of porCampanhaLead.values()) {
    for (const chave of chaves) chavesAtribuidas.add(chave);
  }

  return {
    porCampanha: [...porCampanha.values()].sort((a, b) => b.receitaAtribuida - a.receitaAtribuida),
    totalVendas,
    totalReceita,
    totalLeadsUnicos: vistos.size,
    // `null` em vez de 0 quando não há denominador: "não dá para saber" não é
    // "cobertura zero".
    coberturaVendas: totalVendas > 0 ? atribVendas / totalVendas : null,
    coberturaLeads: vistos.size > 0 ? chavesAtribuidas.size / vistos.size : null,
    utmContentNaoResolvido: naoResolvido,
  };
}
