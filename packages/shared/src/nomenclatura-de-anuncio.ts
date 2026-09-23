/**
 * Story 47.10 — o NOME do anúncio: como nasce e como se lê.
 * Story 47.13 — o nome de VÍDEO v2 (pedido do gestor, 15/09/2026; formato
 * combinado com o dono).
 * Story 47.16 — o nome v3 (pedido do Danilo, 23/09/2026; formato aprovado
 * pelo Lucas, decisão 5.6): hook e body SAEM do nome do vídeo (continuam
 * escolhidos, obrigatórios e gravados); a sigla `perpetuo` NÃO leva número; o
 * `--` só entra no nome quando há descrição.
 *
 *   ad · carr (4 campos):   {tipo}{NN}_{expert}_{lançamento}_{mm-aaaa}[--{descricao}]
 *                           ad07_dg_perpetuo_09-2026 · ad03_dg_pg02_09-2026--gancho-demissao
 *   adv v3 (5 campos):      {tipo}{NN}_{origem}_{expert}_{lançamento}_{mm-aaaa}[--{descricao}]
 *                           adv01_ia_dg_perpetuo_09-2026 · adv01_h_dg_pg04_09-2026
 *   adv v2 (7 campos):      {tipo}{NN}_{origem}_{expert}_{lançamento}_{hNN}_{bNN}_{mm-aaaa}[--{descricao}]
 *                           só em nome já publicado — válido com aviso próprio (47.16, PO-02); regra 6
 *   adv (4 campos):         padrão antigo (47.10) — válido com aviso; nome publicado não muda (regra 6)
 *
 *   {lançamento} = {sigla}{NN} (`pg04`) — ou só `perpetuo`, que não tem número (47.16, decisão 5.1).
 *
 * Campos estruturais separados por `_`; depois, o separador FIXO `--` e a
 * descrição livre do designer/editor (opcional). O `--` é a exceção declarada à
 * regra 1 do nome de campanha: marca onde o texto livre começa (D24), e o parse
 * quebra no PRIMEIRO `--`. Desde a 47.16 ele é OPCIONAL no parse (decisão 5.5)
 * e, no build (opção B do AC4), a `structure` — o "Copiar estrutura" do
 * designer — continua terminando em `--`, mas o `name` sem descrição termina na
 * data.
 *
 * - tipo de criativo (`ad` · `adv` · `carr`), sigla do lançamento (`pg` · `l`
 *   · `m` · `pr` · `perpetuo`) e origem do vídeo (`ia` · `h`) são valores fixos
 *   do dicionário — validados pelo snapshot, não por lista fixa;
 * - "vídeo" = valor `adv` (D-a da 47.13): é o único tipo de vídeo hoje;
 * - NN do criativo: dois dígitos, sequência ÚNICA por expert;
 * - hook `hNN` e body `bNN`: cadastrados POR EXPERT (47.12) — obrigatórios em
 *   todo `adv`, mas só o v2 os leva no nome;
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
 * Story 47.16 (decisão 5.2) — a sigla do lançamento que NÃO leva número, fixa
 * no código (não é atributo do dicionário). É o valor de `PERPETUO`
 * (`nomenclatura-de-campanha.ts`), REDECLARADO aqui porque este módulo é folha
 * e o web o importa por caminho direto: importar `PERPETUO` seria o primeiro
 * import de VALOR entre módulos do `shared` (PO-09). O teste
 * `nomenclatura-anuncio-nome.test.ts` prova que as duas constantes são iguais.
 */
export const SIGLA_SEM_NUMERO = "perpetuo";

/** `true` só para `perpetuo` — a única sigla sem número do lançamento. */
export function siglaSemNumero(launchType: string | null | undefined): boolean {
  return launchType === SIGLA_SEM_NUMERO;
}

/**
 * Story 47.12 — hook e body do vídeo, cadastrados por expert com descrição
 * (pedido do gestor, 15/09/2026). `h01` é o 1º hook DO EXPERT; `b01`, o 1º
 * body. Entraram no nome do `adv` na 47.13 e SAÍRAM dele na 47.16 — seguem
 * obrigatórios e gravados em `naming_ads`.
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

/**
 * Story 47.16 — os três formatos do nome de VÍDEO. Todo nome novo é `v3`; `v2`
 * (47.13) e `antigo` (47.10) só existem em nome já publicado, que não muda de
 * formato ao ser editado (regra 6, AC8).
 */
