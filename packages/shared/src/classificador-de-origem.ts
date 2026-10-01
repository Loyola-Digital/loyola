/**
 * Story 49.2 — o classificador ÚNICO de origem do comprador (debriefing).
 *
 * ## Por que existe
 *
 * A skill `loyola-debriefing` exige que Closer e Sem-track saiam idênticos em
 * todas as tabelas (armadilha #9: "Closer aparecia 19 num lugar e 22 noutro").
 * No produto já convivem três regras de origem (`classifyOrigem`,
 * `classifyCanal`, a do journey de vendas) e nenhuma faz o que o debriefing
 * pede: UTM do lead com fallback na UTM da venda, Closer vindo da config do
 * projeto, e um "Sem track real" que só vale quando lead E venda não têm UTM
 * (armadilha #5: o "Sem Track" olhando só o lead dava 31 no PG02; o real é 10).
 *
 * Esta é a regra. Os motores do debriefing (49.3, 49.4) chamam SÓ
 * `classificarOrigem` — e o `CLASSIFICADOR_VERSAO` vai no payload para a
 * guarda F6 (49.5) provar que as duas metades usaram a mesma.
 *
 * ## Dois eixos que nunca se somam (decisão 3 do dono, 2026-09-30)
 *
 * - **Aquisição** (`canal`): de onde o comprador veio. UTM do lead primeiro;
 *   a da venda só quando o lead não tem nenhuma UTM de aquisição.
 * - **Fechamento** (`fechamento`): se um closer fechou a venda. Lido dos sinais
 *   de closer no lead, na venda e no `sellerName`.
 *
 * Lead de anúncio Meta cuja venda veio com `utm_medium = x1` é `Pago …` **e**
 * `closer`. Closer não é canal: somar os dois eixos é o erro do Netão.
 *
 * ## O que esta função NÃO faz
 *
 * - Não lê banco: os nomes de closer chegam resolvidos na config
 *   (`seller_aliases` / `stage_event_closers`, montada pelo loader da 49.3).
 *   **Nenhum nome de closer mora no código** — com a config vazia, `x1` é só
 *   uma UTM qualquer.
 * - Não resolve o nome da campanha: `Utm.campaignName` chega pronto do loader
 *   (a partir do id em `utm_campaign`).
 * - Não olha `utm_content` (ad_id, macro `{{ad.id}}`, JSON de `co=` são
 *   assunto de `utm-value.ts`).
 *
 * Módulo FOLHA de propósito: sem imports, para poder ser importado por valor
 * dos dois lados (a API por bare specifier, o web por subpath
 * `@loyola-x/shared/src/classificador-de-origem`) sem arrastar a cadeia NodeNext
 * do índice para o webpack do Next.
 */

/**
 * Sobe sempre que a regra muda (ordem, termos, campos de casamento). Vai no
 * payload dos dois motores como `classificadorVersao`; a guarda F6 (49.5)
 * compara os dois lados.
 */
export const CLASSIFICADOR_VERSAO = "49.2-v1";

// ============================================================
// Tipos
// ============================================================

/** Uma UTM (do lead ou da venda). Todo campo é opcional e pode vir sujo. */
export interface Utm {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  /**
   * Nome da campanha da Meta, já resolvido pelo loader a partir do id em
   * `campaign`. Só serve de fallback do Quente/Frio — **não** conta como UTM
   * preenchida.
   */
  campaignName?: string | null;
}

export interface EntradaClassificador {
  lead: Utm | null;
  venda: Utm | null;
  /** Vendedor da venda (caso Netão: closer registrado por `seller_name`). */
  sellerName?: string | null;
}

export interface ConfigClassificador {
  /** `utm_medium` que marcam venda de closer (ex.: `x1`, `comercial`). */
  closerMediums: string[];
  /** Nomes de closer que aparecem em `utm_source` (de `seller_aliases`/`stage_event_closers`). */
  closerNomes: string[];
  /** Quando `true`, um `sellerName` preenchido marca o fechamento como Closer. */
  closerPorSellerName: boolean;
}

/** Eixo de AQUISIÇÃO — união fechada. Closer não é canal. */
export type Canal =
  | "Pago Quente"
  | "Pago Frio"
  | "Pago N/D"
  | "Instagram orgânico"
  | "WhatsApp"
  | "ManyChat"
  | "Outros orgânicos"
  | "Aquisição não rastreada (só closer)"
  | "Sem track real";

