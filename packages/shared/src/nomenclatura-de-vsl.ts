/**
 * Story 47.9 — o NOME da VSL: como nasce e como se lê.
 *
 *   vsl_expert_produto_lead_problema_solucao_oferta
 *   vsl_dg_claude-negocios_lead02_pr01_sol01_of01
 *
 * Sete campos, seis `_`. O 1º é a constante `vsl` (identifica o artefato,
 * D16). Expert, produto e oferta vêm do dicionário de campanhas (a oferta É o
 * pitch — decisão do dono em 2026-09-10, D19). Lead, mecanismo do problema e
 * mecanismo da solução são as três variáveis próprias da VSL, cadastradas por
 * expert (`naming_vsl_variables`) com código **sigla + NN** sequencial por
 * expert e tipo — `lead01`, `pr01`, `sol01` — como funil e oferta (decisão do
 * dono em 2026-09-10; a descrição carrega o significado).
 *
 * Mesmo desenho de `nomenclatura-de-campanha.ts`: `buildVslName` só olha
 * formato; `parseVslName` valida contra o snapshot que recebeu (só ativos ao
 * gravar; com inativos ao validar um nome antigo — inativo é válido com
 * aviso). As oito regras da spec § 3 valem com as contagens ajustadas.
 *
 * ## Módulo folha, sem imports
 *
 * Web importa por `@loyola-x/shared/src/nomenclatura-de-vsl`; API por bare
 * import via `index.ts`. Não são intercambiáveis (Story 19.14).
 */

export const SEPARADOR_DA_VSL = "_";
export const PREFIXO_VSL = "vsl";

/** As três variáveis próprias da VSL, por expert. */
export type TipoDeVariavel = "lead" | "problem" | "solution";
export const TIPOS_DE_VARIAVEL: readonly TipoDeVariavel[] = ["lead", "problem", "solution"];
/** A sigla que abre o código de cada variável: `lead01`, `pr01`, `sol01`. */
export const PREFIXO_DA_VARIAVEL: Record<TipoDeVariavel, "lead" | "pr" | "sol"> = { lead: "lead", problem: "pr", solution: "sol" };
/** O tipo de código (para `normalizarCodigo`) de cada variável. */
export const TIPO_DE_CODIGO_DA_VARIAVEL: Record<TipoDeVariavel, "vsl-lead" | "vsl-problem" | "vsl-solution"> = { lead: "vsl-lead", problem: "vsl-problem", solution: "vsl-solution" };

/** Os seis campos que alguém ESCOLHE. A constante `vsl` não está aqui. */
export type CampoDaVsl = "expert" | "product" | "lead" | "problem" | "solution" | "offer";
export type PosicaoDaVsl = "prefix" | CampoDaVsl;

export const ORDEM_DA_VSL: readonly PosicaoDaVsl[] = ["prefix", "expert", "product", "lead", "problem", "solution", "offer"];
export const CAMPOS_DA_VSL: readonly CampoDaVsl[] = ORDEM_DA_VSL.filter((p): p is CampoDaVsl => p !== "prefix");
export const TOTAL_DE_CAMPOS_DA_VSL = ORDEM_DA_VSL.length;

export type BlocoDaVsl = "prefixo" | "identidade" | "angulo";

export const CAMPO_DA_VSL: Record<PosicaoDaVsl, { posicao: number; rotulo: string; bloco: BlocoDaVsl }> = {
  prefix: { posicao: 1, rotulo: "prefixo", bloco: "prefixo" },
  expert: { posicao: 2, rotulo: "expert", bloco: "identidade" },
  product: { posicao: 3, rotulo: "produto", bloco: "identidade" },
  lead: { posicao: 4, rotulo: "lead", bloco: "angulo" },
  problem: { posicao: 5, rotulo: "problema", bloco: "angulo" },
  solution: { posicao: 6, rotulo: "solução", bloco: "angulo" },
  offer: { posicao: 7, rotulo: "oferta", bloco: "identidade" },
};

export interface VslFields {
  expert: string;
  product: string;
  lead: string;
  problem: string;
  solution: string;
  /** `offers.code` — o pitch (D19). */
  offer: string;
}

const VALOR_DE_CAMPO = /^[a-z0-9-]+$/;

function valorDaPosicao(fields: Partial<VslFields>, posicao: PosicaoDaVsl): string | undefined {
  return posicao === "prefix" ? PREFIXO_VSL : fields[posicao];
}

/** Monta o nome. Lança `Error` nomeando o campo se algum valor estiver vazio ou fora de `[a-z0-9-]`. */
export function buildVslName(fields: VslFields): string {
  return ORDEM_DA_VSL.map((posicao) => {
    const valor = valorDaPosicao(fields, posicao);
    if (!valor) throw new Error(`campo ${CAMPO_DA_VSL[posicao].posicao} (${CAMPO_DA_VSL[posicao].rotulo}): vazio`);
    if (!VALOR_DE_CAMPO.test(valor)) {
      throw new Error(`campo ${CAMPO_DA_VSL[posicao].posicao} (${CAMPO_DA_VSL[posicao].rotulo}): "${valor}" fora de [a-z0-9-]`);
    }
    return valor;
  }).join(SEPARADOR_DA_VSL);
}

