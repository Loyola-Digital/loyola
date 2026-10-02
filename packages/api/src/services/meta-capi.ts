/**
 * Devolver ao Meta a FAIXA de cada lead — a volta que fecha o ciclo.
 *
 * ## Por que existe
 *
 * O Loyola X já sabia quais campanhas trazem lead bom; o Meta, não. Ele otimiza
 * para "lead" — e lead é qualquer formulário preenchido, então ele persegue o
 * mais barato, que costuma ser o pior. Mandando de volta um evento só para os
 * leads da faixa que importa, o algoritmo passa a perseguir ESSE, e a conta de
 * mídia aprende o que a pesquisa descobriu.
 *
 * É isto que o pedido quer dizer com "faixa A enviar pra meta ele e a faixa
 * dele": um evento por lead qualificado, com a faixa junto.
 *
 * ## O que sai daqui (e o que NUNCA sai)
 *
 * O Meta exige identificar a pessoa para casar com quem clicou no anúncio, e
 * aceita isso apenas com **hash**. E-mail e telefone saem SHA-256, normalizados
 * antes como a documentação manda (minúsculas, sem espaço, telefone só dígitos
 * com DDI) — fora disso o casamento falha em silêncio e o evento vira lixo.
 *
 * Em claro não sai nada. Nem aqui, nem no log.
 *
 * ## Por que o `event_id` é determinístico
 *
 * É ele que impede o mesmo lead de entrar duas vezes quando a sincronização
 * roda de novo — e ela VAI rodar de novo, porque a planilha e o formulário
 * continuam recebendo. `event_id` derivado da etapa + identificador do lead faz
 * o próprio Meta descartar a repetição, mesmo que o nosso controle falhe.
 */

import { createHash } from "node:crypto";

const VERSAO = "v21.0";
const TIMEOUT_MS = 30_000;
/** O Meta recusa lote acima de mil eventos. */
export const MAX_POR_LOTE = 1000;

export class MetaCapiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MetaCapiError";
  }
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * E-mail normalizado como o Meta pede: minúsculas e sem espaço em volta.
 *
 * `""` quando não há e-mail — e aí o campo não entra no evento. Mandar o hash
 * de uma string vazia seria mandar um identificador que casa com todo mundo que
 * também não tem e-mail.
 */
export function hashDeEmail(email: string | null | undefined): string {
  const limpo = (email ?? "").trim().toLowerCase();
  return limpo.includes("@") ? sha256(limpo) : "";
}

/**
 * Telefone normalizado: só dígitos, com DDI.
 *
 * Número brasileiro sem o 55 é a norma nas planilhas, e sem DDI o Meta não
 * casa. Dez ou onze dígitos recebem o 55; o que já vem com DDI é respeitado.
 */
export function hashDeTelefone(telefone: string | null | undefined): string {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 11 || d.length > 15) return "";
  return sha256(d);
}

export interface LeadParaOMeta {
  /** Identificador estável do lead — é o que faz o `event_id` não mudar. */
  chave: string;
  email?: string | null;
  telefone?: string | null;
  /** A faixa calculada: "A", "B"… */
  faixa: string;
  /** A pontuação, quando houver — vai como valor do evento. */
  score?: number | null;
  /** Quando o lead respondeu (ISO ou epoch em segundos). */
  quando?: string | number | null;
}

export interface EventoDoMeta {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: string;
  user_data: Record<string, string>;
  custom_data: Record<string, string | number>;
}

/** Segundos desde a época, a partir do que a planilha ou o Tally deram. */
function quandoEmSegundos(valor: string | number | null | undefined): number {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor > 1e11 ? Math.floor(valor / 1000) : Math.floor(valor);
  }
  const t = valor ? Date.parse(String(valor)) : NaN;
  const ms = Number.isNaN(t) ? Date.now() : t;
  const segundos = Math.floor(ms / 1000);

  // O Meta recusa evento com mais de 7 dias. Lead antigo entra com a data
  // limite em vez de ser descartado: a informação "este lead é bom" continua
  // valendo para o aprendizado, e perdê-la por causa do carimbo seria pior.
  const minimo = Math.floor(Date.now() / 1000) - 6 * 86_400;
  return Math.max(segundos, minimo);
}

/**
 * O evento de um lead, ou `null` quando não há como identificá-lo.
 *
 * Sem e-mail nem telefone o Meta não tem com o que casar, e o evento só
 * engordaria a conta sem ensinar nada — é descarte honesto, contado e
 * reportado, nunca silencioso.
 */
