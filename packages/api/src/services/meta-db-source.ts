/**
 * Leitores DB-first do funil Meta. Devolvem EXATAMENTE as mesmas shapes dos
 * fetchers ao vivo de meta-ads.ts (MetaCampaignInsight, MetaPlacementInsight, …),
 * mas lendo dos caches diários (meta_campaign_insights_daily,
 * meta_ad_insights_daily, meta_placement_insights_daily) que o sync mantém
 * quente. Assim, trocar a fonte nas rotas NÃO muda a matemática de agregação a
 * jusante (ROAS, imposto, CPL): os números continuam batendo com o dashboard.
 *
 * Agregação over-range: somam-se as métricas diárias por entidade e fazem-se
 * merge das arrays de actions/action_values por action_type. date_start do
 * resultado = início do range (espelha o que a Meta devolve agregado).
 *
 * `reach` é somado das linhas diárias — isso pode superestimar (reach é deduped
 * pela Meta no range). Mesma limitação do caminho ao vivo quando agregado em JS;
 * spend/impressions/clicks/leads/purchases (o que dirige ROAS/CPL/CPA) são exatos.
 */
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaCampaignInsightsDaily,
  metaPlacementInsightsDaily,
  metaHourlyInsightsDaily,
  metaAdInsightsDaily,
  metaEntityNamesCache,
} from "../db/schema.js";
import type { AllAdInsight, MetaCampaignInsight, MetaPlacementInsight, VideoMetrics } from "./meta-ads.js";

type ActionArr = { action_type: string; value: string }[] | null | undefined;

/** Soma values por action_type entre várias arrays diárias. */
function mergeActions(arrays: ActionArr[]): { action_type: string; value: string }[] {
  const sums = new Map<string, number>();
  for (const arr of arrays) {
    if (!arr) continue;
    for (const a of arr) {
      sums.set(a.action_type, (sums.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
    }
  }
  return Array.from(sums.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
}

function sumNumeric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((s, r) => s + (parseFloat(String(r[key] ?? "0")) || 0), 0);
}

/**
 * Insights por campanha agregados no range, lendo de meta_campaign_insights_daily.
 * Mesma shape de fetchCampaignInsights. Retorna [] quando não há cobertura (o
 * caller decide fallback ao vivo coalescido).
 */
export async function getCampaignInsightsFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds?: string[],
): Promise<MetaCampaignInsight[]> {
  const conds = [
    eq(metaCampaignInsightsDaily.projectId, projectId),
    gte(metaCampaignInsightsDaily.dateStart, since),
    lte(metaCampaignInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    conds.push(inArray(metaCampaignInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db.select().from(metaCampaignInsightsDaily).where(and(...conds));
  if (rows.length === 0) return [];

  const byId = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byId.get(r.campaignId);
    if (list) list.push(r);
    else byId.set(r.campaignId, [r]);
  }

  const ids = Array.from(byId.keys());
  const nameRows = await db
    .select({ entityId: metaEntityNamesCache.entityId, entityName: metaEntityNamesCache.entityName })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "campaign"),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );
  const names = new Map(nameRows.map((n) => [n.entityId, n.entityName]));

  return Array.from(byId.entries()).map(([campaignId, rs]) => ({
    campaign_id: campaignId,
    campaign_name: names.get(campaignId) ?? campaignId,
    date_start: since,
    date_stop: until,
    impressions: String(sumNumeric(rs, "impressions")),
    reach: String(sumNumeric(rs, "reach")),
    clicks: String(sumNumeric(rs, "clicks")),
    spend: String(sumNumeric(rs, "spend")),
    ctr: "",
    cpc: "",
    cpm: "",
    actions: mergeActions(rs.map((r) => r.actions)),
    action_values: mergeActions(rs.map((r) => r.actionValues)),
  }));
}

/**
 * Breakdown de placement agregado no range, lendo de
 * meta_placement_insights_daily. Mesma shape de fetchPlacementBreakdown (nível
 * conta). NÃO suporta filtro por campanha (a tabela é por projeto/dia) → o caller
 * cai pro fetch ao vivo coalescido nesse caso.
 */
export async function getPlacementBreakdownFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
): Promise<MetaPlacementInsight[]> {
  const rows = await db
    .select()
    .from(metaPlacementInsightsDaily)
    .where(
      and(
        eq(metaPlacementInsightsDaily.projectId, projectId),
        gte(metaPlacementInsightsDaily.dateStart, since),
        lte(metaPlacementInsightsDaily.dateStart, until),
      ),
    );
  if (rows.length === 0) return [];

  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.publisherPlatform}|${r.platformPosition}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  return Array.from(byKey.entries()).map(([key, rs]) => {
    const [publisher_platform, platform_position] = key.split("|");
    return {
      publisher_platform,
      platform_position,
      spend: String(sumNumeric(rs, "spend")),
      impressions: String(sumNumeric(rs, "impressions")),
      clicks: String(sumNumeric(rs, "clicks")),
      ctr: "",
      cpc: "",
      cpm: "",
      actions: mergeActions(rs.map((r) => r.actions)),
    };
  });
}