export type FormatoDoVideo = "v3" | "v2" | "antigo";

export type PosicaoDoAnuncio = "creative" | "origin" | "expert" | "launch" | "hook" | "body" | "date" | "description";
export type BlocoDoAnuncio = "criativo" | "origem" | "identidade" | "lancamento" | "gancho" | "data" | "descricao";

/** Ordem dos campos de `ad` · `carr` — e do vídeo do padrão antigo (4 estruturais + descrição). */
export const ORDEM_DO_ANUNCIO: readonly PosicaoDoAnuncio[] = ["creative", "expert", "launch", "date", "description"];
/** Story 47.16: ordem do vídeo v3 (5 estruturais + descrição) — hook e body saíram do nome, a origem ficou. */
export const ORDEM_DO_VIDEO: readonly PosicaoDoAnuncio[] = ["creative", "origin", "expert", "launch", "date", "description"];
/** Story 47.13: ordem do vídeo v2 (7 estruturais + descrição) — só em nome já publicado desde a 47.16. */
export const ORDEM_DO_VIDEO_V2: readonly PosicaoDoAnuncio[] = ["creative", "origin", "expert", "launch", "hook", "body", "date", "description"];
export const TOTAL_DE_CAMPOS_ESTRUTURAIS = 4;
/** Story 47.16: o vídeo v3. */
export const TOTAL_DE_CAMPOS_DO_VIDEO = 5;
/** Story 47.13: o vídeo v2. */
export const TOTAL_DE_CAMPOS_DO_VIDEO_V2 = 7;

/** A ordem dos campos do nome: `ad`/`carr` e o vídeo antigo têm 4; o vídeo v3, 5; o v2, 7. */
export function ordemDosCampos(video: boolean, formato: FormatoDoVideo = "v3"): readonly PosicaoDoAnuncio[] {
  if (!video || formato === "antigo") return ORDEM_DO_ANUNCIO;
  return formato === "v2" ? ORDEM_DO_VIDEO_V2 : ORDEM_DO_VIDEO;
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
export function posicaoDoCampo(campo: PosicaoDoAnuncio, video: boolean, formato: FormatoDoVideo = "v3"): number {
  return ordemDosCampos(video, formato).indexOf(campo) + 1;
}

/**
 * Story 47.16 (AC8) — o formato de um VÍDEO gravado, lido do `name`: v2 e v3
 * têm `hook_id`/`body_id`, então a coluna não distingue. Conta os campos antes
 * do primeiro `--` (ou do nome inteiro — o `--` é opcional). 7 = v2, 4 = padrão
 * antigo; qualquer outra contagem é v3, o formato de todo nome novo.
 */
export function formatoDoVideoGravado(name: string): FormatoDoVideo {
  const bruto = String(name ?? "");
  const corte = bruto.indexOf(SEPARADOR_DA_DESCRICAO);
  const campos = (corte < 0 ? bruto : bruto.slice(0, corte)).split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO).length;
  if (campos === TOTAL_DE_CAMPOS_DO_VIDEO_V2) return "v2";
  if (campos === TOTAL_DE_CAMPOS_ESTRUTURAIS) return "antigo";
  return "v3";
}

