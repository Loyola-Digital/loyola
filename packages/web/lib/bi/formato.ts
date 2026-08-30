/**
 * Como cada número aparece na tela.
 *
 * A regra que atravessa tudo: `null` **não** é zero. Um CPM sem impressão é
 * "—", nunca "R$ 0,00" — zero é uma medição, e traço é a ausência dela. Trocar
 * um pelo outro contamina média, ordenação e leitura do gráfico.
 */

export type TipoSemantico = "currency" | "number" | "percent" | "date" | "text";

export const TRACO = "—";

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** O valor formatado para leitura. `null`/`undefined` viram traço. */
export function formatar(valor: string | number | null | undefined, tipo: TipoSemantico): string {
  if (valor === null || valor === undefined || valor === "") return TRACO;

  if (tipo === "text") return String(valor);
  if (tipo === "date") return formatarData(String(valor));

  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return TRACO;

  switch (tipo) {
    case "currency":
      return MOEDA.format(n);
    case "percent":
      // As taxas vêm como razão (0,0123), não como 1,23 — multiplicar aqui, e
      // num lugar só, evita a versão do gráfico discordar da versão do KPI.
      return `${DECIMAL.format(n * 100)}%`;
    case "number":
      return Number.isInteger(n) ? INTEIRO.format(n) : DECIMAL.format(n);
  }
}

/** `2026-08-26` → `26/08`. Texto puro: não passa por `Date`, então não tem fuso. */
export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** A versão compacta, para caber no eixo do gráfico. */
export function formatarCurto(valor: number | null, tipo: TipoSemantico): string {
  if (valor === null) return TRACO;
  if (tipo === "percent") return `${DECIMAL.format(valor * 100)}%`;
  const abs = Math.abs(valor);
  const prefixo = tipo === "currency" ? "R$ " : "";
  if (abs >= 1_000_000) return `${prefixo}${DECIMAL.format(valor / 1_000_000)}M`;
  if (abs >= 1_000) return `${prefixo}${DECIMAL.format(valor / 1_000)}k`;
  return `${prefixo}${DECIMAL.format(valor)}`;
}
