/**
 * Story 47.10 — o NOME do anúncio: como nasce e como se lê.
 * Story 47.13 — o nome de VÍDEO v2 (pedido do gestor, 15/09/2026; formato
 * combinado com o dono).
 *
 *   ad · carr (4 campos):   {tipo}{NN}_{expert}_{sigla}{NN}_{mm-aaaa}--{descricao}
 *                           ad03_dg_pg02_09-2026--gancho-demissao
 *   adv (7 campos, v2):     {tipo}{NN}_{origem}_{expert}_{sigla}{NN}_{hNN}_{bNN}_{mm-aaaa}--{descricao}
 *                           adv01_h_dg_pg04_h01_b01_09-2026--        ← o exemplo do pedido, literal
 *   adv (4 campos):         padrão antigo (47.10) — válido com aviso; nome publicado não muda (regra 6)
 *
 * Campos estruturais separados por `_`, depois o separador FIXO `--` e a
 * descrição livre do designer/editor (opcional no sistema). O `--` é a exceção
 * declarada à regra 1 do nome de campanha: aqui ele marca onde o texto livre
 * começa (D24), e o parse quebra no PRIMEIRO `--`.
 *
 * - tipo de criativo (`ad` · `adv` · `carr`), sigla do lançamento (`pg` · `l`
 *   · `m` · `pr`) e origem do vídeo (`ia` · `h`) são valores fixos do
 *   dicionário — validados pelo snapshot, não por lista fixa;
 * - "vídeo" = valor `adv` (D-a da 47.13): é o único tipo de vídeo hoje;
 * - NN do criativo: dois dígitos, sequência ÚNICA por expert;
 * - hook `hNN` e body `bNN`: cadastrados POR EXPERT (47.12) — o `h01` do DG
 *   não vale para o BBE; obrigatórios em todo `adv` (P3);
 * - data: `mm-aaaa`, uma constante para build, parse e tela.
 *
 * Módulo folha, sem imports. Web importa por
 * `@loyola-x/shared/src/nomenclatura-de-anuncio`; API por bare import.
 */

export const SEPARADOR_DE_CAMPOS_DO_ANUNCIO = "_";
export const SEPARADOR_DA_DESCRICAO = "--";
/** `mm-aaaa` — mês e ano; o dia não entra (Q2). */
export const FORMATO_DA_DATA_DO_ANUNCIO = /^(0[1-9]|1[0-2])-\d{4}$/;
export const NN = /^\d{2}$/;

/**
 * Story 47.12 — hook e body do vídeo, cadastrados por expert com descrição
 * (pedido do gestor, 15/09/2026). `h01` é o 1º hook DO EXPERT; `b01`, o 1º
 * body. Entram no nome do `adv` na 47.13. Mesmo desenho das variáveis de VSL.
 */
export type TipoDeParteDoVideo = "hook" | "body";
export const TIPOS_DE_PARTE_DO_VIDEO: readonly TipoDeParteDoVideo[] = ["hook", "body"];
export const PREFIXO_DA_PARTE_DO_VIDEO: Record<TipoDeParteDoVideo, "h" | "b"> = { hook: "h", body: "b" };
/** O tipo de código (para `normalizarCodigo`) de cada parte. */
export const TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO: Record<TipoDeParteDoVideo, "ad-hook" | "ad-body"> = { hook: "ad-hook", body: "ad-body" };
export const ROTULO_DA_PARTE_DO_VIDEO: Record<TipoDeParteDoVideo, string> = { hook: "Hook", body: "Body" };
export const FORMATO_DO_HOOK = /^h\d{2}$/;
export const FORMATO_DO_BODY = /^b\d{2}$/;

/** Story 47.13 (D-a): "vídeo" é o VALOR `adv` do dicionário — regra pelo valor, não por flag. */
export const TIPO_DE_VIDEO = "adv";
export function ehVideo(creativeType: string | null | undefined): boolean {
  return creativeType === TIPO_DE_VIDEO;
}

export type PosicaoDoAnuncio = "creative" | "origin" | "expert" | "launch" | "hook" | "body" | "date" | "description";
export type BlocoDoAnuncio = "criativo" | "origem" | "identidade" | "lancamento" | "gancho" | "data" | "descricao";

/** Ordem dos campos de `ad` · `carr` (4 estruturais + descrição). */
export const ORDEM_DO_ANUNCIO: readonly PosicaoDoAnuncio[] = ["creative", "expert", "launch", "date", "description"];
/** Story 47.13: ordem dos campos do vídeo v2 (7 estruturais + descrição) — a do exemplo do pedido, literal. */
export const ORDEM_DO_VIDEO: readonly PosicaoDoAnuncio[] = ["creative", "origin", "expert", "launch", "hook", "body", "date", "description"];
export const TOTAL_DE_CAMPOS_ESTRUTURAIS = 4;
export const TOTAL_DE_CAMPOS_DO_VIDEO = 7;

