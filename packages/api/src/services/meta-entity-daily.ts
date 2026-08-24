/**
 * Story 29.42 — série DIÁRIA por entidade (campanha / público / criativo).
 *
 * Vive em módulo próprio, e não dentro de `meta-db-source.ts`, porque aquele
 * arquivo tem um contrato específico: devolver EXATAMENTE as shapes dos
 * fetchers ao vivo de `meta-ads.ts`. Isto aqui devolve uma shape nova, criada
 * para os gráficos por dimensão — misturar as duas coisas confundiria quem for
 * mexer em qualquer uma delas depois.
 *
 * ## Fonte por dimensão, e por que não é a mesma para as três
 *
 * | groupBy      | tabela                        | motivo                              |
 * |--------------|-------------------------------|-------------------------------------|
 * | `campaign`   | `meta_campaign_insights_daily`| fecha com o agregado por construção |
 * | `adset`/`ad` | `meta_ad_insights_daily`      | única com `adset_id`                |
 *
 * A medição que motivou essa separação (@po, 2026-08-07, últimos 30 dias em
 * produção):
 *
 * ```
 *   ad_insights_daily somado por campanha .... R$ 93.795,22
 *   campaign_insights_daily .................. R$ 95.273,29
 *   diferenca ................................ R$  1.478,07  (1,55%)
 *   pares (campanha, dia) so em campaign ..... 59
 *   pares (campanha, dia) so em ad ...........  0
 * ```
 *
 * O grão de anúncio é SUBCONJUNTO do de campanha, nunca superconjunto: há
 * campanha-dia com gasto que a Meta reporta no nível da campanha sem nenhuma
 * linha de anúncio (anúncio deletado é a causa típica). Somar as séries de
 * público/criativo e esperar o total da campanha é, portanto, errado — e é por
 * isso que `unattributedByDate` existe, em vez de o resto sumir em silêncio.
 *
 * ## Imposto
 *
 * Devolve spend **BRUTO**, como `/campaign-daily`. O gross-up de 12,15%
 * (`spend / (1 - 0,1215)`) acontece UMA vez, no frontend. Aplicar aqui
 * produziria imposto ao quadrado no consumidor que já tributa — foi o bug da
 * 29.24, corrigido na 29.27.
 *
 * ## Meta
 *
 * Não chama a Graph API. O rate limit derrubou a integração em 2026-07-16 e a
 * regra desde então é ler do banco; o sync diário (`meta-perf-scheduler`) é
 * quem popula as duas tabelas.
 */

import { and, eq, gte, lte, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaCampaignInsightsDaily,
  metaAdInsightsDaily,
  metaEntityNamesCache,
} from "../db/schema.js";

export type EntityDailyGroupBy = "campaign" | "adset" | "ad";

export interface EntityDailyRow {
  entityId: string;
  entityName: string;
  dateStart: string;
  /** BRUTO, sem os 12,15% de imposto. */
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
}

export interface EntityDailySeries {
  rows: EntityDailyRow[];
  /**
   * Investimento por dia presente no grão de CAMPANHA e ausente de toda linha
   * de anúncio. Vazio quando `groupBy === "campaign"`.
   */
  unattributedByDate: Record<string, number>;
  /** Dias com gasto de campanha e nenhuma linha de anúncio — lacuna de cobertura. */
  daysWithoutCoverage: string[];
}

type ActionArr = { action_type: string; value: string }[] | null | undefined;

function toNum(v: unknown): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function linkClicksFrom(actions: ActionArr): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === "link_click");
  return a ? parseFloat(a.value) || 0 : 0;
}

/** Nomes de entidade pelo cache, num SELECT só. */
async function resolveEntityNames(
  db: Database,
  projectId: string,
  entityType: EntityDailyGroupBy,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      entityId: metaEntityNamesCache.entityId,
      entityName: metaEntityNamesCache.entityName,
    })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, entityType),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );
  return new Map(rows.map((r) => [r.entityId, r.entityName]));
}