export interface PedacoDaVsl {
  campo: PosicaoDaVsl;
  valor: string;
  bloco: BlocoDaVsl;
  /** `true` quando o campo ainda não foi escolhido — a prévia mostra `…`. O prefixo nunca falta. */
  faltando: boolean;
}

/** Pedaços do nome, aceitando campos vazios (prévia parcial). Sete pedaços. */
export function pedacosDaVsl(fields: Partial<VslFields>): PedacoDaVsl[] {
  return ORDEM_DA_VSL.map((posicao) => {
    const valor = valorDaPosicao(fields, posicao) ?? "";
    return { campo: posicao, valor, bloco: CAMPO_DA_VSL[posicao].bloco, faltando: !valor };
  });
}

// ─────────────────────────── parse ───────────────────────────

export interface VslSnapshot {
  experts: { code: string; active: boolean }[];
  produtos: { expert: string; slug: string; active: boolean }[];
  ofertas: { expert: string; code: string; active: boolean }[];
  variaveis: { expert: string; type: TipoDeVariavel; code: string; active: boolean }[];
}

export interface VslParseResult {
  valid: boolean;
  fields?: VslFields;
  partes: string[];
  errors: string[];
  /** Válido, mas com valor inativo — nome antigo que continua legível (regra 4). */
  avisos: string[];
}

const erroDe = (campo: PosicaoDaVsl, motivo: string) => `campo ${CAMPO_DA_VSL[campo].posicao} (${CAMPO_DA_VSL[campo].rotulo}): ${motivo}`;

/**
 * Quebra um nome em sete campos e valida cada um contra o snapshot. Erro
 * estrutural (contagem, caractere, prefixo) interrompe antes da validação
 * semântica.
 */
export function parseVslName(name: string, snapshot: VslSnapshot): VslParseResult {
  const bruto = String(name ?? "").trim();
  const partes = bruto === "" ? [] : bruto.split(SEPARADOR_DA_VSL);
  const errors: string[] = [];
  const avisos: string[] = [];

  if (bruto === "") return { valid: false, partes, errors: ["nome vazio"], avisos };
  if (bruto !== bruto.toLowerCase()) errors.push("o nome tem maiúscula — a convenção é toda minúscula");
  if (partes.length !== TOTAL_DE_CAMPOS_DA_VSL) {
    errors.push(`esperados ${TOTAL_DE_CAMPOS_DA_VSL - 1} separadores "_" (${TOTAL_DE_CAMPOS_DA_VSL} campos), encontrados ${partes.length - 1} (${partes.length} campos)`);
    return { valid: false, partes, errors, avisos };
  }
  partes.forEach((p, i) => {
    const campo = ORDEM_DA_VSL[i];
    if (p === "") errors.push(erroDe(campo, "vazio (dois _ seguidos?)"));
    else if (!VALOR_DE_CAMPO.test(p)) errors.push(erroDe(campo, `"${p}" fora de [a-z0-9-]`));
  });
  if (errors.length) return { valid: false, partes, errors, avisos };

  const [prefix, expert, product, lead, problem, solution, offer] = partes;
  if (prefix !== PREFIXO_VSL) errors.push(erroDe("prefix", `"${prefix}" — o nome de VSL começa com "${PREFIXO_VSL}"`));

  const e = snapshot.experts.find((x) => x.code === expert);
  if (!e) errors.push(erroDe("expert", `"${expert}" não está cadastrado`));
  else if (!e.active) avisos.push(erroDe("expert", `${expert} está inativo`));

  const prod = snapshot.produtos.find((x) => x.expert === expert && x.slug === product);
  if (e && !prod) errors.push(erroDe("product", `"${product}" não está cadastrado para ${expert}`));
  else if (prod && !prod.active) avisos.push(erroDe("product", `${product} está inativo`));

  const variavel = (campo: TipoDeVariavel, valor: string) => {
    const v = snapshot.variaveis.find((x) => x.expert === expert && x.type === campo && x.code === valor);
    if (e && !v) errors.push(erroDe(campo, `"${valor}" não está cadastrado para ${expert}`));
    else if (v && !v.active) avisos.push(erroDe(campo, `${valor} está inativo`));
  };
  variavel("lead", lead);
  variavel("problem", problem);
  variavel("solution", solution);

  const of = snapshot.ofertas.find((x) => x.expert === expert && x.code === offer);
  if (e && !of) errors.push(erroDe("offer", `"${offer}" não está cadastrada para ${expert}`));
  else if (of && !of.active) avisos.push(erroDe("offer", `${offer} está inativa`));

  const fields: VslFields = { expert, product, lead, problem, solution, offer };
  return { valid: errors.length === 0, fields: errors.length === 0 ? fields : undefined, partes, errors, avisos };
}