/** Eixo de FECHAMENTO. */
export type Fechamento = "closer" | "sem-closer";

/** Linha da tabela de regras de aquisição (AC2) que decidiu o canal. */
export type RegraDeAquisicao = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type RegraDeFechamento = "medium" | "source" | "sellerName";

export interface ResultadoClassificacao {
  canal: Canal;
  fechamento: Fechamento;
  /** De onde veio a UTM de aquisição usada. `nenhuma` nas regras 8 e 9. */
  fonteUtm: "lead" | "venda" | "nenhuma";
  regra: RegraDeAquisicao;
  regraDeFechamento: RegraDeFechamento | null;
  temperaturaDecididaPor: "utm_term" | "campaign_name" | null;
}

/** Os canais na ordem fixa de saída — a mesma da tabela de regras. */
export const CANAIS: readonly Canal[] = [
  "Pago Quente",
  "Pago Frio",
  "Pago N/D",
  "Instagram orgânico",
  "WhatsApp",
  "ManyChat",
  "Outros orgânicos",
  "Aquisição não rastreada (só closer)",
  "Sem track real",
];

export const FECHAMENTOS: readonly Fechamento[] = ["closer", "sem-closer"];

// ============================================================
// Segmentos da qualificação (49.4) — uma regra só (armadilha #9)
// ============================================================

export type SegmentoDeQualificacao =
  | "Pago Quente"
  | "Pago Frio"
  | "Pago N/D"
  | "Orgânico"
  | "Aquisição não rastreada (só closer)"
  | "Sem track";

/** Ordem fixa dos segmentos (padrão visual §4b item 5, sem Front — lacuna). */
export const SEGMENTOS_DE_QUALIFICACAO: readonly SegmentoDeQualificacao[] = [
  "Pago Quente",
  "Pago Frio",
  "Pago N/D",
  "Orgânico",
  "Aquisição não rastreada (só closer)",
  "Sem track",
];

/**
 * Canal de aquisição → segmento da qualificação. Os quatro orgânicos viram
 * "Orgânico"; o balde só-closer segue próprio (R2-5) e nunca é engolido pelo
 * "Sem track". Closer não é segmento: é o eixo de fechamento, à parte.
 */
export const SEGMENTO_DE_QUALIFICACAO: Readonly<Record<Canal, SegmentoDeQualificacao>> = {
  "Pago Quente": "Pago Quente",
  "Pago Frio": "Pago Frio",
  "Pago N/D": "Pago N/D",
  "Instagram orgânico": "Orgânico",
  WhatsApp: "Orgânico",
  ManyChat: "Orgânico",
  "Outros orgânicos": "Orgânico",
  "Aquisição não rastreada (só closer)": "Aquisição não rastreada (só closer)",
  "Sem track real": "Sem track",
};

// ============================================================
// Regra
// ============================================================

/** Termos de canal, casados por TOKEN inteiro em source, medium e campaign. */
const TOKENS_PAGOS = ["cbo", "abo", "meta", "fb"];
const TOKENS_INSTAGRAM = ["ig", "instagram"];
const TOKENS_WHATSAPP = ["whatsapp"];
const TOKENS_MANYCHAT = ["manychat"];

function normalizar(valor: unknown): string {
  if (typeof valor === "string") return valor.trim().toLowerCase();
  // Um id numérico em `utm_campaign` é UTM preenchida; tratá-lo como vazio
  // mandaria o comprador para "Sem track real" em silêncio.
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return "";
}

/**
 * Quente/frio de um texto — o MESMO reconhecimento de `classifyTemperatura`
 * (`api/utils/lead-origin.ts`) e de `temperaturaDoNome`
 * (`api/utils/temperatura-de-publico.ts`): substring, `hot`/`quente` primeiro.
 * Reimplementado porque o shared não importa da API; o teste diferencial da
 * 49.2 trava a equivalência.
 */
function temperaturaDoTexto(texto: unknown): "quente" | "frio" | null {
  const n = typeof texto === "string" ? texto.toLowerCase() : "";
  if (!n) return null;
  if (n.includes("hot") || n.includes("quente")) return "quente";
  if (n.includes("cold") || n.includes("frio")) return "frio";
  return null;
}

function conjuntoNormalizado(valores: readonly unknown[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(valores)) return out;
  for (const v of valores) {
    const n = normalizar(v);
    if (n) out.add(n);
  }
  return out;
}