export function ordemDosCampos(video: boolean): readonly PosicaoDoAnuncio[] {
  return video ? ORDEM_DO_VIDEO : ORDEM_DO_ANUNCIO;
}

export const CAMPO_DO_ANUNCIO: Record<PosicaoDoAnuncio, { rotulo: string; bloco: BlocoDoAnuncio }> = {
  creative: { rotulo: "criativo", bloco: "criativo" },
  origin: { rotulo: "origem", bloco: "origem" },
  expert: { rotulo: "expert", bloco: "identidade" },
  launch: { rotulo: "lançamento", bloco: "lancamento" },
  hook: { rotulo: "hook", bloco: "gancho" },
  body: { rotulo: "body", bloco: "gancho" },
  date: { rotulo: "data", bloco: "data" },
  description: { rotulo: "descrição", bloco: "descricao" },
};

/** Posição (1-based) do campo na ordem do tipo — o número que aparece em `campo N (rótulo): motivo`. */
export function posicaoDoCampo(campo: PosicaoDoAnuncio, video: boolean): number {
  return ordemDosCampos(video).indexOf(campo) + 1;
}

export interface AdFields {
  /** `ad` · `adv` · `carr` (valor de `creative_type`). */
  creativeType: string;
  /** 1–99; sai com dois dígitos. */
  creativeSeq: number;
  /** Story 47.13: só em `adv` — `ia` · `h` (valor de `creative_origin`). Proibido nos outros tipos. */
  origin?: string;
  expert: string;
  /** `pg` · `l` · `m` · `pr` (valor de `launch_type`). */
  launchType: string;
  launchSeq: number;
  /** Story 47.13: só em `adv` — `hNN` do expert (47.12). */
  hookCode?: string;
  /** Story 47.13: só em `adv` — `bNN` do expert (47.12). */
  bodyCode?: string;
  /** `mm-aaaa`. */
  date: string;
  /** Opcional; `[a-z0-9-]`, já normalizada. */
  description?: string;
}

const VALOR_DE_CAMPO = /^[a-z0-9-]+$/;
const SO_LETRAS = /^[a-z]+$/;
const VALOR_FIXO = /^[a-z0-9]+$/;

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

function erroDe(campo: PosicaoDoAnuncio, motivo: string, video: boolean): string {
  return `campo ${posicaoDoCampo(campo, video)} (${CAMPO_DO_ANUNCIO[campo].rotulo}): ${motivo}`;
}

function validarSeq(campo: PosicaoDoAnuncio, n: number, rotulo: string, video: boolean): void {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(erroDe(campo, `${rotulo} tem que ser um inteiro de 1 a 99 (recebido ${n})`, video));
}

const vazio = (s: string | undefined): boolean => s === undefined || s === null || s.trim() === "";

/**
 * Monta a estrutura (até o `--` inclusive) e o nome completo. Lança com a
 * mensagem `campo N (rótulo): motivo` quando qualquer valor viola o formato —
 * nunca produz um nome que o parse não consiga ler.
 *
 * Story 47.13: em `adv`, origem, hook e body são OBRIGATÓRIOS; fora de `adv`
 * são PROIBIDOS — `ad` com origem é nome errado, não nome "com extra" (AC1).
 *
 * `opts.legado`: RE-GRAVAR um vídeo do padrão antigo (4 campos) ao editar
 * descrição/lançamento/data — o nome publicado não muda de formato (AC7,
 * regra 6). Nunca para nome novo: o gerador não passa por aqui com `legado`.
 */
