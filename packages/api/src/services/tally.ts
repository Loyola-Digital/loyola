/**
 * A API do Tally — os formulários e as perguntas de onde o Lead Scoring nasce.
 *
 * ## Por que existe
 *
 * O modelo de Lead Scoring do Loyola X é bom: pontua resposta a resposta, aplica
 * peso, classifica em faixas e cruza a faixa com campanha, conjunto e criativo
 * do Meta. O que nunca existiu foi de onde ele VEM — a aba de scoring pede o
 * JSON pronto ("ctrl+c / ctrl+v do modelo externo"), e esse modelo era montado
 * à mão num fluxo do n8n. Trocar uma pergunta do formulário significava
 * reescrever JSON em outro lugar e colar de volta.
 *
 * Aqui o formulário é lido do próprio Tally: as perguntas e as opções de
 * resposta viram o rascunho do modelo, com os pontos zerados esperando quem
 * sabe o negócio.
 *
 * ## O contrato (verificado na documentação em 02/10/2026)
 *
 *     GET https://api.tally.so/forms                      → lista paginada
 *     GET https://api.tally.so/forms/{id}/questions        → perguntas + opções
 *     Authorization: Bearer <token>
 *
 * As perguntas vêm junto de blocos de layout (título, divisória, imagem), e as
 * opções de múltipla escolha vêm aninhadas em `fields`. Separar os dois é o
 * trabalho deste módulo.
 */

const BASE = "https://api.tally.so";
const TIMEOUT_MS = 20_000;

export class TallyError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TallyError";
  }
}

/** Mensagem que diz a quem está olhando o que fazer, não o que o Tally disse. */
function motivoLegivel(status: number, corpo: string): string {
  if (status === 401 || status === 403) {
    return "O Tally recusou a chave. Gere uma nova em tally.so → Settings → API e salve aqui.";
  }
  if (status === 404) return "Esse formulário não existe nesta conta do Tally.";
  if (status === 429) return "O Tally está limitando as chamadas agora. Tente em alguns segundos.";
  if (status >= 500) return "O Tally está fora do ar. Tente de novo em instantes.";
  return `O Tally respondeu ${status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`;
}

async function chamar<T>(token: string, caminho: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    throw new TallyError(
      (erro as Error)?.name === "TimeoutError"
        ? "O Tally demorou demais para responder."
        : "Não consegui falar com o Tally.",
    );
  }
  if (!res.ok) throw new TallyError(motivoLegivel(res.status, await res.text().catch(() => "")), res.status);
  return (await res.json()) as T;
}

export interface FormularioDoTally {
  id: string;
  name: string;
  /** Quantas respostas o formulário já tem — ajuda a achar o certo na lista. */
  respostas: number;
  status?: string;
}

/**
 * Os formulários da conta, do mais recente para o mais antigo.
 *
 * Pagina até acabar, com teto: uma conta com milhares de formulários não pode
 * prender a tela, e quem procura o formulário do lançamento acha nas primeiras
 * páginas.
 */
export async function listarFormularios(token: string, maxPaginas = 5): Promise<FormularioDoTally[]> {
  const saida: FormularioDoTally[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
    const r = await chamar<{
      items?: { id: string; name?: string; numberOfSubmissions?: number; status?: string }[];
      hasMore?: boolean;
    }>(token, `/forms?page=${pagina}&limit=50`);
    for (const f of r.items ?? []) {
      saida.push({
        id: f.id,
        name: f.name?.trim() || "(sem nome)",
        respostas: f.numberOfSubmissions ?? 0,
        status: f.status,
      });
    }
    if (!r.hasMore) break;
  }
  return saida;
}

/** Um bloco do formulário, já separado entre pergunta e opção de resposta. */
export interface PerguntaDoTally {
  id: string;
  titulo: string;
  tipo: string;
  /** As alternativas, quando a pergunta é de escolha. Vazio em campo aberto. */
  opcoes: string[];
}

/**
 * Tipos que NÃO são pergunta: título, divisória, imagem, quebra de página.
 *
 * A lista é de exclusão e não de inclusão de propósito: o Tally acrescenta tipo
 * de campo com frequência, e um tipo novo desconhecido é mais provável ser uma
 * pergunta nova do que um enfeite — melhor aparecer para quem está mapeando e
 * ser ignorado do que sumir sem ninguém saber.
 */
const NAO_SAO_PERGUNTA = new Set([
  "PAGE_BREAK",
  "DIVIDER",
  "HEADING_1",
  "HEADING_2",
  "HEADING_3",
  "IMAGE",
  "EMBED",
  "EMBED_VIDEO",
  "TEXT",
  "LABEL",
  "CAPTCHA",
]);

/** Tipos cujo valor é texto livre — não geram opção para pontuar. */
const CAMPO_ABERTO = new Set([
  "INPUT_TEXT",
  "INPUT_NUMBER",
  "INPUT_EMAIL",
  "INPUT_LINK",
  "INPUT_PHONE_NUMBER",
  "INPUT_DATE",
  "INPUT_TIME",
  "TEXTAREA",
  "FILE_UPLOAD",
  "SIGNATURE",
  "PAYMENT",
  "HIDDEN_FIELDS",
]);

interface QuestionCrua {
  id?: string;
  type?: string;
  title?: string;
  isDeleted?: boolean;
  fields?: { uuid?: string; type?: string; title?: string }[];
}

/**
 * As perguntas de um formulário, sem os blocos de layout e sem as apagadas.
 *
 * Módulo de leitura pura a partir da resposta da API — separado da chamada para
 * poder ser testado com o JSON real sem rede.
 */
