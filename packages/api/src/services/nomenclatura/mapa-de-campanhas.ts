/**
 * Story 47.6 — o mapa `campaign_id (Meta) → nove campos do nome`, e a régua de
 * quanto do gasto de um funil já tem vínculo.
 *
 * É o que o cruzamento investimento × faturamento passa a ler: a chave é o id
 * da Meta, a MESMA que o gasto (`meta_campaign_insights_daily`) e a atribuição
 * de venda (`utm_content → ad → campaign_id`, Story 44.3) já usam. Entram as
 * campanhas do gerador que tiverem `meta_campaign_id` colado e as legadas
 * classificadas (47.5) — uma campanha sem id não tem como ser cruzada.
 *
 * ## Cache curto, mesmo desenho de `source-rules-store.ts`
 *
 * Classificação muda algumas vezes por dia; relatório e dashboard leem o mapa a
 * cada geração. Sessenta segundos deixam a classificação "aparecer na hora" sem
 * consultar o banco a cada linha.
 *
 * ## Cobertura é por FUNIL, não por projeto
 *
 * O gasto que interessa é o do funil, e as campanhas de um funil perpétuo são a
 * UNIÃO de `funnels.campaigns` com as dos stages (`perpetual-report-config.ts`
 * explica por quê: em 2026-07-28, 3 de 4 funis tinham o vínculo só no stage).
 * Medido em 2026-09-10 na AC0: **0%** em todos — nenhum vínculo existia ainda.
 */

import { and, eq, gte, inArray, isNotNull, sum } from "drizzle-orm";
import { ORDEM_DO_NOME, PERPETUO, type CampaignFields } from "@loyola-x/shared";
import { funnelStages, funnels, metaCampaignInsightsDaily, namingCampaigns, namingExperts } from "../../db/schema.js";
import type { Conexao } from "./conexao.js";

export interface DimensaoDeCampanha extends CampaignFields {
  /** `gerador` (id colado) ou `legado` (classificada a partir do Meta). */
  origin: "gerador" | "legado";
  /** O nome novo, gerado. */
  name: string;
  /** O nome antigo no Meta, quando legada. */
  metaCampaignName: string | null;
  namingCampaignId: string;
}

export type MapaDeDimensoes = Map<string, DimensaoDeCampanha>;

export const VALIDADE_DO_MAPA_MS = 60_000;
const cache = new Map<string, { em: number; mapa: MapaDeDimensoes }>();

/** Esquece o cache — chamado quando uma campanha é criada, editada ou classificada. */
export function invalidarMapa(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}

/** Posição de cada código no nome, pela ordem declarada no `shared` (v2, Story 47.8). */
const POSICAO_V2 = { expert: ORDEM_DO_NOME.indexOf("expert"), product: ORDEM_DO_NOME.indexOf("product"), funnel: ORDEM_DO_NOME.indexOf("funnel"), kind: ORDEM_DO_NOME.indexOf("kind") };
/** Template v1 (até 2026-09-10): `expert_produto_funil_…`. Nome publicado nesse padrão está congelado (regra 6) e continua legível. */
const POSICAO_V1 = { expert: 0, product: 1, funnel: 2 };

/**
 * Expert, produto e funil a partir do nome gravado. O nome é gerado pelo
 * servidor a partir dos códigos, então ler as posições é a forma mais barata
 * de ter os três por código sem três joins — desde que se leia a posição
 * CERTA: `perpetuo` na 5ª casa diz que é v2; sem ele, é um nome congelado no v1.
 */
export function codigosDoNome(name: string): { expert: string; product: string; funnel: string } {
  const p = name.split("_");
  const pos = p[POSICAO_V2.kind] === PERPETUO ? POSICAO_V2 : POSICAO_V1;
  return { expert: p[pos.expert] ?? "", product: p[pos.product] ?? "", funnel: p[pos.funnel] ?? "" };
}

function paraDimensao(c: typeof namingCampaigns.$inferSelect): DimensaoDeCampanha | null {
  if (!c.metaCampaignId) return null;
  return {
    ...codigosDoNome(c.name),
    offer: c.offerValue,
    year: c.year,
    temperature: c.temperature,
    auction: c.auction,
    format: c.format,
    lp: c.lpValue,
    ...(c.suffix ? { suffix: c.suffix } : {}),
    origin: c.origin,
    name: c.name,
    metaCampaignName: c.metaCampaignName,
    namingCampaignId: c.id,
  };
}

/**
 * O mapa do projeto. Expert/produto/funil vêm do `name` gravado
 * (`codigosDoNome`, que sabe v1 e v2) — os demais são as colunas
 * textuais que `naming_campaigns` guarda de propósito para isto (spec § 4.7).
 */
