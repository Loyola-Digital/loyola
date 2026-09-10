/**
 * Story 47.10 — o NOME do anúncio: como nasce e como se lê.
 *
 *   {tipo}{NN}_{expert}_{sigla}{NN}_{mm-aaaa}--{descricao}
 *   adv03_dg_pg02_09-2026--gancho-demissao
 *   adv03_dg_pg02_09-2026--                      ← a ESTRUTURA, o que o designer recebe (5d)
 *
 * Quatro campos estruturais separados por `_`, depois o separador FIXO `--`
 * e a descrição livre do designer/editor (opcional no sistema). O `--` é a
 * exceção declarada à regra 1 do nome de campanha: aqui ele marca onde o
 * texto livre começa (D24), e o parse quebra no PRIMEIRO `--`.
 *
 * - tipo de criativo (`ad` · `adv` · `carr`) e sigla do lançamento (`pg` ·
 *   `l` · `m` · `pr`) são valores fixos do dicionário (`creative_type`,
 *   `launch_type`) — validados pelo snapshot, não por lista fixa;
 * - NN do criativo: dois dígitos, sequência ÚNICA por expert (resposta do
 *   dono: o 7º criativo do DG é `07`, seja `ad`, `adv` ou `carr`);
 * - NN do lançamento: dois dígitos, o número do lançamento;
 * - data: `mm-aaaa` (resposta do dono), uma constante para build, parse e tela.
 *
 * Módulo folha, sem imports. Web importa por
 * `@loyola-x/shared/src/nomenclatura-de-anuncio`; API por bare import.
 */

export const SEPARADOR_DE_CAMPOS_DO_ANUNCIO = "_";
export const SEPARADOR_DA_DESCRICAO = "--";
/** `mm-aaaa` — mês e ano; o dia não entra (Q2). */
export const FORMATO_DA_DATA_DO_ANUNCIO = /^(0[1-9]|1[0-2])-\d{4}$/;
export const NN = /^\d{2}$/;

export type PosicaoDoAnuncio = "creative" | "expert" | "launch" | "date" | "description";
export type BlocoDoAnuncio = "criativo" | "identidade" | "lancamento" | "data" | "descricao";

export const ORDEM_DO_ANUNCIO: readonly PosicaoDoAnuncio[] = ["creative", "expert", "launch", "date", "description"];
export const TOTAL_DE_CAMPOS_ESTRUTURAIS = 4;

export const CAMPO_DO_ANUNCIO: Record<PosicaoDoAnuncio, { posicao: number; rotulo: string; bloco: BlocoDoAnuncio }> = {
  creative: { posicao: 1, rotulo: "criativo", bloco: "criativo" },
  expert: { posicao: 2, rotulo: "expert", bloco: "identidade" },
  launch: { posicao: 3, rotulo: "lançamento", bloco: "lancamento" },
  date: { posicao: 4, rotulo: "data", bloco: "data" },
  description: { posicao: 5, rotulo: "descrição", bloco: "descricao" },
};

export interface AdFields {
  /** `ad` · `adv` · `carr` (valor de `creative_type`). */
  creativeType: string;
  /** 1–99; sai com dois dígitos. */
  creativeSeq: number;
  expert: string;
  /** `pg` · `l` · `m` · `pr` (valor de `launch_type`). */
  launchType: string;
  launchSeq: number;
  /** `mm-aaaa`. */
  date: string;
  /** Opcional; `[a-z0-9-]`, já normalizada. */
  description?: string;
}

const VALOR_DE_CAMPO = /^[a-z0-9-]+$/;
const SO_LETRAS = /^[a-z]+$/;

