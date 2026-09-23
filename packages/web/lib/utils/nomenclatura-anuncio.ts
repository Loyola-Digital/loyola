/**
 * Story 47.10 — o que a tela de Nome Ads decide, na forma pura.
 *
 * Estado do gerador, prévia (= `buildAdName` do `shared`, a MESMA função do
 * servidor), a estrutura que o designer recebe × o nome completo, o corpo da
 * API e o `mm-aaaa` a partir de uma data. O `.tsx` só desenha.
 *
 * ⚠️ `.ts` sem JSX — o runner do web só coleta `lib/utils/**`.
 */

import {
  FORMATO_DA_DATA_DO_ANUNCIO,
  PREFIXO_DA_PARTE_DO_VIDEO,
  TIPO_DE_VIDEO,
  ehVideo,
  ROTULO_DA_PARTE_DO_VIDEO,
  SEPARADOR_DA_DESCRICAO,
  TIPOS_DE_PARTE_DO_VIDEO,
  TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO,
  buildAdName,
  formatoDoVideoGravado,
  mesAnoDe,
  pedacosDoAnuncio,
  siglaSemNumero,
  textoDoLancamento,
  type AdFields,
  type BlocoDoAnuncio,
  type FormatoDoVideo,
  type PedacoDoAnuncio,
  type TipoDeParteDoVideo,
} from "@loyola-x/shared/src/nomenclatura-de-anuncio";
import { normalizarCodigo } from "@loyola-x/shared/src/nomenclatura-codigos";

export { mesAnoDe, FORMATO_DA_DATA_DO_ANUNCIO, SEPARADOR_DA_DESCRICAO, TIPO_DE_VIDEO, ehVideo };
// Story 47.16: `perpetuo` sem número; formato do vídeo lido do nome gravado
export { siglaSemNumero, textoDoLancamento, type FormatoDoVideo };
// Story 47.12: hook e body do vídeo (cadastro por expert; entram no nome na 47.13)
export { TIPOS_DE_PARTE_DO_VIDEO, PREFIXO_DA_PARTE_DO_VIDEO, TIPO_DE_CODIGO_DA_PARTE_DO_VIDEO, ROTULO_DA_PARTE_DO_VIDEO, type TipoDeParteDoVideo };
export const PLACEHOLDER_DA_PARTE_DO_VIDEO: Record<TipoDeParteDoVideo, { code: string; description: string }> = {
  hook: { code: "h01", description: "ex.: pergunta direta — você já foi demitido depois dos 40?" },
  body: { code: "b01", description: "ex.: prova social com três depoimentos e a virada" },
};

export interface EstadoDoAnuncio {
  expertId: string;
  creativeType: string;
  /** Texto do campo (`"03"`); vazio = o servidor sugere. */
  creativeSeq: string;
  launchType: string;
  launchSeq: string;
  /** `mm-aaaa` */
  date: string;
  description: string;
  notes: string;
  /** Story 47.13: só quando o tipo é vídeo (`adv`) — valor de `creative_origin`. */
  origin: string;
  /** Story 47.13: só em vídeo — id do hook (`naming_ad_parts`) do expert escolhido. */
  hookId: string;
  /** Story 47.13: só em vídeo — id do body do expert escolhido. */
  bodyId: string;
}

export const ESTADO_VAZIO_DO_ANUNCIO: EstadoDoAnuncio = { expertId: "", creativeType: "", creativeSeq: "", launchType: "", launchSeq: "", date: "", description: "", notes: "", origin: "", hookId: "", bodyId: "" };

/**
 * Trocar o expert limpa o NN do criativo (a sequência é por expert), o NN do
 * lançamento (a sugestão é por expert+sigla) e — Story 47.13 — hook e body
 * (são do expert). Trocar o tipo para algo que não é vídeo limpa origem, hook
 * e body (AC9: somem E são limpos). O resto fica.
 */
export function aoEscolherNoAnuncio(estado: EstadoDoAnuncio, campo: keyof EstadoDoAnuncio, valor: string): EstadoDoAnuncio {
  if (estado[campo] === valor) return estado;
  const proximo = { ...estado, [campo]: valor };
  if (campo === "expertId") return { ...proximo, creativeSeq: "", launchSeq: "", hookId: "", bodyId: "" };
  if (campo === "launchType") return { ...proximo, launchSeq: "" };
  if (campo === "creativeType" && !ehVideo(valor)) return { ...proximo, origin: "", hookId: "", bodyId: "" };
  return proximo;
}

/** `"3"` → 3; `""`/inválido → undefined. */
export function nnDe(texto: string): number | undefined {
  const n = Number(texto);
  return /^\d{1,2}$/.test(texto.trim()) && n >= 1 && n <= 99 ? n : undefined;
}

/** Story 47.13: o que a prévia precisa das partes cadastradas — id → código. */
export type PartesDoExpert = { id: string; code: string }[];

/**
 * Do estado para os campos do nome; a descrição vai normalizada (mesma função
 * do servidor). Story 47.13: origem/hook/body só entram em vídeo. Story 47.16:
 * no v3 hook e body seguem nos campos (a prévia exige os dois) mas o build não
 * os põe no nome; com `perpetuo` o número do lançamento não vai (AC1).
 */
