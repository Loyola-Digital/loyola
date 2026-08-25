// ============================================================
// Story 42.9 — o que cada número do Overview significa.
//
// Duas naturezas na mesma resposta da API, e confundi-las é o erro fácil:
//
//   active_subscriptions, active_trials, mrr  → SNAPSHOT de agora
//   revenue, new_customers                    → acumulado de 28 DIAS
//
// O filtro de dias da etapa não governa nenhuma das duas. Exibir um snapshot ao
// lado do filtro sem dizer faria o gestor ler o número como resposta ao filtro.
// ============================================================

export type JanelaDaMetrica = "agora" | "28d" | "derivado" | "serie";

export interface CardDoOverview {
  id: string;
  rotulo: string;
  valor: string;
  janela: JanelaDaMetrica;
  /** Explicação no hover. */
  detalhe: string;
}

export const ROTULO_DA_JANELA: Record<JanelaDaMetrica, string> = {
  agora: "agora",
  "28d": "últimos 28 dias",
  derivado: "derivado",
  serie: "desde o início da série",
};

/** Dólar — `mrr` e `revenue` vêm em USD; exibir como real erraria ~5x. */
export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`;
}

/** Movimento com sinal — o que a métrica quer dizer é a direção. */
export function fmtMovimento(v: number | null | undefined): string {
  if (v == null) return "—";
  return v > 0 ? `+${fmtNum(v)}` : fmtNum(v);
}

/**
 * ARR = MRR × 12 (AC3). `null` entra e sai como `null`: "não sabemos" nunca
 * pode virar "zero" num card de receita anual.
 */
export function arrDoMrr(mrr: number | null | undefined): number | null {
  return mrr == null ? null : mrr * 12;
}

/**
 * AC5 — a frase que declara desde quando a série de assinatura existe.
 *
 * Os eventos de assinatura começam em 10/ago/2026; os de paywall vêm de junho.
 * Sem essa declaração, um número de churn seria lido como "desde sempre".
 */
export function avisoDaSerie(serieDesde: string | null | undefined): string | null {
  if (!serieDesde) return null;
  const [a, m, d] = serieDesde.split("-");
  return `Série de assinaturas desde ${d}/${m}/${a} — antes disso o webhook ainda não registrava estes eventos.`;
}
