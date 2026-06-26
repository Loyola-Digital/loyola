/**
 * Story 19.15 — converte a resposta de faturamento do Tally em número (BRL).
 *
 * Tolerante a formatos comuns de formulário:
 *   - número puro:        "30000"               → 30000
 *   - formatado BR:       "R$ 30.000,00"        → 30000
 *   - abreviado:          "30k" / "1,5 mi"      → 30000 / 1500000
 *   - por extenso:        "2 milhões"           → 2000000
 *   - com período:        "R$ 30.000 mensais"   → 30000  (não confunde "mensais" com escala)
 *   - faixa (intervalo):  "R$ 20.000 a 60.000"  → 20000  (piso)
 *   - faixa só c/ unidade no fim: "de 30 a 50 mil" → 30000 (escala propagada)
 *   - faixa (acima):      "Acima de 100k"       → 100000 (piso)
 *   - faixa (até):        "Até 10 mil"          → 9999   (logo abaixo do teto)
 *   - texto livre:        "faturo 50k, 3 lojas" → 50000  (ignora número sem contexto)
 *
 * Heurística de número: locale BR (ponto = milhar, vírgula = decimal), com
 * fallback p/ US quando a ordem dos separadores indica o contrário.
 */
export function parseFaturamento(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  const isAbove = /(acima|mais de|maior|superior|a partir|≥|>|\+)/.test(s);
  const isUpper = !isAbove && /(at[eé]\s|menos de|abaixo|no m[aá]ximo|m[aá]ximo de|<)/.test(s);

  // número (1.234.567,89 / 30.000 / 30,5 / 1234567) + sufixo de escala opcional.
  // O lookahead (?![\p{L}\d]) impede que o sufixo "grude" na palavra seguinte —
  // ex.: "30.000 mensais" não lê o "m" de mensais como milhão. Ordem: "milhão"
  // antes de "mil", "mi" antes de "m".
  const tokenRe = /(\d[\d.,]*)\s*(milh(?:ão|ões|oes|ao)?|mil|mm|mi|k|m)?(?![\p{L}\d])/gu;
  const tokens: { value: number; scale: number; currency: boolean }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(s)) !== null) {
    const n = parseBrNumber(match[1]);
    if (n == null) continue;
    const scale = scaleOf(match[2]);
    // contexto monetário: tem sufixo de escala OU vem logo após "R$"/"$".
    const currency = scale > 1 || /(?:r\$|\$)\s*$/.test(s.slice(0, match.index));
    tokens.push({ value: n * scale, scale, currency });
  }
  if (tokens.length === 0) return null;

  // faixa = dois números ligados por conector de intervalo (a / até / - / e / entre).
  // Permite sufixo no 1º número e "R$" antes do 2º ("60k a 90k", "20.000 a R$ 60.000").
  const isRange =
    /\d[\d.,]*\s*(?:k|milh(?:ão|ões|oes|ao)?|mil|mm|mi|m)?\s*(?:a|à|at[eé]|-|–|—|e)\s*(?:r\$\s*)?\d/u.test(s) ||
    /\bentre\b/.test(s);

  let values: number[];
  if (isRange) {
    // propaga a maior escala aos números sem sufixo (ex.: "de 30 a 50 mil" → 30 vira 30000).
    const maxScale = Math.max(...tokens.map((t) => t.scale));
    values = tokens.map((t) => (t.scale === 1 && maxScale > 1 ? t.value * maxScale : t.value));
  } else {
    // texto livre: se há valor com contexto monetário, descarta números soltos
    // (anos, qtde de lojas, etc.) que casariam como mínimo espúrio.
    const monetary = tokens.filter((t) => t.currency);
    values = (monetary.length > 0 ? monetary : tokens).map((t) => t.value);
  }

  if (isAbove) return Math.max(...values);
  if (isUpper) {
    // "até X": valor logo abaixo do teto, p/ cair na faixa [.., X) da matriz.
    const top = Math.max(...values);
    return top > 0 ? top - 1 : 0;
  }
  // faixa sem palavra-chave → piso; texto livre → maior valor monetário citado.
  return isRange ? Math.min(...values) : Math.max(...values);
}

function scaleOf(suffix: string | undefined): number {
  if (!suffix) return 1;
  if (suffix === "k" || suffix === "mil") return 1_000;
  return 1_000_000; // mm, mi, m, milhão, milhões, milhoes, milhao
}

/** Interpreta um número solto considerando ponto/vírgula como milhar ou decimal. */
function parseBrNumber(numStr: string): number | null {
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

  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}
