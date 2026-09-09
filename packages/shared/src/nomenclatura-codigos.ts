/**
 * Story 47.1 — os códigos que entram no nome da campanha do perpétuo.
 *
 * O nome é `expert_produto_funil_oferta_ano_temp_leilao_formato_lp`: nove
 * campos separados por `_`, e dentro de cada campo só `[a-z0-9-]`. Esse nome
 * viaja na URL, chega na planilha de vendas e é quebrado em nove colunas para
 * cruzar investimento com faturamento. Um `_` dentro de um campo desloca todas
 * as colunas seguintes — por isso a normalização aqui é a mesma regra nos dois
 * lados: a tela mostra o que vai ser gravado e a API decide.
 *
 * ## Módulo folha, sem imports
 *
 * Mesmo desenho de `janela-de-dias.ts` e `campaign-name.ts`, pelo mesmo motivo:
 * o webpack do Next não resolve os imports NodeNext do `index.ts`. O web
 * consome por `@loyola-x/shared/src/nomenclatura-codigos`; a API, por bare
 * import via `index.ts`. **Os dois caminhos não são intercambiáveis** — ver a
 * tabela em `packages/shared/src/index.ts` (Story 19.14).
 *
 * ⚠️ Não confundir com `campaign-name.ts` (Story 44.4): aquele agrupa nomes
 * que a Meta devolve, para histórico. Este define como o nome NASCE.
 */

/** Cada tipo de código tem o próprio formato (spec § 4). */
export type TipoDeCodigo = "expert" | "produto" | "funil" | "oferta" | "lp" | "valor";

export const FORMATO_DO_CODIGO: Record<TipoDeCodigo, { regex: RegExp; descricao: string }> = {
  expert: { regex: /^[a-z]{2,4}$/, descricao: "2 a 4 letras (ex.: bbe)" },
  produto: { regex: /^[a-z0-9-]{1,20}$/, descricao: "até 20 caracteres em [a-z0-9-] (ex.: churrasco-premium)" },
  funil: { regex: /^a\d{2}$/, descricao: "a + dois dígitos (ex.: a01)" },
  oferta: { regex: /^of\d{2}$/, descricao: "of + dois dígitos (ex.: of01)" },
  lp: { regex: /^lp[a-z]$/, descricao: "lp + uma letra (ex.: lpa)" },
  valor: { regex: /^[a-z0-9]+$/, descricao: "só letras e números (ex.: videos, 2026)" },
};

export type Normalizacao =
  | { ok: true; valor: string }
  | { ok: false; valor: string; motivo: string };

/** Remove acento sem depender de `Intl` (o módulo roda nos dois lados). */
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza a entrada e valida contra o formato do tipo (spec § 5).
 *
 * `trim` → minúsculas → sem acento → espaços viram `-`. Depois REJEITA (não
 * corrige) o que mudaria o significado: `_` dentro de um campo é o separador
 * entre campos; `--` e `-` nas pontas são erro de digitação que a planilha não
 * perdoa. Corrigir em silêncio esconderia o erro de quem digitou.
 *
 * `"Churrasco Premium"` → `churrasco-premium` · `"churrasco_premium"` → erro.
 */
export function normalizarCodigo(entrada: string, tipo: TipoDeCodigo): Normalizacao {
  const valor = semAcento(String(entrada ?? ""))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (!valor) return { ok: false, valor, motivo: "vazio" };
  if (valor.includes("_")) {
    return { ok: false, valor, motivo: '"_" separa os campos do nome; dentro de um campo use "-"' };
  }
  if (valor.includes("--")) return { ok: false, valor, motivo: '"--" não é permitido' };
  if (valor.startsWith("-") || valor.endsWith("-")) {
    return { ok: false, valor, motivo: '"-" não pode começar nem terminar o código' };
  }
  const formato = FORMATO_DO_CODIGO[tipo];
  if (!formato.regex.test(valor)) {
    return { ok: false, valor, motivo: `formato esperado: ${formato.descricao}` };
  }
  return { ok: true, valor };
}

/**
 * Slug de uma LP — a identidade pública da página (spec § 4.5).
 *
 * `{expert}-{produto}-{funil}-{oferta}-{lp}` → `bbe-churrasco-a01-of01-lpa`.
 * Gerado, nunca digitado: é a única forma de o slug bater sempre com o nome
 * da campanha que aponta para ele.
 */
export function montarSlugDeLp(partes: {
  expert: string;
  produto: string;
  funil: string;
  oferta: string;
  lp: string;
}): string {
  return [partes.expert, partes.produto, partes.funil, partes.oferta, partes.lp].join("-");
}

/**
 * Próximo código livre numa sequência `prefixo + NN` (funil `a01…a99`,
 * oferta `of01…of99`).
 *
 * O menor buraco, e não "o maior + 1": a lista recebida INCLUI inativos (regra
 * 4 da spec — código não se reaproveita), então não há buraco a preencher por
 * exclusão; o menor livre é o próximo mesmo. Devolve `null` quando os 99
 * acabaram — é caso para reportar, não para inventar um `a100` que quebra o
 * formato.
 */
export function proximoCodigoNumerado(prefixo: "a" | "of", existentes: readonly string[]): string | null {
  const usados = new Set(existentes.map((c) => c.toLowerCase()));
  for (let n = 1; n <= 99; n++) {
    const candidato = `${prefixo}${String(n).padStart(2, "0")}`;
    if (!usados.has(candidato)) return candidato;
  }
  return null;
}

/** Próxima letra livre para LP (`lpa`, `lpb`, …). `null` depois de `lpz`. */
export function proximoCodigoDeLp(existentes: readonly string[]): string | null {
  const usados = new Set(existentes.map((c) => c.toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const candidato = `lp${String.fromCharCode(97 + i)}`;
    if (!usados.has(candidato)) return candidato;
  }
  return null;
}