export function lerPerguntas(bruto: { questions?: QuestionCrua[] }): PerguntaDoTally[] {
  const saida: PerguntaDoTally[] = [];
  for (const q of bruto.questions ?? []) {
    if (q.isDeleted) continue;
    const tipo = (q.type ?? "").toUpperCase();
    if (NAO_SAO_PERGUNTA.has(tipo)) continue;
    const titulo = (q.title ?? "").trim();
    if (!titulo) continue;

    const opcoes = CAMPO_ABERTO.has(tipo)
      ? []
      : (q.fields ?? [])
          .map((f) => (f.title ?? "").trim())
          .filter(Boolean);

    saida.push({ id: q.id ?? titulo, titulo, tipo, opcoes });
  }
  return saida;
}

export async function perguntasDoFormulario(token: string, formId: string): Promise<PerguntaDoTally[]> {
  return lerPerguntas(await chamar<{ questions?: QuestionCrua[] }>(token, `/forms/${formId}/questions`));
}

// ============================================================
// Respostas
// ============================================================

/**
 * As respostas no MESMO formato de uma planilha (`{headers, rows}`).
 *
 * ## Por que esta forma e não um tipo próprio
 *
 * O motor de Lead Scoring casa cada pergunta com uma COLUNA pelo cabeçalho, e
 * já sabe fazer isso muito bem — inclusive com aliases, acento e pontuação.
 * Devolver `{headers, rows}` faz o Tally entrar por onde a planilha entrava,
 * sem tocar em nenhuma linha do cálculo. O que muda é a origem; a conta é a
 * mesma, e por isso continua comparável com o que já estava no ar.
 */
export interface RespostasComoPlanilha {
  headers: string[];
  rows: string[][];
  /** Quantas submissões entraram — para a tela dizer de onde veio o número. */
  total: number;
}

/** O valor de uma resposta como texto, qualquer que seja o tipo que o Tally mande. */
export function textoDaResposta(resposta: {
  answer?: unknown;
  formattedAnswer?: unknown;
}): string {
  // `formattedAnswer` é o que o Tally mostra na tela dele: para múltipla
  // escolha vem o TEXTO da alternativa, não o id. É o que casa com o modelo de
  // pontuação, que fala em texto.
  const formatado = resposta.formattedAnswer;
  if (typeof formatado === "string" && formatado.trim()) return formatado.trim();

  const bruto = resposta.answer;
  if (bruto == null) return "";
  if (typeof bruto === "string") return bruto.trim();
  if (typeof bruto === "number" || typeof bruto === "boolean") return String(bruto);
  if (Array.isArray(bruto)) {
    // Múltipla seleção: a planilha também traz separado por vírgula, então o
    // casamento com o modelo continua funcionando do mesmo jeito.
    return bruto.map((v) => textoDaResposta({ answer: v })).filter(Boolean).join(", ");
  }
  if (typeof bruto === "object") {
    const o = bruto as Record<string, unknown>;
    for (const chave of ["title", "label", "text", "name", "value"]) {
      const v = o[chave];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }
  return "";
}

interface SubmissionCrua {
  id?: string;
  isCompleted?: boolean;
  submittedAt?: string;
  responses?: { questionId?: string; answer?: unknown; formattedAnswer?: unknown }[];
}

/**
 * Monta a "planilha" a partir de uma página de submissões.
 *
 * A primeira coluna é a data do envio: o motor e os relatórios precisam dela, e
 * no Tally ela é metadado da submissão, não uma pergunta. Pura, para ser
 * testada com o JSON real sem rede.
 */
export function montarPlanilha(
  perguntas: PerguntaDoTally[],
  submissions: SubmissionCrua[],
): RespostasComoPlanilha {
  const headers = ["Submitted at", ...perguntas.map((p) => p.titulo)];
  const rows: string[][] = [];

  for (const s of submissions) {
    const porPergunta = new Map<string, string>();
    for (const r of s.responses ?? []) {
      if (!r.questionId) continue;
      const texto = textoDaResposta(r);
      if (texto) porPergunta.set(r.questionId, texto);
    }
    rows.push([s.submittedAt ?? "", ...perguntas.map((p) => porPergunta.get(p.id) ?? "")]);
  }

  return { headers, rows, total: rows.length };
}

/**
 * As respostas do formulário, paginando até acabar.
 *
 * Só as COMPLETAS: uma submissão parcial tem metade das perguntas em branco e
 * pontuaria como lead ruim — o que seria uma afirmação sobre o lead a partir de
 * um fato sobre o formulário.
 *
 * ponytail: teto de páginas; 20 x 500 = 10 mil respostas, acima do maior
 * lançamento que passou por aqui. Se um dia faltar, o lugar de resolver é um
 * cache incremental por `afterId`, não aumentar o número.
 */
export async function respostasDoFormulario(
  token: string,
  formId: string,
  maxPaginas = 20,
): Promise<RespostasComoPlanilha> {
  const perguntas = await perguntasDoFormulario(token, formId);
  const todas: SubmissionCrua[] = [];

  for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
    const r = await chamar<{ submissions?: SubmissionCrua[]; hasMore?: boolean }>(
      token,
      `/forms/${formId}/submissions?page=${pagina}&limit=500&filter=completed`,
    );
    todas.push(...(r.submissions ?? []));
    if (!r.hasMore) break;
  }

  return montarPlanilha(perguntas, todas);
}