/** Os quatro campos de UTM, normalizados, com os sinais de closer já apagados. */
interface UtmDeAquisicao {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  campaignName: unknown;
}

interface UtmLida {
  aquisicao: UtmDeAquisicao;
  temAquisicao: boolean;
  /** Algum campo de UTM preenchido (de aquisição OU de closer). */
  temAlgumCampo: boolean;
  closerPorMedium: boolean;
  closerPorSource: boolean;
}

function lerUtm(
  utm: Utm | null | undefined,
  closerMediums: Set<string>,
  closerNomes: Set<string>,
): UtmLida {
  const u = utm && typeof utm === "object" ? utm : {};
  const source = normalizar(u.source);
  const medium = normalizar(u.medium);
  const campaign = normalizar(u.campaign);
  const term = normalizar(u.term);

  const closerPorMedium = medium !== "" && closerMediums.has(medium);
  const closerPorSource = source !== "" && closerNomes.has(source);

  // Campo que é sinal de closer não conta como UTM de aquisição (AC2).
  const aquisicao: UtmDeAquisicao = {
    source: closerPorSource ? "" : source,
    medium: closerPorMedium ? "" : medium,
    campaign,
    term,
    campaignName: u.campaignName,
  };

  return {
    aquisicao,
    temAquisicao: Boolean(aquisicao.source || aquisicao.medium || aquisicao.campaign || aquisicao.term),
    temAlgumCampo: Boolean(source || medium || campaign || term),
    closerPorMedium,
    closerPorSource,
  };
}

function tokensDe(utm: UtmDeAquisicao): Set<string> {
  const out = new Set<string>();
  for (const campo of [utm.source, utm.medium, utm.campaign]) {
    for (const t of campo.split(/[^a-z0-9]+/)) if (t) out.add(t);
  }
  return out;
}

function temAlgum(tokens: Set<string>, termos: readonly string[]): boolean {
  return termos.some((t) => tokens.has(t));
}

/**
 * Classifica um comprador (ou respondente, ou ingresso) nos dois eixos.
 *
 * Aquisição — a primeira regra que casa decide, sobre a UTM efetiva (lead;
 * venda só se o lead não tem nenhuma UTM de aquisição):
 *
 * | # | Regra | Canal |
 * |---|---|---|
 * | 1 | `term` diz hot/quente; ou, se o term não decide, `campaignName` diz | Pago Quente |
 * | 2 | idem com cold/frio | Pago Frio |
 * | 3 | token `cbo`/`abo`/`meta`/`fb` | Pago N/D |
 * | 4 | token `ig`/`instagram` | Instagram orgânico |
 * | 5 | token `whatsapp` | WhatsApp |
 * | 6 | token `manychat` | ManyChat |
 * | 7 | qualquer outra UTM preenchida | Outros orgânicos |
 * | 8 | sem UTM de aquisição, mas algum campo é sinal de closer | Aquisição não rastreada (só closer) |
 * | 9 | nenhum campo de UTM no lead e na venda | Sem track real |
 *
 * Fechamento — `closer` se `medium ∈ closerMediums`, `source ∈ closerNomes`
 * (no lead ou na venda) ou, com `closerPorSellerName`, `sellerName` preenchido.
 * O `sellerName` não é UTM: sozinho ele não tira o comprador da regra 9.
 *
 * Nunca lança: entrada malformada cai num canal da união.
 */