export function eventoDoLead(
  lead: LeadParaOMeta,
  opcoes: { stageId: string; eventName: string; actionSource?: string },
): EventoDoMeta | null {
  const em = hashDeEmail(lead.email);
  const ph = hashDeTelefone(lead.telefone);
  if (!em && !ph) return null;

  const user_data: Record<string, string> = {};
  if (em) user_data.em = em;
  if (ph) user_data.ph = ph;

  const custom_data: Record<string, string | number> = { faixa: lead.faixa };
  if (typeof lead.score === "number") custom_data.score = lead.score;

  return {
    event_name: opcoes.eventName,
    event_time: quandoEmSegundos(lead.quando),
    // Determinístico: a mesma etapa com o mesmo lead gera sempre o mesmo id, e
    // o Meta descarta a repetição sozinho.
    event_id: sha256(`${opcoes.stageId}:${lead.chave}:${opcoes.eventName}`).slice(0, 40),
    // "system_generated": o evento não nasce de uma ação no site, nasce da
    // nossa classificação. Mentir aqui (dizer "website") distorce os relatórios
    // de atribuição do próprio Meta.
    action_source: opcoes.actionSource ?? "system_generated",
    user_data,
    custom_data,
  };
}

export interface ResultadoDoEnvio {
  enviados: number;
  recebidos: number;
  /** Leads sem e-mail e sem telefone — não dá para casar com ninguém. */
  semIdentificador: number;
  fbTraceId?: string;
}

/**
 * Manda o lote para o dataset do Meta.
 *
 * `test_event_code` existe para a primeira vez: com ele o evento aparece no
 * "Test Events" do Gerenciador e NÃO entra na otimização — dá para conferir o
 * formato sem ensinar bobagem ao algoritmo.
 */
export async function enviarEventos(
  datasetId: string,
  accessToken: string,
  eventos: EventoDoMeta[],
  testEventCode?: string | null,
): Promise<ResultadoDoEnvio> {
  if (eventos.length === 0) return { enviados: 0, recebidos: 0, semIdentificador: 0 };
  if (eventos.length > MAX_POR_LOTE) {
    throw new MetaCapiError(`O Meta aceita até ${MAX_POR_LOTE} eventos por lote.`);
  }

  const corpo: Record<string, unknown> = { data: eventos, access_token: accessToken };
  if (testEventCode) corpo.test_event_code = testEventCode;

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${VERSAO}/${datasetId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    throw new MetaCapiError(
      (erro as Error)?.name === "TimeoutError"
        ? "O Meta demorou demais para responder."
        : "Não consegui falar com o Meta.",
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: { message?: string; error_user_msg?: string };
  };

  if (!res.ok) {
    const msg = json.error?.error_user_msg || json.error?.message || `erro ${res.status}`;
    throw new MetaCapiError(`O Meta recusou o envio: ${msg}`, res.status);
  }

  return {
    enviados: eventos.length,
    recebidos: json.events_received ?? 0,
    semIdentificador: 0,
    fbTraceId: json.fbtrace_id,
  };
}

/**
 * Monta os eventos dos leads que a configuração manda enviar.
 *
 * Separado do envio para poder ser conferido sem rede — é aqui que mora a
 * decisão de quem vai e quem não vai, e essa decisão precisa ser testável.
 */
export function montarLote(
  leads: LeadParaOMeta[],
  opcoes: { stageId: string; eventName: string; faixas: string[]; jaEnviados?: Set<string> },
): { eventos: EventoDoMeta[]; chaves: string[]; semIdentificador: number; jaEstavam: number } {
  const querem = new Set(opcoes.faixas.map((f) => f.trim().toUpperCase()).filter(Boolean));
  const eventos: EventoDoMeta[] = [];
  // As chaves saem na MESMA ordem dos eventos: é o que permite registrar como
  // enviado exatamente quem foi, sem tentar adivinhar depois pelo `event_id`.
  const chaves: string[] = [];
  let semIdentificador = 0;
  let jaEstavam = 0;

  for (const lead of leads) {
    if (!querem.has((lead.faixa ?? "").toUpperCase())) continue;
    if (opcoes.jaEnviados?.has(lead.chave)) {
      jaEstavam += 1;
      continue;
    }
    const evento = eventoDoLead(lead, { stageId: opcoes.stageId, eventName: opcoes.eventName });
    if (!evento) {
      semIdentificador += 1;
      continue;
    }
    eventos.push(evento);
    chaves.push(lead.chave);
  }

  return { eventos, chaves, semIdentificador, jaEstavam };
}