export interface AdFields {
  /** `ad` · `adv` · `carr` (valor de `creative_type`). */
  creativeType: string;
  /** 1–99; sai com dois dígitos. */
  creativeSeq: number;
  /** Story 47.13: só em `adv` (v3 e v2) — `ia` · `h` (valor de `creative_origin`). Proibido nos outros tipos. */
  origin?: string;
  expert: string;
  /** `pg` · `l` · `m` · `pr` · `perpetuo` (valor de `launch_type`). */
  launchType: string;
  /**
   * 1–99, sai com dois dígitos. Story 47.16 (AC1): OBRIGATÓRIO em toda sigla
   * menos `perpetuo`, em que é PROIBIDO — ausente (`undefined`/`null`) é o
   * único valor válido lá.
   */
  launchSeq?: number | null;
  /** Story 47.13: `hNN` do expert (47.12). Obrigatório no v2; no v3 é escolhido e gravado, mas não entra no nome (47.16). */
  hookCode?: string;
  /** Story 47.13: `bNN` do expert (47.12). Obrigatório no v2; no v3 é escolhido e gravado, mas não entra no nome (47.16). */
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

const temNumero = (n: number | null | undefined): n is number => n !== undefined && n !== null;

/**
 * Story 47.16 — o campo do lançamento como aparece no nome e na tela: `pg04`,
 * ou só `perpetuo` quando não há número. Nunca `perpetuonull` nem `perpetuo00`
 * (AC6) — quem desenha sigla + número usa esta função.
 */
export function textoDoLancamento(launchType: string, launchSeq: number | null | undefined): string {
  return temNumero(launchSeq) ? `${launchType}${doisDigitos(launchSeq)}` : launchType;
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

function erroDe(campo: PosicaoDoAnuncio, motivo: string, ordem: readonly PosicaoDoAnuncio[]): string {
  return `campo ${ordem.indexOf(campo) + 1} (${CAMPO_DO_ANUNCIO[campo].rotulo}): ${motivo}`;
}

function validarSeq(campo: PosicaoDoAnuncio, n: number, rotulo: string, ordem: readonly PosicaoDoAnuncio[]): void {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error(erroDe(campo, `${rotulo} tem que ser um inteiro de 1 a 99 (recebido ${n})`, ordem));
}

/** Story 47.16 (AC1): número PROIBIDO em `perpetuo`, OBRIGATÓRIO (01–99) nas outras siglas. */
function validarLancamento(launchType: string, launchSeq: number | null | undefined, ordem: readonly PosicaoDoAnuncio[]): void {
  if (siglaSemNumero(launchType)) {
    if (temNumero(launchSeq)) throw new Error(erroDe("launch", `"${SIGLA_SEM_NUMERO}" não tem número do lançamento (recebido ${launchSeq})`, ordem));
    return;
  }
  if (!temNumero(launchSeq)) throw new Error(erroDe("launch", `a sigla "${launchType}" exige o número do lançamento (01 a 99) — só "${SIGLA_SEM_NUMERO}" vai sem número`, ordem));
  validarSeq("launch", launchSeq, "NN do lançamento", ordem);
}

const vazio = (s: string | undefined): boolean => s === undefined || s === null || s.trim() === "";

/**
 * Monta a estrutura (até o `--` inclusive) e o nome. Lança com a mensagem
 * `campo N (rótulo): motivo` quando qualquer valor viola o formato — nunca
 * produz um nome que o parse não consiga ler.
 *
 * Story 47.13: fora de `adv`, origem, hook e body são PROIBIDOS — `ad` com
 * origem é nome errado, não nome "com extra".
 * Story 47.16: em `adv` v3 a origem é obrigatória e hook/body NÃO entram no
 * nome (quem os exige é o serviço e a prévia; aqui são ignorados). Sem
 * descrição, o `name` termina na data e a `structure` segue com o `--` (AC4,
 * opção B).
 *
 * `opts.formato`: RE-GRAVAR um vídeo publicado no formato em que ele nasceu
 * (`v2` ou `antigo`) ao editar descrição/lançamento/data — o nome publicado
 * não muda de formato (AC8, regra 6). Nome novo é sempre `v3` (o default).
 */
export function buildAdName(f: AdFields, opts: { formato?: FormatoDoVideo } = {}): { structure: string; name: string } {
  const formato = opts.formato ?? "v3";
  const video = ehVideo(f.creativeType);
  const ordem = ordemDosCampos(video, formato);
  const erro = (campo: PosicaoDoAnuncio, motivo: string) => new Error(erroDe(campo, motivo, ordem));
  if (!f.creativeType || !SO_LETRAS.test(f.creativeType)) throw erro("creative", `tipo "${f.creativeType}" fora de [a-z]`);
  if (formato !== "v3" && !video) throw erro("creative", `"${f.creativeType}" não tem ${formato === "v2" ? "formato v2" : "padrão antigo"} — só o vídeo (${TIPO_DE_VIDEO}) tem`);
  validarSeq("creative", f.creativeSeq, "NN do criativo", ordem);
  if (!f.expert || !VALOR_DE_CAMPO.test(f.expert)) throw erro("expert", `"${f.expert}" fora de [a-z0-9-]`);
  if (!f.launchType || !SO_LETRAS.test(f.launchType)) throw erro("launch", `sigla "${f.launchType}" fora de [a-z]`);
  validarLancamento(f.launchType, f.launchSeq, ordem);
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(f.date)) throw erro("date", `"${f.date}" não está em mm-aaaa`);
  const descricao = (f.description ?? "").trim();
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes(SEPARADOR_DA_DESCRICAO))) {
    throw erro("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`);
  }

  const comOrigem = ordem.includes("origin");
  const comGancho = ordem.includes("hook");
  if (comOrigem) {
    if (vazio(f.origin)) throw erro("origin", `obrigatória em vídeo (${TIPO_DE_VIDEO}): ia ou h`);
    if (!VALOR_FIXO.test(f.origin!)) throw erro("origin", `"${f.origin}" fora de [a-z0-9]`);
  } else if (!vazio(f.origin)) {
    throw erro("creative", video ? `origem "${f.origin}" não existe no padrão antigo (47.10)` : `origem "${f.origin}" só existe no vídeo (${TIPO_DE_VIDEO}); "${f.creativeType}" não a tem`);
  }
  if (comGancho) {
    if (vazio(f.hookCode)) throw erro("hook", `obrigatório em vídeo (${TIPO_DE_VIDEO}): hNN do expert`);
    if (!FORMATO_DO_HOOK.test(f.hookCode!)) throw erro("hook", `"${f.hookCode}" não é h + dois dígitos (ex.: h01)`);
    if (vazio(f.bodyCode)) throw erro("body", `obrigatório em vídeo (${TIPO_DE_VIDEO}): bNN do expert`);
    if (!FORMATO_DO_BODY.test(f.bodyCode!)) throw erro("body", `"${f.bodyCode}" não é b + dois dígitos (ex.: b01)`);
  } else if (!comOrigem) {
    // ad · carr · vídeo antigo: hook e body não existem. (No v3 eles existem, só não entram no nome.)
    const onde = video ? "não existe no padrão antigo (47.10)" : `só existe no vídeo (${TIPO_DE_VIDEO}); "${f.creativeType}" não o tem`;
    if (!vazio(f.hookCode)) throw erro("creative", `hook "${f.hookCode}" ${onde}`);
    if (!vazio(f.bodyCode)) throw erro("creative", `body "${f.bodyCode}" ${onde}`);
  }

  const valorDe: Record<Exclude<PosicaoDoAnuncio, "description">, string> = {
    creative: `${f.creativeType}${doisDigitos(f.creativeSeq)}`,
    origin: f.origin ?? "",
    expert: f.expert,
    launch: textoDoLancamento(f.launchType, f.launchSeq),
    hook: f.hookCode ?? "",
    body: f.bodyCode ?? "",
    date: f.date,
  };
  const estrutura = ordem
    .filter((c): c is Exclude<PosicaoDoAnuncio, "description"> => c !== "description")
    .map((c) => valorDe[c])
    .join(SEPARADOR_DE_CAMPOS_DO_ANUNCIO);
  // AC4 (opção B, Danilo 23/09): o designer recebe `…_09-2026--`; o nome só leva o `--` com descrição.
  return { structure: estrutura + SEPARADOR_DA_DESCRICAO, name: descricao ? estrutura + SEPARADOR_DA_DESCRICAO + descricao : estrutura };
}