export function classificarOrigem(
  entrada: EntradaClassificador,
  config: ConfigClassificador,
): ResultadoClassificacao {
  const e: Partial<EntradaClassificador> = entrada && typeof entrada === "object" ? entrada : {};
  const c: Partial<ConfigClassificador> = config && typeof config === "object" ? config : {};

  const closerMediums = conjuntoNormalizado(c.closerMediums);
  const closerNomes = conjuntoNormalizado(c.closerNomes);

  const lead = lerUtm(e.lead, closerMediums, closerNomes);
  const venda = lerUtm(e.venda, closerMediums, closerNomes);

  // ---- Eixo de fechamento (independente da aquisição) ----
  let regraDeFechamento: RegraDeFechamento | null = null;
  if (lead.closerPorMedium || venda.closerPorMedium) regraDeFechamento = "medium";
  else if (lead.closerPorSource || venda.closerPorSource) regraDeFechamento = "source";
  else if (c.closerPorSellerName === true && normalizar(e.sellerName) !== "") {
    regraDeFechamento = "sellerName";
  }
  const fechamento: Fechamento = regraDeFechamento ? "closer" : "sem-closer";

  const resultado = (
    canal: Canal,
    regra: RegraDeAquisicao,
    fonteUtm: ResultadoClassificacao["fonteUtm"],
    temperaturaDecididaPor: ResultadoClassificacao["temperaturaDecididaPor"] = null,
  ): ResultadoClassificacao => ({
    canal,
    fechamento,
    fonteUtm,
    regra,
    regraDeFechamento,
    temperaturaDecididaPor,
  });

  // ---- Eixo de aquisição ----
  const efetiva = lead.temAquisicao ? lead : venda.temAquisicao ? venda : null;
  if (!efetiva) {
    const temSinalDeCloser = lead.temAlgumCampo || venda.temAlgumCampo;
    return temSinalDeCloser
      ? resultado("Aquisição não rastreada (só closer)", 8, "nenhuma")
      : resultado("Sem track real", 9, "nenhuma");
  }
  const fonteUtm = efetiva === lead ? "lead" : "venda";
  const utm = efetiva.aquisicao;

  const peloTerm = temperaturaDoTexto(utm.term);
  const temperatura = peloTerm ?? temperaturaDoTexto(utm.campaignName);
  const decididaPor = peloTerm ? "utm_term" : temperatura ? "campaign_name" : null;
  if (temperatura === "quente") return resultado("Pago Quente", 1, fonteUtm, decididaPor);
  if (temperatura === "frio") return resultado("Pago Frio", 2, fonteUtm, decididaPor);

  const tokens = tokensDe(utm);
  if (temAlgum(tokens, TOKENS_PAGOS)) return resultado("Pago N/D", 3, fonteUtm);
  if (temAlgum(tokens, TOKENS_INSTAGRAM)) return resultado("Instagram orgânico", 4, fonteUtm);
  if (temAlgum(tokens, TOKENS_WHATSAPP)) return resultado("WhatsApp", 5, fonteUtm);
  if (temAlgum(tokens, TOKENS_MANYCHAT)) return resultado("ManyChat", 6, fonteUtm);
  return resultado("Outros orgânicos", 7, fonteUtm);
}

// ============================================================
// Agrupamento — uma tabela por eixo, nunca somadas entre si
// ============================================================

export interface GrupoDeCanal<T> {
  canal: Canal;
  n: number;
  linhas: T[];
}

export interface GrupoDeFechamento<T> {
  fechamento: Fechamento;
  n: number;
  linhas: T[];
}

/**
 * Agrupa linhas JÁ classificadas pelo eixo de aquisição. Devolve todos os
 * canais, na ordem de `CANAIS`, inclusive os vazios — `Σ n === linhas.length`.
 * Valor fora da união lança (não há balde de sobra para escondê-lo).
 */
export function agruparPorCanal<T extends { canal: Canal }>(
  linhas: readonly T[],
): GrupoDeCanal<T>[] {
  const grupos = CANAIS.map((canal) => ({ canal, n: 0, linhas: [] as T[] }));
  const porCanal = new Map(grupos.map((g) => [g.canal, g]));
  for (const linha of linhas) {
    const grupo = porCanal.get(linha.canal);
    // Canal fora da união só existe se alguém furou o tipo. Jogar num balde
    // qualquer esconderia o defeito e fecharia a soma com o número errado.
    if (!grupo) throw new Error(`agruparPorCanal: canal fora da união: ${String(linha.canal)}`);
    grupo.n += 1;
    grupo.linhas.push(linha);
  }
  return grupos;
}

/**
 * Agrupa linhas JÁ classificadas pelo eixo de fechamento. Devolve `closer` e
 * `sem-closer`, nessa ordem — `Σ n === linhas.length`.
 */
export function agruparPorFechamento<T extends { fechamento: Fechamento }>(
  linhas: readonly T[],
): GrupoDeFechamento<T>[] {
  const closer: GrupoDeFechamento<T> = { fechamento: "closer", n: 0, linhas: [] };
  const semCloser: GrupoDeFechamento<T> = { fechamento: "sem-closer", n: 0, linhas: [] };
  for (const linha of linhas) {
    const grupo =
      linha.fechamento === "closer" ? closer : linha.fechamento === "sem-closer" ? semCloser : null;
    if (!grupo) {
      throw new Error(`agruparPorFechamento: fechamento fora da união: ${String(linha.fechamento)}`);
    }
    grupo.n += 1;
    grupo.linhas.push(linha);
  }
  return [closer, semCloser];
}