export async function mapaDeDimensoes(db: Conexao, projectId: string): Promise<MapaDeDimensoes> {
  const guardado = cache.get(projectId);
  if (guardado && Date.now() - guardado.em < VALIDADE_DO_MAPA_MS) return guardado.mapa;

  // Campanha é global no dicionário; o que a prende ao projeto é o expert
  // (`naming_experts.project_id`, 47.5). Sem expert vinculado ao projeto, o
  // mapa desse projeto é vazio — e a cobertura diz isso.
  const linhas = await db
    .select({ c: namingCampaigns })
    .from(namingCampaigns)
    .innerJoin(namingExperts, and(eq(namingExperts.id, namingCampaigns.expertId), eq(namingExperts.projectId, projectId)))
    .where(isNotNull(namingCampaigns.metaCampaignId));

  const mapa: MapaDeDimensoes = new Map();
  for (const { c } of linhas) {
    const d = paraDimensao(c);
    if (d) mapa.set(c.metaCampaignId!, d);
  }
  cache.set(projectId, { em: Date.now(), mapa });
  return mapa;
}

export interface CoberturaDeGasto {
  campanhas: { total: number; comVinculo: number };
  gasto: { total: number; comVinculo: number; semVinculo: number; pct: number | null };
  /** As campanhas SEM vínculo com mais gasto — é por onde a classificação deveria começar. */
  maioresSemVinculo: { campaignId: string; name: string; gasto: number }[];
}

/** As campanhas de um funil perpétuo: união funil + stages, deduplicada por id. */
export async function campanhasDoFunil(db: Conexao, funnelId: string): Promise<{ projectId: string; type: string; campanhas: { id: string; name: string }[] } | null> {
  const [f] = await db.select({ projectId: funnels.projectId, type: funnels.type, campaigns: funnels.campaigns }).from(funnels).where(eq(funnels.id, funnelId)).limit(1);
  if (!f) return null;
  const stages = await db.select({ campaigns: funnelStages.campaigns }).from(funnelStages).where(eq(funnelStages.funnelId, funnelId));
  const porId = new Map<string, { id: string; name: string }>();
  for (const c of f.campaigns ?? []) porId.set(c.id, c);
  for (const s of stages) for (const c of s.campaigns ?? []) if (!porId.has(c.id)) porId.set(c.id, c);
  return { projectId: f.projectId, type: f.type, campanhas: [...porId.values()] };
}

/** Cobertura de GASTO de um funil na janela (dias). Vendas ficam com o relatório, que já atribui por campanha. */
export async function coberturaDeGasto(db: Conexao, funnelId: string, dias: number, hoje = new Date()): Promise<(CoberturaDeGasto & { projectId: string }) | null> {
  const funil = await campanhasDoFunil(db, funnelId);
  if (!funil) return null;
  const ids = funil.campanhas.map((c) => c.id);
  const vazio: CoberturaDeGasto = { campanhas: { total: ids.length, comVinculo: 0 }, gasto: { total: 0, comVinculo: 0, semVinculo: 0, pct: null }, maioresSemVinculo: [] };
  if (ids.length === 0) return { ...vazio, projectId: funil.projectId };

  const inicio = new Date(hoje.getTime() - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
  const [gastos, mapa] = await Promise.all([
    db
      .select({ campaignId: metaCampaignInsightsDaily.campaignId, spend: sum(metaCampaignInsightsDaily.spend) })
      .from(metaCampaignInsightsDaily)
      .where(and(eq(metaCampaignInsightsDaily.projectId, funil.projectId), inArray(metaCampaignInsightsDaily.campaignId, ids), gte(metaCampaignInsightsDaily.dateStart, inicio)))
      .groupBy(metaCampaignInsightsDaily.campaignId),
    mapaDeDimensoes(db, funil.projectId),
  ]);
  const nome = new Map(funil.campanhas.map((c) => [c.id, c.name]));
  let total = 0;
  let com = 0;
  const sem: CoberturaDeGasto["maioresSemVinculo"] = [];
  for (const g of gastos) {
    const v = Number(g.spend ?? 0);
    total += v;
    if (mapa.has(g.campaignId)) com += v;
    else sem.push({ campaignId: g.campaignId, name: nome.get(g.campaignId) ?? g.campaignId, gasto: v });
  }
  sem.sort((a, b) => b.gasto - a.gasto);
  return {
    projectId: funil.projectId,
    campanhas: { total: ids.length, comVinculo: ids.filter((id) => mapa.has(id)).length },
    gasto: { total, comVinculo: com, semVinculo: total - com, pct: total > 0 ? com / total : null },
    maioresSemVinculo: sem.slice(0, 10),
  };
}