export interface PedacoDoAnuncio {
  campo: PosicaoDoAnuncio;
  valor: string;
  bloco: BlocoDoAnuncio;
  faltando: boolean;
}

/**
 * Pedaços para a prévia, aceitando campos vazios. A descrição nunca "falta" —
 * é opcional. Com tipo `adv` a prévia tem os pedaços do formato (v3 = 5; v2 =
 * 7 ao editar um v2; antigo = 4); sem tipo escolhido, ou com `ad`/`carr`, os 4.
 *
 * Story 47.16 (PO-08): com `perpetuo` o lançamento é a sigla inteira, sem
 * número — antes o pedaço ficava "faltando" e o Salvar, desabilitado.
 */
export function pedacosDoAnuncio(f: Partial<AdFields>, opts: { formato?: FormatoDoVideo } = {}): PedacoDoAnuncio[] {
  const ordem = ordemDosCampos(ehVideo(f.creativeType), opts.formato ?? "v3");
  const creative = f.creativeType && f.creativeSeq ? `${f.creativeType}${doisDigitos(f.creativeSeq)}` : "";
  const launch = f.launchType && (siglaSemNumero(f.launchType) || f.launchSeq) ? textoDoLancamento(f.launchType, f.launchSeq) : "";
  const valorDe: Record<Exclude<PosicaoDoAnuncio, "description">, string> = {
    creative,
    origin: f.origin ?? "",
    expert: f.expert ?? "",
    launch,
    hook: f.hookCode ?? "",
    body: f.bodyCode ?? "",
    date: f.date && FORMATO_DA_DATA_DO_ANUNCIO.test(f.date) ? f.date : "",
  };
  const pedacos: PedacoDoAnuncio[] = ordem
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
  /** Story 47.16: o formato do vídeo pela contagem de campos; `null` fora de `adv` ou quando a contagem não fecha. */
  formato: FormatoDoVideo | null;
}