export function camposDoAnuncio(estado: EstadoDoAnuncio, experts: { id: string; code: string }[], partes: PartesDoExpert = [], opts: { formato?: FormatoDoVideo } = {}): Partial<AdFields> {
  const desc = estado.description.trim() ? normalizarCodigo(estado.description, "anuncio") : null;
  // 47.13 AC7: vídeo do padrão antigo edita como 4 campos — os três não entram nem que o estado os tenha.
  const video = ehVideo(estado.creativeType) && opts.formato !== "antigo";
  const codigo = (id: string) => partes.find((p) => p.id === id)?.code;
  return {
    creativeType: estado.creativeType || undefined,
    creativeSeq: nnDe(estado.creativeSeq),
    expert: experts.find((e) => e.id === estado.expertId)?.code,
    launchType: estado.launchType || undefined,
    launchSeq: siglaSemNumero(estado.launchType) ? undefined : nnDe(estado.launchSeq),
    date: FORMATO_DA_DATA_DO_ANUNCIO.test(estado.date) ? estado.date : undefined,
    description: desc?.ok ? desc.valor : undefined,
    ...(video ? { origin: estado.origin || undefined, hookCode: estado.hookId ? codigo(estado.hookId) : undefined, bodyCode: estado.bodyId ? codigo(estado.bodyId) : undefined } : {}),
  };
}

export interface PreviaDoAnuncio {
  pedacos: PedacoDoAnuncio[];
  /** Até o `--` inclusive — o que o designer recebe (5d). Story 47.16 (opção B): SEMPRE termina em `--`. */
  estrutura: string | null;
  /** Estrutura + descrição. Story 47.16 (AC4, opção B): sem descrição termina na data, sem o `--`. */
  nome: string | null;
  texto: string;
  tamanho: number;
  completo: boolean;
  erro: string | null;
  /** Descrição digitada mas rejeitada pela normalização (`_`, `--`, …). */
  erroDaDescricao: string | null;
  /**
   * Story 47.16 (AC3): obrigatórios que NÃO entram no nome e ainda faltam —
   * hook e body do vídeo v3. Com algum aqui, `completo` é `false` (o Salvar
   * fica bloqueado como no v2, em que eles eram pedaços do nome).
   */
  faltaForaDoNome: ("hook" | "body")[];
}