/**
 * Story 29.69 (AC7) — spend por DIA, lido do banco.
 *
 * O corte por dia da semana sai daqui, e não do cache horário: os três painéis
 * de dia da semana precisam funcionar mesmo que o sync horário nunca tenha
 * rodado. `getCampaignInsightsFromDb`, logo acima, agrega por campanha e perde
 * o dia — que é justamente o eixo de que precisamos.
 */
export async function getCampaignDailySpendFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds: string[],
): Promise<{ dateStart: string; spend: number }[]> {
  const conds = [
    eq(metaCampaignInsightsDaily.projectId, projectId),
    gte(metaCampaignInsightsDaily.dateStart, since),
    lte(metaCampaignInsightsDaily.dateStart, until),
  ];
  if (campaignIds.length > 0) {
    conds.push(inArray(metaCampaignInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db
    .select({
      dateStart: metaCampaignInsightsDaily.dateStart,
      spend: metaCampaignInsightsDaily.spend,
    })
    .from(metaCampaignInsightsDaily)
    .where(and(...conds));

  const porDia = new Map<string, number>();
  for (const r of rows) {
    porDia.set(r.dateStart, (porDia.get(r.dateStart) ?? 0) + Number(r.spend ?? 0));
  }
  return Array.from(porDia.entries()).map(([dateStart, spend]) => ({ dateStart, spend }));
}

/**
 * Story 29.69 (AC4/AC6) — investimento por hora, lido do BANCO.
 *
 * Devolve uma linha por `(dia, hora)` já somada sobre as campanhas pedidas, mais
 * a cobertura que a AC6 exige: desde qual dia existe cache, e em que fuso a
 * Meta reportou as faixas. Sem isso a tela desenharia um gráfico incompleto com
 * cara de completo.
 *
 * NUNCA chama a Meta — o dashboard lê daqui; quem preenche é o sync
 * (`syncHourlyInsights`). Regra do repo desde o estouro de rate limit de
 * 2026-07-16.
 */
export async function getHourlyInsightsFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds: string[],
): Promise<{
  porDiaEHora: { dateStart: string; hour: number; spend: number; impressions: number; clicks: number }[];
  primeiroDiaComCache: string | null;
  accountTimezone: string | null;
  ultimoSync: Date | null;
}> {
  const filtros = [
    eq(metaHourlyInsightsDaily.projectId, projectId),
    gte(metaHourlyInsightsDaily.dateStart, since),
    lte(metaHourlyInsightsDaily.dateStart, until),
  ];
  // Sem campanhas o recorte não existe: devolver a conta inteira aqui seria o
  // mesmo defeito que a campanha na chave veio corrigir.
  if (campaignIds.length > 0) {
    filtros.push(inArray(metaHourlyInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db
    .select()
    .from(metaHourlyInsightsDaily)
    .where(and(...filtros));

  if (rows.length === 0) {
    return { porDiaEHora: [], primeiroDiaComCache: null, accountTimezone: null, ultimoSync: null };
  }

  const acc = new Map<string, { dateStart: string; hour: number; spend: number; impressions: number; clicks: number }>();
  let primeiroDia: string | null = null;
  let tz: string | null = null;
  let ultimo: Date | null = null;
  for (const r of rows) {
    const key = `${r.dateStart}|${r.hour}`;
    const e = acc.get(key) ?? {
      dateStart: r.dateStart,
      hour: r.hour,
      spend: 0,
      impressions: 0,
      clicks: 0,
    };
    e.spend += Number(r.spend ?? 0);
    e.impressions += Number(r.impressions ?? 0);
    e.clicks += Number(r.clicks ?? 0);
    acc.set(key, e);
    if (primeiroDia === null || r.dateStart < primeiroDia) primeiroDia = r.dateStart;
    if (tz === null && r.accountTimezone) tz = r.accountTimezone;
    if (r.lastSyncedAt && (ultimo === null || r.lastSyncedAt > ultimo)) ultimo = r.lastSyncedAt;
  }

  return {
    porDiaEHora: Array.from(acc.values()),
    primeiroDiaComCache: primeiroDia,
    accountTimezone: tz,
    ultimoSync: ultimo,
  };
}

/**
 * Story 18.61: estado ATUAL (effective_status) por ad_id, lido do
 * meta_entity_names_cache (entity_type='ad'). Devolve Map<adId, status>.
 *
 * Leitura NOVA e ad-scoped — separada do join campaign-scoped de
 * getCampaignInsightsFromDb (que resolve NOMES de campanha). Só ids com status
 * conhecido entram no Map; ausência = desconhecido (o caller exibe "—", nunca
 * "Pausado"). Sem TTL: o status é sempre o último sincronizado pelo backfill de
 * nomes. NUNCA chama a Meta (regra batch+cache: dashboard lê do banco).
 */
export async function getAdEffectiveStatusFromDb(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(adIds.filter((x) => x && x.trim().length > 0)));
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      entityId: metaEntityNamesCache.entityId,
      effectiveStatus: metaEntityNamesCache.effectiveStatus,
    })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "ad"),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );

  for (const r of rows) {
    if (r.effectiveStatus) out.set(r.entityId, r.effectiveStatus);
  }
  return out;
}


