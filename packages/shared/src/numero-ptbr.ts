/**
 * Número vindo de célula de planilha, em pt-BR ou en-US.
 *
 * ## Por que existe
 *
 * Três rotas da API traziam a própria versão disto, e as três estavam erradas
 * do mesmo jeito:
 *
 * ```ts
 * val.replace(/[^\d.,]/g, "").replace(",", ".")   // ← o bug
 * ```
 *
 * `.replace(",", ".")` troca **só a primeira** vírgula e deixa o ponto de
 * milhar na string; `parseFloat` então para no segundo ponto:
 *
 * ```
 * "797,00"    → "797.00"    → 797       ✅
 * "1.097,00"  → "1.097.00"  → 1.097     ❌ deveria ser 1097
 * "12.345,67" → "12.345.67" → 12.345    ❌ deveria ser 12345.67
 * ```
 *
 * Toda venda a partir de R$ 1.000 virava aproximadamente um milésimo do valor.
 * Abaixo de mil funcionava — e foi por isso que ficou invisível. No
 * `bbe-pr2-ago-26`, o faturamento por criativo aparecia como R$ 805,78 onde o
 * correto era R$ 9.573,00, e o ROAS derivado errava junto.
 *
 * ## De onde veio a regra
 *
 * O corpo abaixo é o `parseBrNumber` de `api/src/services/parse-faturamento.ts`,
 * que já era a implementação certa e completa do repo — extraída aqui em vez de
 * uma quarta versão ser escrita. Outras ~12 chamadas espalhadas pela API também
 * acertam, porque removem TODOS os pontos antes (`replace(/\./g, "")`); o que
 * faltava era um lugar só para a regra morar.
 *
 * ## Módulo folha, de propósito
 *
 * Sem nenhum import — mesmo desenho de `utm-value.ts` e `stage-types.ts`. Ver a
 * tabela de import em `index.ts`: web por subpath, API pelo índice.
 */

/**
 * Interpreta um número solto decidindo se ponto e vírgula são milhar ou decimal.
 * Devolve `null` quando não dá para ler um número.
 *
 * | entrada | saída | regra |
 * |---|---|---|
 * | `1.234,56` | `1234.56` | ambos: o **último** separador é o decimal (BR) |
 * | `1,234.56` | `1234.56` | ambos, ponto por último (US) |
 * | `30,5` | `30.5` | uma vírgula só = decimal |
 * | `1,000,000` | `1000000` | várias vírgulas = milhar US |
 * | `1.234.567` | `1234567` | vários pontos = milhar |
 * | `30.000` | `30000` | um ponto + 3 dígitos = milhar |
 * | `30.50` | `30.5` | um ponto + 2 dígitos = decimal |
 * | `797` | `797` | — |
 */
export function parseNumeroPtBr(numStr: string): number | null {
  const commas = (numStr.match(/,/g) || []).length;
  const dots = (numStr.match(/\./g) || []).length;
  let normalized = numStr;

  if (commas > 0 && dots > 0) {
    // ambos presentes → o ÚLTIMO separador é o decimal
    if (numStr.lastIndexOf(",") > numStr.lastIndexOf(".")) {
      normalized = numStr.replace(/\./g, "").replace(",", "."); // BR: 1.234,56
    } else {
      normalized = numStr.replace(/,/g, ""); // US: 1,234.56
    }
  } else if (commas > 0) {
    // só vírgula: 1 vírgula = decimal BR (30,5); várias = milhar US (1,000,000)
    normalized = commas > 1 ? numStr.replace(/,/g, "") : numStr.replace(",", ".");
  } else if (dots > 0) {
    // só ponto: milhar BR (30.000 / 1.234.567) vs decimal US (30.50)
    const parts = numStr.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || last.length === 3) {
      normalized = numStr.replace(/\./g, ""); // milhar
    }
  }

  if (normalized.trim() === "") return null;
  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}

/**
 * Valor monetário de uma célula de planilha. Tira `R$`, espaço e o que mais
 * vier junto, e devolve `0` quando não há número — que é o contrato que os
 * chamadores já esperavam (`parseFloat(...) || 0`).
 *
 * ⚠️ O sinal negativo é descartado, como no comportamento anterior: o
 * `[^\d.,]` original também removia o `-`. Preservar sinal mudaria o valor de
 * eventuais estornos na tela e merece decisão própria — não entrou aqui.
 */
export function parseValorPlanilha(val: string | null | undefined): number {
  if (val == null) return 0;
  const limpo = String(val).replace(/[^\d.,]/g, "");
  if (!limpo) return 0;
  return parseNumeroPtBr(limpo) ?? 0;
}
