/**
 * Leitura de célula de planilha: dinheiro em pt-BR e data.
 *
 * Mora aqui porque o mesmo par existia copiado em `public-sales-rows.ts`,
 * `cross-launch-sync.ts` e `launch-report-loader.ts` — e divergir em QUAL
 * separador é decimal não quebra nada visivelmente: devolve outro número. As
 * duas primeiras cópias agora importam daqui; a do launch-report ficou de fora
 * porque trata o caso dela (coluna de valor já normalizada pelo loader).
 */

/**
 * "R$ 1.234,56" → 1234.56; "1234.56" → 1234.56.
 *
 * A vírgula é o sinal de que o ponto é separador de milhar — sem ela, ponto é
 * decimal (é assim que o n8n grava). Célula vazia ou texto puro vira 0, nunca
 * NaN: um NaN se propaga por toda soma e só aparece na tela.
 */
export function parseNumberBr(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return parseFloat(normalized) || 0;
}

/** Data da célula como `aaaa-mm-dd` (aceita dd/mm/aaaa e ISO). `null` se não reconhecer. */
export function parseDateIso(val: string | undefined): string | null {
  if (!val) return null;
  const t = val.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}