// ============================================================
// Story 43.9 — insights por ANÚNCIO, DB-first
//
// `fetchAllAdInsights` era o último fetcher quente sem par no banco: os
// dashboards do gestor o chamam em quatro pontos (`getTopPerformers`,
// `getAllAdsAnalytics`, e dois de adset), e cada chamada é uma varredura da
// conta na API da Meta — `level=ad`, todas as páginas.
//
// O limite da Meta é por conta/app e compartilhado entre TODOS os dashboards:
// estourar derruba os cruzamentos de uma vez, e foi o que aconteceu em
// 2026-07-16. A tabela `meta_ad_insights_daily` já existe e o sync a mantém
// quente (medido em 2026-09-07: BBE, FZ e Lyrio sincronizados há 12 min).
// Faltava alguém ler dela.
// ============================================================

/**
 * As métricas de vídeo somadas dia a dia.
 *
 * Exportada para teste: é a única parte desta função que decide um número
 * (o resto é somatório e junção), e é a que erra em silêncio se alguém trocar
 * a soma pelo valor do último dia.
 *
 * `videoMetrics` é gravado por dia como jsonb, e no range vira a soma — nunca a
 * do último dia, que é o que um `?? row.videoMetrics` faria por engano. Ausência
 * em TODOS os dias devolve `null`, não um objeto de zeros: zero é medição, e
 * `null` é "a Meta não devolveu reprodução nenhuma". A distinção decide se um
 * criativo fica fora do ranking de hook ou aparece como o pior dele.
 */