export function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** `Date` (ou `AAAA-MM-DD`) → `mm-aaaa`, no fuso de quem chama. */
export function mesAnoDe(d: Date | string): string {
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})/.exec(d);
    return m ? `${m[2]}-${m[1]}` : "";
  }
  return `${doisDigitos(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** `mm-aaaa` → `AAAA-MM-01` (o que `naming_ads.ad_date` guarda). `null` fora do formato. */
export function primeiroDiaDoMes(mmAaaa: string): string | null {
  const m = /^(\d{2})-(\d{4})$/.exec(mmAaaa);
  if (!m || !FORMATO_DA_DATA_DO_ANUNCIO.test(mmAaaa)) return null;
  return `${m[2]}-${m[1]}-01`;
}

function erroDe(campo: PosicaoDoAnuncio, motivo: string): string {
  return `campo ${CAMPO_DO_ANUNCIO[campo].posicao} (${CAMPO_DO_ANUNCIO[campo].rotulo}): ${motivo}`;
}

function validarSeq(campo: PosicaoDoAnuncio, n: number, rotulo: string): void {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(erroDe(campo, `${rotulo} tem que ser um inteiro de 1 a 99 (recebido ${n})`));
}

/**
 * Monta `{ structure, name }`. `structure` termina no `--` (é o que o
 * designer recebe); `name` é a estrutura + descrição, ou igual à estrutura
 * quando não há descrição. Lança nomeando o campo.
 */
export function buildAdName(f: AdFields): { structure: string; name: string } {
  if (!f.creativeType || !SO_LETRAS.test(f.creativeType)) throw new Error(erroDe("creative", `tipo "${f.creativeType}" fora de [a-z]`));
  validarSeq("creative", f.creativeSeq, "NN do criativo");
  if (!f.expert || !VALOR_DE_CAMPO.test(f.expert)) throw new Error(erroDe("expert", `"${f.expert}" fora de [a-z0-9-]`));
  if (!f.launchType || !SO_LETRAS.test(f.launchType)) throw new Error(erroDe("launch", `sigla "${f.launchType}" fora de [a-z]`));
  validarSeq("launch", f.launchSeq, "NN do lançamento");
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(f.date)) throw new Error(erroDe("date", `"${f.date}" não está em mm-aaaa`));
  const descricao = (f.description ?? "").trim();
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes("--"))) {
    throw new Error(erroDe("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`));
  }
  const structure = [`${f.creativeType}${doisDigitos(f.creativeSeq)}`, f.expert, `${f.launchType}${doisDigitos(f.launchSeq)}`, f.date].join(SEPARADOR_DE_CAMPOS_DO_ANUNCIO) + SEPARADOR_DA_DESCRICAO;
  return { structure, name: structure + descricao };
}

export interface PedacoDoAnuncio {
  campo: PosicaoDoAnuncio;
  valor: string;
  bloco: BlocoDoAnuncio;
  faltando: boolean;
}

/** Pedaços para a prévia, aceitando campos vazios. A descrição nunca "falta" — é opcional. */
export function pedacosDoAnuncio(f: Partial<AdFields>): PedacoDoAnuncio[] {
  const creative = f.creativeType && f.creativeSeq ? `${f.creativeType}${doisDigitos(f.creativeSeq)}` : "";
  const launch = f.launchType && f.launchSeq ? `${f.launchType}${doisDigitos(f.launchSeq)}` : "";
  const pecas: [PosicaoDoAnuncio, string][] = [
    ["creative", creative],
    ["expert", f.expert ?? ""],
    ["launch", launch],
    ["date", f.date && FORMATO_DA_DATA_DO_ANUNCIO.test(f.date) ? f.date : ""],
  ];
  const pedacos: PedacoDoAnuncio[] = pecas.map(([campo, valor]) => ({ campo, valor, bloco: CAMPO_DO_ANUNCIO[campo].bloco, faltando: !valor }));
  pedacos.push({ campo: "description", valor: (f.description ?? "").trim(), bloco: "descricao", faltando: false });
  return pedacos;
}

// ─────────────────────────── parse ───────────────────────────

export interface AdSnapshot {
  experts: { code: string; active: boolean }[];
  creativeTypes: { value: string; active: boolean }[];
  launchTypes: { value: string; active: boolean }[];
}

export interface AdParseResult {
  valid: boolean;
  fields?: AdFields;
  /** Os quatro pedaços estruturais + a descrição (pode ser ""). */
  partes: string[];
  errors: string[];
  avisos: string[];
}

