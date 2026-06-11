import type { HotmartMoneyMetric } from "@/lib/hooks/use-hotmart";

/** Formata uma métrica monetária pela própria moeda (currency_code). */
export function fmtMoney(m?: HotmartMoneyMetric): string {
  if (!m) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: m.currency,
  }).format(m.value);
}

/**
 * Moeda primária: BRL quando existir, senão a primeira da lista.
 * NUNCA somar moedas diferentes.
 */
export function primary(metrics: HotmartMoneyMetric[]): HotmartMoneyMetric | undefined {
  return metrics.find((m) => m.currency === "BRL") ?? metrics[0];
}

/** Demais moedas (todas exceto a primária), formatadas pra exibir no sub/tooltip. */
export function secondaries(metrics: HotmartMoneyMetric[]): HotmartMoneyMetric[] {
  const p = primary(metrics);
  if (!p) return [];
  return metrics.filter((m) => m.currency !== p.currency);
}

/** Sub-texto com as moedas secundárias (ex.: "US$ 120,00 · € 30,00"). */
export function multiCurrencySub(metrics: HotmartMoneyMetric[]): string | undefined {
  const others = secondaries(metrics);
  if (others.length === 0) return undefined;
  return others.map((m) => fmtMoney(m)).join(" · ");
}

export function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function fmtInt(v: number): string {
  return v.toLocaleString("pt-BR");
}

export function fmtMonths(v: number): string {
  return `${v.toFixed(1)} m`;
}
