/**
 * Story 18.73 — formatação de número do dashboard de lançamento.
 *
 * ## O que mudou
 *
 * Os componentes traziam, cada um, sua cópia de `fmtCurrency`/`fmtNumber` com o
 * mesmo corpo — e todas abreviavam acima de mil:
 *
 * ```ts
 * if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;   // 1.147 e 1.199 → "1.1K"
 * ```
 *
 * Abaixo de mil o mesmo componente já mostrava tudo, então a tela era
 * inconsistente consigo mesma dependendo da faixa do valor. O gestor pediu o
 * número inteiro, e duas casas sempre que houver decimal.
 *
 * ## As três regras
 *
 * - **Nunca abreviar.** Sem `K`, sem `M`, em card, tabela, tooltip e rótulo.
 * - **Decimal com duas casas.** Moeda com centavos, percentual com centésimos.
 * - **Contagem é inteira.** Leads e vendas não têm fração — `fmtInt` arredonda,
 *   e isso não contradiz o "não arredondar": não há decimal a preservar ali.
 *
 * ## O eixo dos gráficos é a exceção
 *
 * Decisão do gestor (2026-09-02): `tickFormatter` de eixo Y continua abreviando.
 * Cada tick repete o valor, e `R$ 1.234.567,89` estreita o gráfico até os
 * rótulos se sobreporem. O tooltip do mesmo gráfico mostra o valor completo —
 * é lá que se lê o número exato. Use `fmtEixo` para eixo, nunca para conteúdo.
 */

const SEM_VALOR = "—";

/** Contagem: leads, vendas, ingressos. Sem casas decimais — não há fração. */
export function fmtInt(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return SEM_VALOR;
  return val.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Dinheiro, sempre com centavos. `R$ 47.382,15` — nunca `R$ 47K`. */
export function fmtCurrency(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return SEM_VALOR;
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Percentual com duas casas. `45,67%` — nunca `46%`.
 *
 * Recebe o número já em pontos percentuais (`45.67`), não a fração (`0.4567`),
 * que é como os componentes do lançamento já calculam.
 */
export function fmtPercent(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return SEM_VALOR;
  return `${val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * **Só para `tickFormatter` de eixo de gráfico.** Mantém a abreviação que o
 * resto da tela perdeu — ver o cabeçalho deste módulo.
 *
 * Ainda sem consumidor de propósito: o AC6 da 18.73 mandou **não mexer** nos
 * eixos que já existem, e trocar a fórmula inline deles por esta mudaria o que
 * está na tela hoje (`launch-dashboard.tsx:1216` mostra `R$47382`, não
 * `R$47.4K`). Existe para que eixo NOVO não volte a inventar a própria regra —
 * que é a duplicação que esta story veio desfazer.
 */
export function fmtEixo(val: number, tipo: "currency" | "number" = "number"): string {
  if (!Number.isFinite(val)) return "";
  const prefixo = tipo === "currency" ? "R$" : "";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${prefixo}${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefixo}${(val / 1_000).toFixed(1)}K`;
  return `${prefixo}${Math.round(val)}`;
}