/**
 * Quebra no PRIMEIRO `--` (a descrição pode ter `-`, e o `--` só aparece uma
 * vez de propósito), depois a estrutura em exatamente quatro `_`. Tipo e
 * sigla validados contra o snapshot; NN `\d{2}`; data `mm-aaaa`.
 */
export function parseAdName(name: string, snapshot: AdSnapshot): AdParseResult {
  const bruto = String(name ?? "").trim();
  const errors: string[] = [];
  const avisos: string[] = [];
  if (bruto === "") return { valid: false, partes: [], errors: ["nome vazio"], avisos };
  if (bruto !== bruto.toLowerCase()) errors.push("o nome tem maiúscula — a convenção é toda minúscula");

  const corte = bruto.indexOf(SEPARADOR_DA_DESCRICAO);
  if (corte < 0) {
    return { valid: false, partes: bruto.split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO), errors: [...errors, `falta o separador "${SEPARADOR_DA_DESCRICAO}" entre a estrutura e a descrição`], avisos };
  }
  const estrutura = bruto.slice(0, corte);
  const descricao = bruto.slice(corte + SEPARADOR_DA_DESCRICAO.length);
  const partes = estrutura.split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO);
  if (partes.length !== TOTAL_DE_CAMPOS_ESTRUTURAIS) {
    errors.push(`esperados ${TOTAL_DE_CAMPOS_ESTRUTURAIS - 1} separadores "_" antes do "--" (${TOTAL_DE_CAMPOS_ESTRUTURAIS} campos), encontrados ${partes.length - 1} (${partes.length} campos)`);
    return { valid: false, partes: [...partes, descricao], errors, avisos };
  }
  const [criativo, expert, lancamento, date] = partes;

  const mCriativo = /^([a-z]+)(\d{2})$/.exec(criativo);
  if (!mCriativo) errors.push(erroDe("creative", `"${criativo}" não é tipo + NN (ex.: adv03)`));
  const mLancamento = /^([a-z]+)(\d{2})$/.exec(lancamento);
  if (!mLancamento) errors.push(erroDe("launch", `"${lancamento}" não é sigla + NN (ex.: pg02)`));
  if (!VALOR_DE_CAMPO.test(expert)) errors.push(erroDe("expert", `"${expert}" fora de [a-z0-9-]`));
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(date)) errors.push(erroDe("date", `"${date}" não está em mm-aaaa`));
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes(SEPARADOR_DA_DESCRICAO))) {
    errors.push(erroDe("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`));
  }
  if (errors.length) return { valid: false, partes: [...partes, descricao], errors, avisos };

  const creativeType = mCriativo![1];
  const launchType = mLancamento![1];
  const e = snapshot.experts.find((x) => x.code === expert);
  if (!e) errors.push(erroDe("expert", `"${expert}" não está cadastrado`));
  else if (!e.active) avisos.push(erroDe("expert", `${expert} está inativo`));
  const ct = snapshot.creativeTypes.find((x) => x.value === creativeType);
  if (!ct) errors.push(erroDe("creative", `tipo "${creativeType}" não está no dicionário de tipo de criativo`));
  else if (!ct.active) avisos.push(erroDe("creative", `${creativeType} está inativo`));
  const lt = snapshot.launchTypes.find((x) => x.value === launchType);
  if (!lt) errors.push(erroDe("launch", `sigla "${launchType}" não está no dicionário de sigla de lançamento`));
  else if (!lt.active) avisos.push(erroDe("launch", `${launchType} está inativa`));

  const creativeSeq = Number(mCriativo![2]);
  const launchSeq = Number(mLancamento![2]);
  if (creativeSeq < 1) errors.push(erroDe("creative", "NN começa em 01"));
  if (launchSeq < 1) errors.push(erroDe("launch", "NN começa em 01"));

  const fields: AdFields = { creativeType, creativeSeq, expert, launchType, launchSeq, date, ...(descricao ? { description: descricao } : {}) };
  return { valid: errors.length === 0, fields: errors.length === 0 ? fields : undefined, partes: [...partes, descricao], errors, avisos };
}
