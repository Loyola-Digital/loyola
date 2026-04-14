import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Factories puras para construir o memorial de cálculo (MetricFormula)
 * de cada métrica do dashboard Instagram. Retornam `undefined` quando o
 * dado essencial está ausente — o <MetricTooltip> faz passthrough nesse caso.
 */

export interface InstagramPeriod {
  /** Unix timestamp em segundos (alinhado com PeriodConfig.since). */
  since: number;
  /** Unix timestamp em segundos (alinhado com PeriodConfig.until). */
  until: number;
}

const nf = new Intl.NumberFormat("pt-BR");

function formatPeriod(period?: InstagramPeriod): string | undefined {
  if (!period) return undefined;
  const sinceDate = new Date(period.since * 1000);
  const untilDate = new Date(period.until * 1000);
  return `${format(sinceDate, "dd/MM", { locale: ptBR })} — ${format(untilDate, "dd/MM", { locale: ptBR })}`;
}

/**
 * Seguidores (snapshot) — 1 card.
 * Não depende de período; valor é `profile.followers_count`.
 */
export function buildFollowersFormula(
  followersCount: number | undefined,
): MetricFormula | undefined {
  if (followersCount == null) return undefined;
  return {
    expression: "Contagem atual de seguidores",
    values: [
      {
        label: "Seguidores",
        value: followersCount,
        source: "Instagram Graph API · followers_count",
      },
    ],
    result: nf.format(followersCount),
  };
}

/**
 * Saldo de Seguidores no período (follow − unfollow).
 */
export function buildFollowersDeltaFormula(
  gained: number,
  lost: number,
  period: InstagramPeriod,
): MetricFormula {
  const delta = gained - lost;
  return {
    expression: "follow − unfollow",
    values: [
      {
        label: "Novos seguidores",
        value: gained,
        source: "Instagram Graph API · follows_and_unfollows",
      },
      {
        label: "Unfollows",
        value: lost,
        source: "Instagram Graph API · follows_and_unfollows",
      },
    ],
    result: `${nf.format(gained)} − ${nf.format(lost)} = ${delta >= 0 ? "+" : ""}${nf.format(delta)}`,
    period: formatPeriod(period),
  };
}

/**
 * Alcance (Σ reach do período).
 */
export function buildReachFormula(
  totalReach: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ reach diário",
    values: [
      {
        label: "Alcance acumulado",
        value: totalReach,
        source: "Instagram Graph API · reach",
      },
    ],
    result: nf.format(totalReach),
    period: formatPeriod(period),
  };
}

/**
 * Visualizações (Σ views do período).
 */
export function buildViewsFormula(
  totalViews: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ views",
    values: [
      {
        label: "Visualizações",
        value: totalViews,
        source: "Instagram Graph API · views",
      },
    ],
    result: nf.format(totalViews),
    period: formatPeriod(period),
  };
}

/**
 * Interações (Σ total_interactions) com breakdown opcional de likes + comments.
 */
export function buildInteractionsFormula(
  totalInteractions: number,
  likes: number,
  comments: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ total_interactions",
    values: [
      {
        label: "Interações totais",
        value: totalInteractions,
        source: "Instagram Graph API · total_interactions",
      },
      ...(likes > 0
        ? [
            {
              label: "Likes",
              value: likes,
              source: "Instagram Graph API · likes",
            },
          ]
        : []),
      ...(comments > 0
        ? [
            {
              label: "Comments",
              value: comments,
              source: "Instagram Graph API · comments",
            },
          ]
        : []),
    ],
    result: nf.format(totalInteractions),
    period: formatPeriod(period),
  };
}

/**
 * Taxa de Engajamento = Interações ÷ Alcance × 100. Retorna `undefined`
 * quando `reach = 0` (divisão por zero).
 */
export function buildEngagementFormula(
  totalInteractions: number,
  totalReach: number,
  period: InstagramPeriod,
): MetricFormula | undefined {
  if (totalReach <= 0) return undefined;
  const rate = (totalInteractions / totalReach) * 100;
  return {
    expression: "Interações ÷ Alcance × 100",
    values: [
      {
        label: "Interações",
        value: totalInteractions,
        source: "Instagram Graph API · total_interactions",
      },
      {
        label: "Alcance",
        value: totalReach,
        source: "Instagram Graph API · reach",
      },
    ],
    result: `${nf.format(totalInteractions)} ÷ ${nf.format(totalReach)} × 100 = ${rate.toFixed(2)}%`,
    period: formatPeriod(period),
    note: "Derivado (total_interactions ÷ reach)",
  };
}

/**
 * Salvamentos (Σ saves).
 */
export function buildSavesFormula(
  totalSaves: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ saves",
    values: [
      {
        label: "Salvamentos",
        value: totalSaves,
        source: "Instagram Graph API · saves",
      },
    ],
    result: nf.format(totalSaves),
    period: formatPeriod(period),
  };
}

/**
 * Compartilhamentos (Σ shares).
 */
export function buildSharesFormula(
  totalShares: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ shares",
    values: [
      {
        label: "Compartilhamentos",
        value: totalShares,
        source: "Instagram Graph API · shares",
      },
    ],
    result: nf.format(totalShares),
    period: formatPeriod(period),
  };
}

/**
 * Cliques na Bio (Σ profile_links_taps).
 */
export function buildBioClicksFormula(
  bioClicks: number,
  period: InstagramPeriod,
): MetricFormula {
  return {
    expression: "Σ profile_links_taps",
    values: [
      {
        label: "Cliques no link da bio",
        value: bioClicks,
        source: "Instagram Graph API · profile_links_taps",
      },
    ],
    result: nf.format(bioClicks),
    period: formatPeriod(period),
  };
}

/**
 * Memorial de um ponto diário do chart (reach/impressions/engaged do dia X).
 */
export function buildDailyPointFormula(
  metricLabel: string,
  apiField: string,
  value: number,
  dateLabel: string,
): MetricFormula {
  return {
    expression: `${metricLabel} do dia ${dateLabel}`,
    values: [
      {
        label: metricLabel,
        value,
        source: `Instagram Graph API · ${apiField}`,
      },
    ],
    result: nf.format(value),
    period: dateLabel,
  };
}