export function previaDoAnuncio(estado: EstadoDoAnuncio, experts: { id: string; code: string }[], partes: PartesDoExpert = [], opts: { formato?: FormatoDoVideo } = {}): PreviaDoAnuncio {
  const campos = camposDoAnuncio(estado, experts, partes, opts);
  const pedacos = pedacosDoAnuncio(campos, opts);
  const estruturais = pedacos.filter((p) => p.campo !== "description");
  // v3: hook e body não são pedaços do nome, mas continuam obrigatórios (47.16 AC3) — sem isto o Salvar liberaria e a API daria 422.
  const naoNoNome = ehVideo(estado.creativeType) && (opts.formato ?? "v3") === "v3";
  const faltaForaDoNome = naoNoNome ? (["hook", "body"] as const).filter((c) => !(c === "hook" ? campos.hookCode : campos.bodyCode)) : [];
  const completo = estruturais.every((p) => !p.faltando) && faltaForaDoNome.length === 0;
  const desc = estado.description.trim() ? normalizarCodigo(estado.description, "anuncio") : null;
  const erroDaDescricao = desc && !desc.ok ? desc.motivo : null;
  let estrutura: string | null = null;
  let nome: string | null = null;
  let erro: string | null = null;
  if (estruturais.every((p) => !p.faltando) && !erroDaDescricao) {
    try {
      const r = buildAdName(campos as AdFields, opts);
      estrutura = r.structure;
      nome = r.name;
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  // Fallback (incompleto) desenha o NOME como vai ficar: `--` só com descrição (47.16 AC4, opção B — PO-08).
  const texto = nome ?? estruturais.map((p) => (p.faltando ? "…" : p.valor)).join("_") + (campos.description ? SEPARADOR_DA_DESCRICAO + campos.description : "");
  return { pedacos, estrutura, nome, texto, tamanho: nome?.length ?? 0, completo: completo && nome !== null, erro, erroDaDescricao, faltaForaDoNome: [...faltaForaDoNome] };
}

/** Classes de cor por bloco — só tokens que existem em `globals.css`. */
export const CLASSE_DO_BLOCO_DO_ANUNCIO: Record<BlocoDoAnuncio, string> = {
  criativo: "text-brand",
  // Story 47.13: blocos do vídeo, distintos dos existentes (AC3)
  origem: "text-success",
  identidade: "text-foreground",
  lancamento: "text-info",
  gancho: "text-destructive",
  data: "text-warning",
  descricao: "text-muted-foreground",
};

export const LEGENDA_DO_ANUNCIO: { bloco: BlocoDoAnuncio; rotulo: string; descricao: string }[] = [
  { bloco: "criativo", rotulo: "Criativo", descricao: "tipo + NN sequencial do expert" },
  { bloco: "origem", rotulo: "Origem", descricao: "só vídeo: ia ou h" },
  { bloco: "identidade", rotulo: "Expert", descricao: "" },
  { bloco: "lancamento", rotulo: "Lançamento", descricao: "sigla + número do lançamento" },
  { bloco: "gancho", rotulo: "Hook e body", descricao: "só vídeo: hNN e bNN do expert" },
  { bloco: "data", rotulo: "Data", descricao: "mês e ano (mm-aaaa)" },
  { bloco: "descricao", rotulo: "Descrição", descricao: "livre, do designer — depois do --" },
];

/**
 * O corpo que a API espera. `creativeSeq` vazio = deixar o servidor escolher.
 * Story 47.13: origem/hook/body vão só em vídeo (null fora dele — a API recusa
 * valor). Story 47.16 (AC6): sem número do lançamento vai `null` — nunca o
 * `0` de antes (sentinela que a API recusava); com `perpetuo`, sempre `null`.
 */
export function corpoDoAnuncio(estado: EstadoDoAnuncio) {
  const video = ehVideo(estado.creativeType);
  return {
    expertId: estado.expertId,
    creativeType: estado.creativeType,
    creativeSeq: nnDe(estado.creativeSeq) ?? null,
    launchType: estado.launchType,
    launchSeq: siglaSemNumero(estado.launchType) ? null : (nnDe(estado.launchSeq) ?? null),
    date: estado.date,
    description: estado.description.trim() || null,
    notes: estado.notes.trim() || null,
    origin: video ? estado.origin || null : null,
    hookId: video ? estado.hookId || null : null,
    bodyId: video ? estado.bodyId || null : null,
  };
}

/**
 * De um anúncio gravado para o estado do gerador. `duplicar` limpa o NN (o
 * servidor sugere o próximo). Story 47.13: origem/hook/body vêm junto; um
 * vídeo do padrão antigo (sem origem) duplicado nasce com os três vazios — o
 * gerador vai exigi-los (AC10: o novo nome nasce no v2).
 */
export function estadoDeAnuncio(a: { expertId: string; creativeType: string; creativeSeq: number; launchType: string; launchSeq: number | null; adDate: string; description: string | null; notes: string | null; origin?: string | null; hookId?: string | null; bodyId?: string | null }, modo: "editar" | "duplicar"): EstadoDoAnuncio {
  return {
    expertId: a.expertId,
    creativeType: a.creativeType,
    creativeSeq: modo === "editar" ? String(a.creativeSeq).padStart(2, "0") : "",
    launchType: a.launchType,
    // Story 47.16 (AC6): `perpetuo` gravado sem número → campo vazio, nunca "null"/"00".
    launchSeq: a.launchSeq === null || a.launchSeq === undefined ? "" : String(a.launchSeq).padStart(2, "0"),
    date: mesAnoDe(a.adDate),
    description: a.description ?? "",
    notes: a.notes ?? "",
    origin: a.origin ?? "",
    hookId: a.hookId ?? "",
    bodyId: a.bodyId ?? "",
  };
}

/** Story 47.13 (AC7): vídeo gravado no formato de 4 campos — a edição não exige os três; o nome não muda de formato. */
export function ehVideoDoPadraoAntigo(a: { creativeType: string; origin?: string | null }): boolean {
  return ehVideo(a.creativeType) && !a.origin;
}

/**
 * Story 47.16 (AC8): o formato em que um anúncio GRAVADO é editado — lido do
 * `name` (v2 e v3 têm os dois hook_id). Fora do vídeo, e em anúncio novo, é
 * `v3` (o default do build, que para `ad`/`carr` não muda nada).
 */
export function formatoDoAnuncioGravado(a: { creativeType: string; name: string }): FormatoDoVideo {
  return ehVideo(a.creativeType) ? formatoDoVideoGravado(a.name) : "v3";
}

/**
 * Story 47.16 (AC7): a sigla que vai para `GET /ads/proximo` — a sugestão do
 * número do lançamento NÃO roda com `perpetuo` (não há número a sugerir).
 */
export function siglaParaSugestao(estado: Pick<EstadoDoAnuncio, "launchType">): string | undefined {
  return estado.launchType && !siglaSemNumero(estado.launchType) ? estado.launchType : undefined;
}

/**
 * Story 47.16 (AC7): aplica o número do lançamento sugerido pela API — só
 * quando o campo está vazio e a sigla TEM número. Com `perpetuo`, devolve o
 * mesmo estado (a resposta de uma sigla anterior não pode preencher o campo).
 */
export function comSugestaoDoLancamento(estado: EstadoDoAnuncio, sugerido: number | null | undefined): EstadoDoAnuncio {
  if (!sugerido || estado.launchSeq || siglaSemNumero(estado.launchType)) return estado;
  return { ...estado, launchSeq: String(sugerido).padStart(2, "0") };
}

/** Mês corrente em `mm-aaaa` (default do campo). */
export function mesCorrente(agora = new Date()): string {
  return mesAnoDe(agora);
}
