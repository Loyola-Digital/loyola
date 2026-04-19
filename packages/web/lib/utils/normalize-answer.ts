/**
 * Normaliza uma resposta de pesquisa pra chave de agrupamento canônica.
 *
 * Aplica: `lowercase` + `trim` + remove acentos + colapsa whitespace múltiplo.
 *
 * Com isso, as variações abaixo agrupam como **a mesma chave**:
 * - "Médico"
 * - "medico"
 * - "MEDICO"
 * - "  Médico  "
 * - "Médico " (com espaço no fim)
 *
 * Mas cuidado: **não faz fuzzy match**. Casos como "Médico(a)" vs "Médica" vs
 * "Médico Veterinário" continuam sendo chaves distintas — o que é o comportamento
 * desejado (seguro).
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Dado um grupo de respostas com a mesma chave normalizada, retorna a **versão
 * mais comum (moda)** pra usar como label na UI. Em caso de empate, retorna a
 * primeira encontrada.
 *
 * Exemplo: se 5 pessoas escreveram "Médico" e 2 escreveram "medico", o label
 * exibido é "Médico" (mais frequente).
 */
export function mostCommonRaw(rawValues: string[]): string {
  if (rawValues.length === 0) return "";
  const counts = new Map<string, number>();
  for (const raw of rawValues) {
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  let best = rawValues[0];
  let bestCount = 0;
  for (const [raw, count] of counts.entries()) {
    if (count > bestCount) {
      best = raw;
      bestCount = count;
    }
  }
  return best;
}