export function buildAdName(f: AdFields, opts: { legado?: boolean } = {}): { structure: string; name: string } {
  const video = ehVideo(f.creativeType) && !opts.legado;
  if (!f.creativeType || !SO_LETRAS.test(f.creativeType)) throw new Error(erroDe("creative", `tipo "${f.creativeType}" fora de [a-z]`, video));
  validarSeq("creative", f.creativeSeq, "NN do criativo", video);
  if (!f.expert || !VALOR_DE_CAMPO.test(f.expert)) throw new Error(erroDe("expert", `"${f.expert}" fora de [a-z0-9-]`, video));
  if (!f.launchType || !SO_LETRAS.test(f.launchType)) throw new Error(erroDe("launch", `sigla "${f.launchType}" fora de [a-z]`, video));
  validarSeq("launch", f.launchSeq, "NN do lançamento", video);
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(f.date)) throw new Error(erroDe("date", `"${f.date}" não está em mm-aaaa`, video));
  const descricao = (f.description ?? "").trim();
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes("--"))) {
    throw new Error(erroDe("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`, video));
  }

  let estruturais: string[];
  if (video) {
    if (vazio(f.origin)) throw new Error(erroDe("origin", `obrigatória em vídeo (${TIPO_DE_VIDEO}): ia ou h`, video));
    if (!VALOR_FIXO.test(f.origin!)) throw new Error(erroDe("origin", `"${f.origin}" fora de [a-z0-9]`, video));
    if (vazio(f.hookCode)) throw new Error(erroDe("hook", `obrigatório em vídeo (${TIPO_DE_VIDEO}): hNN do expert`, video));
    if (!FORMATO_DO_HOOK.test(f.hookCode!)) throw new Error(erroDe("hook", `"${f.hookCode}" não é h + dois dígitos (ex.: h01)`, video));
    if (vazio(f.bodyCode)) throw new Error(erroDe("body", `obrigatório em vídeo (${TIPO_DE_VIDEO}): bNN do expert`, video));
    if (!FORMATO_DO_BODY.test(f.bodyCode!)) throw new Error(erroDe("body", `"${f.bodyCode}" não é b + dois dígitos (ex.: b01)`, video));
    estruturais = [`${f.creativeType}${doisDigitos(f.creativeSeq)}`, f.origin!, f.expert, `${f.launchType}${doisDigitos(f.launchSeq)}`, f.hookCode!, f.bodyCode!, f.date];
  } else {
    if (opts.legado && !ehVideo(f.creativeType)) throw new Error(erroDe("creative", `"${f.creativeType}" não tem padrão antigo — só o vídeo (${TIPO_DE_VIDEO}) tem`, video));
    if (!vazio(f.origin)) throw new Error(erroDe("creative", `origem "${f.origin}" só existe no vídeo (${TIPO_DE_VIDEO}); "${f.creativeType}" não a tem`, video));
    if (!vazio(f.hookCode)) throw new Error(erroDe("creative", `hook "${f.hookCode}" só existe no vídeo (${TIPO_DE_VIDEO}); "${f.creativeType}" não o tem`, video));
    if (!vazio(f.bodyCode)) throw new Error(erroDe("creative", `body "${f.bodyCode}" só existe no vídeo (${TIPO_DE_VIDEO}); "${f.creativeType}" não o tem`, video));
    estruturais = [`${f.creativeType}${doisDigitos(f.creativeSeq)}`, f.expert, `${f.launchType}${doisDigitos(f.launchSeq)}`, f.date];
  }
  const structure = estruturais.join(SEPARADOR_DE_CAMPOS_DO_ANUNCIO) + SEPARADOR_DA_DESCRICAO;
  return { structure, name: structure + descricao };
}

export interface PedacoDoAnuncio {
  campo: PosicaoDoAnuncio;
  valor: string;
  bloco: BlocoDoAnuncio;
  faltando: boolean;
}

/**
 * Pedaços para a prévia, aceitando campos vazios. A descrição nunca "falta" —
 * é opcional. Story 47.13: com tipo `adv` a prévia tem os 7 pedaços; sem tipo
 * escolhido, ou com `ad`/`carr`, os 4. `opts.legado`: vídeo do padrão antigo
 * sendo editado — 4 pedaços (AC7), como o build.
 */
export function pedacosDoAnuncio(f: Partial<AdFields>, opts: { legado?: boolean } = {}): PedacoDoAnuncio[] {
  const video = ehVideo(f.creativeType) && !opts.legado;
  const creative = f.creativeType && f.creativeSeq ? `${f.creativeType}${doisDigitos(f.creativeSeq)}` : "";
  const launch = f.launchType && f.launchSeq ? `${f.launchType}${doisDigitos(f.launchSeq)}` : "";
  const valorDe: Record<Exclude<PosicaoDoAnuncio, "description">, string> = {
    creative,
    origin: f.origin ?? "",
    expert: f.expert ?? "",
    launch,
    hook: f.hookCode ?? "",
    body: f.bodyCode ?? "",
    date: f.date && FORMATO_DA_DATA_DO_ANUNCIO.test(f.date) ? f.date : "",
  };
  const pedacos: PedacoDoAnuncio[] = ordemDosCampos(video)
    .filter((c): c is Exclude<PosicaoDoAnuncio, "description"> => c !== "description")
    .map((campo) => ({ campo, valor: valorDe[campo], bloco: CAMPO_DO_ANUNCIO[campo].bloco, faltando: !valorDe[campo] }));
  pedacos.push({ campo: "description", valor: (f.description ?? "").trim(), bloco: "descricao", faltando: false });
  return pedacos;
}

// ─────────────────────────── parse ───────────────────────────

export interface AdSnapshot {
  experts: { code: string; active: boolean }[];
  creativeTypes: { value: string; active: boolean }[];
  launchTypes: { value: string; active: boolean }[];
  /** Story 47.13: `ia` · `h`. Ausente = API anterior à 47.13 (o parse avisa em vez de inventar). */
  origins?: { value: string; active: boolean }[];
  /** Story 47.13: hooks e bodies POR EXPERT (código do expert, não id). Ausente = API anterior. */
  partes?: { expert: string; type: TipoDeParteDoVideo; code: string; active: boolean }[];
}

export interface AdParseResult {
  valid: boolean;
  fields?: AdFields;
  /** Os pedaços estruturais + a descrição (pode ser ""). */
  partes: string[];
  errors: string[];
  avisos: string[];
  /** Story 47.13: `true` quando o campo 1 é `adv`. */
  video: boolean;
  /** Story 47.13: `adv` no formato de 4 campos (47.10) — válido com aviso, nunca convertido (regra 6). */
  legado: boolean;
}

export const AVISO_DE_PADRAO_ANTIGO = "padrão antigo (47.10): sem origem, hook e body";

/**
 * Quebra no PRIMEIRO `--` (a descrição pode ter `-`, e o `--` só aparece uma
 * vez de propósito), depois a estrutura por `_`. Story 47.13: a contagem
 * esperada depende do campo 1 — `adv` aceita 7 (v2) ou 4 (padrão antigo, com
 * aviso); os demais, 4. Tipo, sigla e origem validados contra os valores
 * fixos; hook e body contra o cadastro DO EXPERT do nome; NN `\d{2}`; data
 * `mm-aaaa`.
 */
export function parseAdName(name: string, snapshot: AdSnapshot): AdParseResult {
  const bruto = String(name ?? "").trim();
  const errors: string[] = [];
  const avisos: string[] = [];
  const falha = (partes: string[], video = false, legado = false): AdParseResult => ({ valid: false, partes, errors, avisos, video, legado });
  if (bruto === "") {
    errors.push("nome vazio");
    return falha([]);
  }
  if (bruto !== bruto.toLowerCase()) errors.push("o nome tem maiúscula — a convenção é toda minúscula");

  const corte = bruto.indexOf(SEPARADOR_DA_DESCRICAO);
  if (corte < 0) {
    errors.push(`falta o separador "${SEPARADOR_DA_DESCRICAO}" entre a estrutura e a descrição`);
    return falha(bruto.split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO));
  }
  const estrutura = bruto.slice(0, corte);
  const descricao = bruto.slice(corte + SEPARADOR_DA_DESCRICAO.length);
  const partes = estrutura.split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO);

  const mCriativo = /^([a-z]+)(\d{2})$/.exec(partes[0] ?? "");
  const video = ehVideo(mCriativo?.[1]);
  let legado = false;
  if (video) {
    if (partes.length === TOTAL_DE_CAMPOS_DO_VIDEO) {
      // v2
    } else if (partes.length === TOTAL_DE_CAMPOS_ESTRUTURAIS) {
      legado = true;
      avisos.push(AVISO_DE_PADRAO_ANTIGO);
    } else {
      errors.push(`vídeo (${TIPO_DE_VIDEO}): esperados ${TOTAL_DE_CAMPOS_DO_VIDEO} campos antes do "--" (v2) ou ${TOTAL_DE_CAMPOS_ESTRUTURAIS} (padrão antigo), encontrados ${partes.length}`);
      return falha([...partes, descricao], true);
    }
  } else if (partes.length !== TOTAL_DE_CAMPOS_ESTRUTURAIS) {
    errors.push(`esperados ${TOTAL_DE_CAMPOS_ESTRUTURAIS - 1} separadores "_" antes do "--" (${TOTAL_DE_CAMPOS_ESTRUTURAIS} campos), encontrados ${partes.length - 1} (${partes.length} campos)`);
    return falha([...partes, descricao]);
  }
  const v2 = video && !legado;
  // TS 5.5 infere predicado no filter e estreitaria `ordem`; o indexOf recebe qualquer posição.
  const ordem: readonly PosicaoDoAnuncio[] = ordemDosCampos(v2).filter((c) => c !== "description");
  const campo = (c: PosicaoDoAnuncio): string => partes[ordem.indexOf(c)] ?? "";
  const criativo = campo("creative");
  const expert = campo("expert");
  const lancamento = campo("launch");
  const date = campo("date");
  const origem = v2 ? campo("origin") : "";
  const hook = v2 ? campo("hook") : "";
  const body = v2 ? campo("body") : "";
  const e = (c: PosicaoDoAnuncio, motivo: string) => erroDe(c, motivo, v2);

  if (!mCriativo) errors.push(e("creative", `"${criativo}" não é tipo + NN (ex.: adv03)`));
  const mLancamento = /^([a-z]+)(\d{2})$/.exec(lancamento);
  if (!mLancamento) errors.push(e("launch", `"${lancamento}" não é sigla + NN (ex.: pg02)`));
  if (!VALOR_DE_CAMPO.test(expert)) errors.push(e("expert", `"${expert}" fora de [a-z0-9-]`));
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(date)) errors.push(e("date", `"${date}" não está em mm-aaaa`));
  if (v2) {
    if (!VALOR_FIXO.test(origem)) errors.push(e("origin", `"${origem}" fora de [a-z0-9]`));
    if (!FORMATO_DO_HOOK.test(hook)) errors.push(e("hook", `"${hook}" não é h + dois dígitos (ex.: h01)`));
    if (!FORMATO_DO_BODY.test(body)) errors.push(e("body", `"${body}" não é b + dois dígitos (ex.: b01)`));
  }
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes(SEPARADOR_DA_DESCRICAO))) {
    errors.push(e("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`));
  }
  if (errors.length) return falha([...partes, descricao], video, legado);

  const creativeType = mCriativo![1];
  const launchType = mLancamento![1];
  const ex = snapshot.experts.find((x) => x.code === expert);
  if (!ex) errors.push(e("expert", `"${expert}" não está cadastrado`));
  else if (!ex.active) avisos.push(e("expert", `${expert} está inativo`));
  const ct = snapshot.creativeTypes.find((x) => x.value === creativeType);
  if (!ct) errors.push(e("creative", `tipo "${creativeType}" não está no dicionário de tipo de criativo`));
  else if (!ct.active) avisos.push(e("creative", `${creativeType} está inativo`));
  const lt = snapshot.launchTypes.find((x) => x.value === launchType);
  if (!lt) errors.push(e("launch", `sigla "${launchType}" não está no dicionário de sigla de lançamento`));
  else if (!lt.active) avisos.push(e("launch", `${launchType} está inativa`));

  if (v2) {
    // Origem: valor fixo. Snapshot sem `origins` = API anterior à 47.13 — avisa, não inventa.
    if (!snapshot.origins) avisos.push(e("origin", "snapshot sem origens (API anterior à 47.13) — não validada"));
    else {
      const og = snapshot.origins.find((x) => x.value === origem);
      if (!og) errors.push(e("origin", `"${origem}" não está no dicionário de origem do vídeo`));
      else if (!og.active) avisos.push(e("origin", `${origem} está inativa`));
    }
    // Hook e body: cadastro DO EXPERT do nome (D-d) — o h01 do DG não vale para o BBE.
    if (!snapshot.partes) avisos.push(e("hook", "snapshot sem hooks/bodies (API anterior à 47.13) — não validados"));
    else {
      const h = snapshot.partes.find((p) => p.expert === expert && p.type === "hook" && p.code === hook);
      if (!h) errors.push(e("hook", `${hook} não está cadastrado para ${expert}`));
      else if (!h.active) avisos.push(e("hook", `${hook} está inativo`));
      const b = snapshot.partes.find((p) => p.expert === expert && p.type === "body" && p.code === body);
      if (!b) errors.push(e("body", `${body} não está cadastrado para ${expert}`));
      else if (!b.active) avisos.push(e("body", `${body} está inativo`));
    }
  }

  const creativeSeq = Number(mCriativo![2]);
  const launchSeq = Number(mLancamento![2]);
  if (creativeSeq < 1) errors.push(e("creative", "NN começa em 01"));
  if (launchSeq < 1) errors.push(e("launch", "NN começa em 01"));

  const fields: AdFields = {
    creativeType,
    creativeSeq,
    ...(v2 ? { origin: origem } : {}),
    expert,
    launchType,
    launchSeq,
    ...(v2 ? { hookCode: hook, bodyCode: body } : {}),
    date,
    ...(descricao ? { description: descricao } : {}),
  };
  return { valid: errors.length === 0, fields: errors.length === 0 ? fields : undefined, partes: [...partes, descricao], errors, avisos, video, legado };
}