export function somarVideoMetrics(brutos: unknown[]): VideoMetrics | null {
  const validos = brutos.filter((v): v is Record<string, number> => v != null && typeof v === "object");
  if (validos.length === 0) return null;
  const soma = (k: string) => validos.reduce((s, v) => s + (Number(v[k]) || 0), 0);
  const out: VideoMetrics = {
    p25: soma("p25"),
    p50: soma("p50"),
    p75: soma("p75"),
    p100: soma("p100"),
    thruplay: soma("thruplay"),
  };
  // Opcionais: só entram se ao menos um dia os trouxe — senão `views3s: 0`
  // diria "medimos e deu zero" onde o certo é "não veio".
  if (validos.some((v) => v.views3s != null)) out.views3s = soma("views3s");
  if (validos.some((v) => v.plays != null)) out.plays = soma("plays");
  return out;
}

/**
 * Insights por anúncio agregados no range, lendo de `meta_ad_insights_daily`.
 *
 * Mesma shape de `fetchAllAdInsights` — trocar a fonte no caller não muda a
 * matemática a jusante (ROAS, CPL, imposto, hook rate).
 *
 * ⚠️ `ctr`, `cpc` e `cpm` saem como `""`, exatamente como em
 * `getCampaignInsightsFromDb`: são taxas, e média de médias diárias não é a taxa
 * do período. Quem precisa delas as re-deriva dos somatórios — que é o que o
 * código a jusante já faz.
 *
 * ⚠️ `inline_link_clicks` não vem: `fetchAllAdInsightsImpl` **também não o pede**
 * (confira os `fields` lá). As duas fontes omitem o mesmo campo, então nada
 * muda de comportamento ao trocar.
 *
 * Devolve `[]` quando não há cobertura — o caller cai no fetch ao vivo.
 */
export async function getAdInsightsFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds?: string[],
): Promise<AllAdInsight[]> {
  const conds = [
    eq(metaAdInsightsDaily.projectId, projectId),
    gte(metaAdInsightsDaily.dateStart, since),
    lte(metaAdInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    conds.push(inArray(metaAdInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db.select().from(metaAdInsightsDaily).where(and(...conds));
  if (rows.length === 0) return [];

  const byAd = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byAd.get(r.adId);
    if (list) list.push(r);
    else byAd.set(r.adId, [r]);
  }

  return Array.from(byAd.entries()).map(([adId, rs]) => {
    // O nome pode faltar em alguns dias e existir em outros — pega o primeiro
    // que veio, e cai no id em vez de mostrar vazio.
    const nomeDe = (campo: "adName" | "adsetName" | "campaignName") =>
      rs.find((r) => r[campo])?.[campo] ?? null;
    const idDe = (campo: "adsetId" | "campaignId") => rs.find((r) => r[campo])?.[campo] ?? "";

    return {
      ad_id: adId,
      ad_name: nomeDe("adName") ?? adId,
      adset_id: idDe("adsetId"),
      adset_name: nomeDe("adsetName") ?? "",
      campaign_id: idDe("campaignId"),
      campaign_name: nomeDe("campaignName") ?? "",
      date_start: since,
      date_stop: until,
      impressions: String(sumNumeric(rs, "impressions")),
      reach: String(sumNumeric(rs, "reach")),
      clicks: String(sumNumeric(rs, "clicks")),
      spend: String(sumNumeric(rs, "spend")),
      ctr: "",
      cpc: "",
      cpm: "",
      actions: mergeActions(rs.map((r) => r.actions)),
      action_values: mergeActions(rs.map((r) => r.actionValues)),
      videoMetrics: somarVideoMetrics(rs.map((r) => r.videoMetrics)),
    };
  });
}
