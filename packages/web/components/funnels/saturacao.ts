/**
 * Saturação — CTR × CPM (Story 29.85).
 *
 * A regra do selo saiu do componente para ficar testável, e passou a usar o
 * CTR do LINK: a linha do gráfico sempre desenhou `link_click ÷ impressões`,
 * mas o selo comparava o `ctr` da Meta (todos os cliques). Com séries
 * diferentes, o selo podia dizer "Saturando" olhando uma curva que a tela não
 * mostra. CTR aqui é sempre clique no link (Story 18.78 / 29.77).
 */

import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";

function safeNum(val: string | undefined): number {
  return val ? parseFloat(val) : 0;
}

/** Cliques no LINK (link_click) de uma linha diária. */
export function linkClicksFromInsight(d: CampaignDailyInsight): number {
  const lc = d.actions?.find((a) => a.action_type === "link_click");
  return lc ? Number(lc.value) || 0 : 0;
}

/** CTR do LINK (clique no link ÷ impressões × 100) — tráfego real, não total. */
export function linkCtr(d: CampaignDailyInsight): number {
  const imp = safeNum(d.impressions);
  return imp > 0 ? (linkClicksFromInsight(d) / imp) * 100 : 0;
}

export type EstadoDeSaturacao = "saturating" | "ctr-drop" | "cpm-rise" | "healthy";

/** O estado e os números que o tooltip do selo mostra (CTR de link e CPM). */
export interface LeituraDeSaturacao {
  status: EstadoDeSaturacao;
  ctrFirst: number;
  ctrSecond: number;
  ctrChange: number;
  cpmFirst: number;
  cpmSecond: number;
  cpmChange: number;
}

/**
 * Compara a primeira metade do período com a segunda. Variação acima de 10%
 * conta: CTR caindo E CPM subindo é saturação; só um dos dois é atenção.
 * Com menos de 4 dias não há metade que se compare — devolve `null`.
 */
export function estadoDeSaturacao(
  dailyData: CampaignDailyInsight[] | null,
): LeituraDeSaturacao | null {
  if (!dailyData || dailyData.length < 4) return null;

  const mid = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, mid);
  const secondHalf = dailyData.slice(mid);

  const media = (arr: CampaignDailyInsight[], valor: (d: CampaignDailyInsight) => number) =>
    arr.reduce((s, d) => s + valor(d), 0) / arr.length;
  const cpm = (d: CampaignDailyInsight) => safeNum(d.cpm);

  const ctrFirst = media(firstHalf, linkCtr);
  const ctrSecond = media(secondHalf, linkCtr);
  const cpmFirst = media(firstHalf, cpm);
  const cpmSecond = media(secondHalf, cpm);

  const ctrChange = ctrFirst > 0 ? ((ctrSecond - ctrFirst) / ctrFirst) * 100 : 0;
  const cpmChange = cpmFirst > 0 ? ((cpmSecond - cpmFirst) / cpmFirst) * 100 : 0;

  const ctrDrop = ctrChange < -10;
  const cpmRise = cpmChange > 10;

  let status: EstadoDeSaturacao = "healthy";
  if (ctrDrop && cpmRise) status = "saturating";
  else if (ctrDrop) status = "ctr-drop";
  else if (cpmRise) status = "cpm-rise";

  return { status, ctrFirst, ctrSecond, ctrChange, cpmFirst, cpmSecond, cpmChange };
}