export const AVISO_DE_PADRAO_ANTIGO = "padrão antigo (47.10): sem origem, hook e body";
/** Story 47.16 (AC5, PO-02): o aviso PRÓPRIO do v2 — o da 47.10 ("sem origem, hook e body") seria falso num nome que os tem. */
export const AVISO_DO_V2 = "padrão v2 (47.13): hook e body no nome — o nome novo (47.16) não os leva";

/**
 * Quebra no PRIMEIRO `--` (a descrição pode ter `-`, e o `--` só aparece uma
 * vez de propósito) — ou, sem `--` (Story 47.16, decisão 5.5), lê o nome
 * inteiro como estrutura e a descrição vazia. Depois a estrutura por `_`. A
 * contagem esperada depende do campo 1 — `adv` aceita 5 (v3), 7 (v2, com
 * aviso) ou 4 (padrão antigo, com aviso); os demais, 4. Tipo, sigla e origem
 * validados contra os valores fixos; hook e body (só v2) contra o cadastro DO
 * EXPERT do nome; NN `\d{2}`, exceto em `perpetuo`, que não tem número (47.16);
 * data `mm-aaaa`.
 */
export function parseAdName(name: string, snapshot: AdSnapshot): AdParseResult {
  const bruto = String(name ?? "").trim();
  const errors: string[] = [];
  const avisos: string[] = [];
  const falha = (partes: string[], video = false, formato: FormatoDoVideo | null = null): AdParseResult => ({ valid: false, partes, errors, avisos, video, legado: formato === "antigo", formato });
  if (bruto === "") {
    errors.push("nome vazio");
    return falha([]);
  }
  if (bruto !== bruto.toLowerCase()) errors.push("o nome tem maiúscula — a convenção é toda minúscula");

  // Story 47.16 (AC4): o `--` é opcional — sem ele, a descrição é vazia (os 6 anúncios do dg no ar não o têm).
  const corte = bruto.indexOf(SEPARADOR_DA_DESCRICAO);
  const estrutura = corte < 0 ? bruto : bruto.slice(0, corte);
  const descricao = corte < 0 ? "" : bruto.slice(corte + SEPARADOR_DA_DESCRICAO.length);
  const partes = estrutura.split(SEPARADOR_DE_CAMPOS_DO_ANUNCIO);

  const mCriativo = /^([a-z]+)(\d{2})$/.exec(partes[0] ?? "");
  const video = ehVideo(mCriativo?.[1]);
  let formato: FormatoDoVideo | null = null;
  if (video) {
    if (partes.length === TOTAL_DE_CAMPOS_DO_VIDEO) formato = "v3";
    else if (partes.length === TOTAL_DE_CAMPOS_DO_VIDEO_V2) {
      formato = "v2";
      avisos.push(AVISO_DO_V2);
    } else if (partes.length === TOTAL_DE_CAMPOS_ESTRUTURAIS) {
      formato = "antigo";
      avisos.push(AVISO_DE_PADRAO_ANTIGO);
    } else {
      errors.push(`vídeo (${TIPO_DE_VIDEO}): esperados ${TOTAL_DE_CAMPOS_DO_VIDEO} campos antes do "--" (v3), ${TOTAL_DE_CAMPOS_DO_VIDEO_V2} (v2) ou ${TOTAL_DE_CAMPOS_ESTRUTURAIS} (padrão antigo), encontrados ${partes.length}`);
      return falha([...partes, descricao], true);
    }
  } else if (partes.length !== TOTAL_DE_CAMPOS_ESTRUTURAIS) {
    errors.push(`esperados ${TOTAL_DE_CAMPOS_ESTRUTURAIS - 1} separadores "_" antes do "--" (${TOTAL_DE_CAMPOS_ESTRUTURAIS} campos), encontrados ${partes.length - 1} (${partes.length} campos)`);
    return falha([...partes, descricao]);
  }
  // TS 5.5 infere predicado no filter e estreitaria `ordem`; o indexOf recebe qualquer posição.
  const ordem: readonly PosicaoDoAnuncio[] = ordemDosCampos(video, formato ?? "v3").filter((c) => c !== "description");
  const comOrigem = ordem.includes("origin");
  const comGancho = ordem.includes("hook");
  const campo = (c: PosicaoDoAnuncio): string => partes[ordem.indexOf(c)] ?? "";
  const criativo = campo("creative");
  const expert = campo("expert");
  const lancamento = campo("launch");
  const date = campo("date");
  const origem = comOrigem ? campo("origin") : "";
  const hook = comGancho ? campo("hook") : "";
  const body = comGancho ? campo("body") : "";
  const e = (c: PosicaoDoAnuncio, motivo: string) => erroDe(c, motivo, ordemDosCampos(video, formato ?? "v3"));

  if (!mCriativo) errors.push(e("creative", `"${criativo}" não é tipo + NN (ex.: adv03)`));
  // Story 47.16 (AC1): sigla só letras, número só dígitos e OPCIONAL no regex — a regra vem depois.
  const mLancamento = /^([a-z]+)(\d{2})?$/.exec(lancamento);
  if (!mLancamento) errors.push(e("launch", `"${lancamento}" não é sigla + NN (ex.: pg02) nem "${SIGLA_SEM_NUMERO}"`));
  else if (siglaSemNumero(mLancamento[1]) && mLancamento[2] !== undefined) errors.push(e("launch", `"${lancamento}": "${SIGLA_SEM_NUMERO}" não tem número do lançamento`));
  else if (!siglaSemNumero(mLancamento[1]) && mLancamento[2] === undefined) errors.push(e("launch", `"${lancamento}" não é sigla + NN (ex.: pg02) — só "${SIGLA_SEM_NUMERO}" vai sem número`));
  if (!VALOR_DE_CAMPO.test(expert)) errors.push(e("expert", `"${expert}" fora de [a-z0-9-]`));
  if (!FORMATO_DA_DATA_DO_ANUNCIO.test(date)) errors.push(e("date", `"${date}" não está em mm-aaaa`));
  if (comOrigem && !VALOR_FIXO.test(origem)) errors.push(e("origin", `"${origem}" fora de [a-z0-9]`));
  if (comGancho) {
    if (!FORMATO_DO_HOOK.test(hook)) errors.push(e("hook", `"${hook}" não é h + dois dígitos (ex.: h01)`));
    if (!FORMATO_DO_BODY.test(body)) errors.push(e("body", `"${body}" não é b + dois dígitos (ex.: b01)`));
  }
  if (descricao && (!VALOR_DE_CAMPO.test(descricao) || descricao.includes(SEPARADOR_DA_DESCRICAO))) {
    errors.push(e("description", `"${descricao}" fora de [a-z0-9-] (sem "--")`));
  }
  if (errors.length) return falha([...partes, descricao], video, formato);

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

  if (comOrigem) {
    // Origem: valor fixo. Snapshot sem `origins` = API anterior à 47.13 — avisa, não inventa.
    if (!snapshot.origins) avisos.push(e("origin", "snapshot sem origens (API anterior à 47.13) — não validada"));
    else {
      const og = snapshot.origins.find((x) => x.value === origem);
      if (!og) errors.push(e("origin", `"${origem}" não está no dicionário de origem do vídeo`));
      else if (!og.active) avisos.push(e("origin", `${origem} está inativa`));
    }
  }
  if (comGancho) {
    // Hook e body (só no v2): cadastro DO EXPERT do nome (D-d) — o h01 do DG não vale para o BBE.
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
  const launchSeq = mLancamento![2] === undefined ? null : Number(mLancamento![2]);
  if (creativeSeq < 1) errors.push(e("creative", "NN começa em 01"));
  if (launchSeq !== null && launchSeq < 1) errors.push(e("launch", "NN começa em 01"));

  const fields: AdFields = {
    creativeType,
    creativeSeq,
    ...(comOrigem ? { origin: origem } : {}),
    expert,
    launchType,
    // perpetuo: sem a chave — ausente, como origem/hook/body fora do vídeo
    ...(launchSeq === null ? {} : { launchSeq }),
    ...(comGancho ? { hookCode: hook, bodyCode: body } : {}),
    date,
    ...(descricao ? { description: descricao } : {}),
  };
  return { valid: errors.length === 0, fields: errors.length === 0 ? fields : undefined, partes: [...partes, descricao], errors, avisos, video, legado: formato === "antigo", formato };
}