export async function getEntityDailySeries(
  db: Database,
  projectId: string,
  groupBy: EntityDailyGroupBy,
  since: string,
  until: string,
  campaignIds?: string[],
): Promise<EntityDailySeries> {
  // Total por campanha-dia: a régua contra a qual o não-atribuído é medido.
  const campConds = [
    eq(metaCampaignInsightsDaily.projectId, projectId),
    gte(metaCampaignInsightsDaily.dateStart, since),
    lte(metaCampaignInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    campConds.push(inArray(metaCampaignInsightsDaily.campaignId, campaignIds));
  }
  const campRows = await db.select().from(metaCampaignInsightsDaily).where(and(...campConds));

  // --- Por campanha: a própria tabela de campanha. Não existe não-atribuído.
  if (groupBy === "campaign") {
    const ids = [...new Set(campRows.map((r) => r.campaignId))];
    const names = await resolveEntityNames(db, projectId, "campaign", ids);
    const rows: EntityDailyRow[] = campRows.map((r) => ({
      entityId: r.campaignId,
      entityName: names.get(r.campaignId) ?? r.campaignId,
      dateStart: r.dateStart,
      spend: toNum(r.spend),
      impressions: toNum(r.impressions),
      clicks: toNum(r.clicks),
      linkClicks: linkClicksFrom(r.actions),
    }));
    return { rows, unattributedByDate: {}, daysWithoutCoverage: [] };
  }

  // --- Por público/criativo: grão de anúncio.
  const adConds = [
    eq(metaAdInsightsDaily.projectId, projectId),
    gte(metaAdInsightsDaily.dateStart, since),
    lte(metaAdInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    adConds.push(inArray(metaAdInsightsDaily.campaignId, campaignIds));
  }
  const adRows = await db.select().from(metaAdInsightsDaily).where(and(...adConds));

  const byKey = new Map<string, EntityDailyRow>();
  const spendByDate = new Map<string, number>();

  for (const r of adRows) {
    const id = groupBy === "adset" ? r.adsetId : r.adId;
    if (!id) continue;
    // O sync já grava adset_name/ad_name na linha — usar isso poupa o SELECT
    // de nomes na maioria dos casos.
    const nomeDaLinha = groupBy === "adset" ? r.adsetName : r.adName;
    const k = `${id} ${r.dateStart}`;
    let acc = byKey.get(k);
    if (!acc) {
      acc = {
        entityId: id,
        entityName: nomeDaLinha ?? id,
        dateStart: r.dateStart,
        spend: 0,
        impressions: 0,
        clicks: 0,
        linkClicks: 0,
      };
      byKey.set(k, acc);
    }
    acc.spend += toNum(r.spend);
    acc.impressions += toNum(r.impressions);
    acc.clicks += toNum(r.clicks);
    acc.linkClicks += linkClicksFrom(r.actions);
    spendByDate.set(r.dateStart, (spendByDate.get(r.dateStart) ?? 0) + toNum(r.spend));
  }

  // Nome pelo cache só para o que a linha não trouxe.
  const semNome = [
    ...new Set(
      [...byKey.values()].filter((a) => a.entityName === a.entityId).map((a) => a.entityId),
    ),
  ];
  if (semNome.length > 0) {
    const names = await resolveEntityNames(db, projectId, groupBy, semNome);
    for (const acc of byKey.values()) {
      if (acc.entityName === acc.entityId) {
        acc.entityName = names.get(acc.entityId) ?? acc.entityId;
      }
    }
  }

  // Não-atribuído por dia: o que a campanha gastou e nenhum anúncio explica.
  // O piso em zero existe porque o inverso não deveria acontecer (o grão de
  // anúncio é subconjunto) — e um número negativo na tela seria pior que a
  // omissão. O caso patológico aparece em `daysWithoutCoverage`.
  const unattributedByDate: Record<string, number> = {};
  const daysWithoutCoverage: string[] = [];
  for (const [date, totalCamp] of totalCampaignSpend(campRows)) {
    const totalAds = spendByDate.get(date) ?? 0;
    const diff = totalCamp - totalAds;
    if (diff > 0.005) unattributedByDate[date] = diff;
    if (totalAds === 0 && totalCamp > 0) daysWithoutCoverage.push(date);
  }

  return { rows: [...byKey.values()], unattributedByDate, daysWithoutCoverage };
}

function totalCampaignSpend(
  campRows: { dateStart: string; spend: unknown }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of campRows) {
    m.set(r.dateStart, (m.get(r.dateStart) ?? 0) + toNum(r.spend));
  }
  return m;
}

/**
 * Story 29.58 — o grão de anúncio COMPLETO, para o relatório perpétuo.
 *
 * ## Por que não `getEntityDailySeries`
 *
 * Aquela função devolve uma entidade por linha (`entityId` + `entityName`), o
 * que basta para plotar um gráfico por dimensão. O relatório precisa do VÍNCULO
 * entre os grãos: qual conjunto contém qual anúncio. Sem `adsetId` na mesma
 * linha do `adId`, não há como somar investimento por público — e é exatamente
 * essa a coluna que sai zerada hoje.
 *
 * Chamar `getEntityDailySeries` duas vezes (`"ad"` e `"adset"`) devolveria os
 * dois nomes e nenhuma ligação entre eles.
 *
 * ## Imposto
 *
 * Devolve spend **BRUTO**, como todo este módulo. O gross-up é do consumidor, e
 * acontece uma única vez — no relatório, dia a dia, porque a alíquota só vale a
 * partir de 2026-01-01 e um período pode atravessar essa data.
 *
 * ## Meta
 *
 * Não chama a Graph API. Lê `meta_ad_insights_daily`, que o sync mantém quente.
 */
export interface AdLevelDailyRow {
  adId: string;
  adName: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string;
  dateStart: string;
  /** BRUTO, sem os 12,15% de imposto. */
  spend: number;
}

export async function getAdLevelDailySpend(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds?: string[],
): Promise<AdLevelDailyRow[]> {
  const conds = [
    eq(metaAdInsightsDaily.projectId, projectId),
    gte(metaAdInsightsDaily.dateStart, since),
    lte(metaAdInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    conds.push(inArray(metaAdInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db.select().from(metaAdInsightsDaily).where(and(...conds));

  const saida: AdLevelDailyRow[] = [];
  for (const r of rows) {
    if (!r.adId) continue;
    saida.push({
      adId: r.adId,
      // O sync grava `ad_name`/`adset_name` na própria linha — medido no BBE,
      // 0 das 196 linhas do período vieram sem. O fallback para o cache de
      // nomes fica abaixo, para o caso em que vier.
      adName: r.adName ?? r.adId,
      adsetId: r.adsetId ?? null,
      adsetName: r.adsetName ?? null,
      // `campaign_id` pode ser nulo na tabela; sem ele a linha não se liga a
      // campanha nenhuma e o relatório não saberia onde encaixá-la.
      campaignId: r.campaignId ?? "",
      dateStart: r.dateStart,
      spend: toNum(r.spend),
    });
  }

  // Nome pelo cache só para o que a linha não trouxe — o mesmo padrão de
  // `getEntityDailySeries`, e pelo mesmo motivo: o SELECT extra é desperdício
  // quando o dado já veio junto.
  const adsSemNome = [...new Set(saida.filter((r) => r.adName === r.adId).map((r) => r.adId))];
  if (adsSemNome.length > 0) {
    const names = await resolveEntityNames(db, projectId, "ad", adsSemNome);
    for (const r of saida) {
      if (r.adName === r.adId) r.adName = names.get(r.adId) ?? r.adId;
    }
  }
  const adsetsSemNome = [
    ...new Set(saida.filter((r) => r.adsetId && !r.adsetName).map((r) => r.adsetId!)),
  ];
  if (adsetsSemNome.length > 0) {
    const names = await resolveEntityNames(db, projectId, "adset", adsetsSemNome);
    for (const r of saida) {
      if (r.adsetId && !r.adsetName) r.adsetName = names.get(r.adsetId) ?? null;
    }
  }

  return saida;
}
