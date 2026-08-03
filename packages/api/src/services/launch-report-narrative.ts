/**
 * Story 41.5 — helpers de narrativa e formatação (§6).
 *
 * A regra que este módulo existe para impor:
 *
 * > **Nenhum número, percentual, peso ou adjetivo de comparação pode ser
 * > literal no template.**
 *
 * Caso real documentado na spec: depois de reclassificar produtos, o relatório
 * continuou dizendo *"a conversão clique→venda piorou de 1,74% para 1,98%"*. A
 * conversão tinha **melhorado** (+13,8%), mas a frase estava fixa no template.
 *
 * ```
 * ❌  "O ticket caiu de {a} para {b} (−35%, peso 48%) e a conversão piorou"
 *
 * ✅  `O ticket ${verboDirecao(a, b)} de ${moedaBr(a)} para ${moedaBr(b)} ` +
 *     `(${pctComSinal(variacaoPct(a, b))}, peso ${pctComSinal(peso)})`
 * ```
 *
 * Funções puras. Toda frase do template deve passar por uma delas.
 */

// ---------------------------------------------------------------------------
// Formatação BR (§AC6) — nenhum valor pode sair em formato US
// ---------------------------------------------------------------------------

/** `R$ 1.234,56` — ponto no milhar, vírgula no decimal. */
export function moedaBr(valor: number, casas = 2): string {
  if (!Number.isFinite(valor)) return "R$ 0,00";
  return `R$ ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}`;
}

/** `1.234` — sem casas decimais. */
export function inteiroBr(valor: number): string {
  if (!Number.isFinite(valor)) return "0";
  return Math.round(valor).toLocaleString("pt-BR");
}

/** `12,3%`. */
export function pctBr(valor: number, casas = 1): string {
  if (!Number.isFinite(valor)) return "0,0%";
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

/** Número simples com casas fixas — `0,9646`. */
export function numeroBr(valor: number, casas = 2): string {
  if (!Number.isFinite(valor)) return (0).toLocaleString("pt-BR", { minimumFractionDigits: casas });
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/**
 * `27/07/26` a partir de `YYYY-MM-DD`.
 *
 * Formata por **manipulação de string**, não com `Date`: `new Date("2026-07-27")`
 * é interpretado como UTC e, em fuso negativo, `toLocaleDateString` devolveria
 * o dia anterior. O relatório inteiro trabalha com dia civil de São Paulo.
 */
export function dataBr(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return isoYmd;
  return `${m[3]}/${m[2]}/${m[1]!.slice(2)}`;
}

/** `27/07` — para eixos de gráfico e cabeçalhos curtos. */
export function diaMesBr(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim());
  if (!m) return isoYmd;
  return `${m[3]}/${m[2]}`;
}

// ---------------------------------------------------------------------------
// Narrativa derivada (§6)
// ---------------------------------------------------------------------------

/**
 * Variação percentual de `a` para `b`.
 *
 * `null` quando a base é zero — não existe "aumento percentual" a partir de
 * zero, e devolver `Infinity` colocaria "+∞%" no relatório.
 */
export function variacaoPct(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return (b / a - 1) * 100;
}

/** `+77,0%` / `−17,0%` — sinal sempre explícito, com o menos tipográfico. */
export function pctComSinal(valor: number | null, casas = 1): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  const abs = Math.abs(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  if (valor > 0) return `+${abs}%`;
  if (valor < 0) return `−${abs}%`;
  return `0,0%`;
}

/**
 * Verbo de direção derivado do sinal — o coração do §6.
 *
 * @param menorEhMelhor - inverte apenas a **avaliação**, nunca o verbo: um CPV
 * que diminui continua "caiu", mas isso é uma melhora. Ver `avaliacao`.
 */
export function verboDirecao(
  a: number,
  b: number,
  opcoes: { subiu?: string; caiu?: string; igual?: string } = {},
): string {
  const subiu = opcoes.subiu ?? "subiu";
  const caiu = opcoes.caiu ?? "caiu";
  const igual = opcoes.igual ?? "ficou estável";
  if (!Number.isFinite(a) || !Number.isFinite(b)) return igual;
  if (b > a) return subiu;
  if (b < a) return caiu;
  return igual;
}

export type Avaliacao = "melhorou" | "piorou" | "estável";

/**
 * Se a mudança foi boa ou ruim. Separado do verbo de propósito: em métrica de
 * custo, "caiu" e "melhorou" andam juntos.
 */
export function avaliacao(a: number, b: number, menorEhMelhor = false): Avaliacao {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return "estável";
  const aumentou = b > a;
  const bom = menorEhMelhor ? !aumentou : aumentou;
  return bom ? "melhorou" : "piorou";
}

/** Seta de direção para as tabelas de comparação. */
export function seta(a: number, b: number): "▲" | "▼" | "–" {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return "–";
  return b > a ? "▲" : "▼";
}

/**
 * Classe CSS de cor, com inversão para métrica de custo (§AC5 da 41.6).
 * Verde = melhorou, vermelho = piorou.
 */
export function classeDirecao(a: number, b: number, menorEhMelhor = false): "ok" | "ruim" | "neutro" {
  const av = avaliacao(a, b, menorEhMelhor);
  if (av === "melhorou") return "ok";
  if (av === "piorou") return "ruim";
  return "neutro";
}

/**
 * Sinal de saúde do ROAS: ✅ quando paga o investimento, ⚠️ quando não paga.
 * O limiar é 1 por definição — ROAS abaixo de 1 significa gastar mais do que
 * entra.
 */
export function sinalRoas(roas: number): "✅" | "⚠️" {
  return roas >= 1 ? "✅" : "⚠️";
}

// ---------------------------------------------------------------------------
// Escape — obrigatório antes de interpolar no HTML
// ---------------------------------------------------------------------------

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapa conteúdo dinâmico antes de entrar no documento.
 *
 * **Obrigatório**: nomes de campanha, produto e criativo vêm de planilha e da
 * Meta — não são confiáveis por construção. O `&` é substituído primeiro, senão
 * as entidades geradas pelas outras trocas seriam escapadas de novo.
 */
export function escaparHtml(texto: string | null | undefined): string {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ESCAPE[c]!);
}

/** Escape para dentro de string JS (usado no bloco de dados do Chart.js). */
export function escaparJson(valor: unknown): string {
  return JSON.stringify(valor).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
