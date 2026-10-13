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

/**
 * Nome próprio normalizado como o Meta pede: minúsculas, sem acento, sem
 * pontuação, sem espaço.
 *
 * Nome é um dos parâmetros de correspondência que mais pesam na Qualidade do
 * Evento, e estava sendo LIDO e descartado: a planilha traz nome em 99,3% das
 * linhas (medido no dg-pg05-out-26) e o evento ia só com e-mail e telefone.
 *
 * Acento fora porque "José" e "Jose" têm de casar com o mesmo perfil — é o que
 * a documentação manda, e sem isso metade dos nomes brasileiros não casa.
 */
export function hashDeNome(parte: string | null | undefined): string {
  const limpo = (parte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return limpo.length > 0 ? sha256(limpo) : "";
}

/**
 * Primeiro e último nome, a partir do nome completo de uma coluna só.
 *
 * "Mário Gabriel Silva" → `fn: mario`, `ln: silva`. Nome do meio fica fora: o
 * Meta tem campo para primeiro e último, e enfiar o meio no sobrenome faria o
 * hash não casar com nada.
 *
 * Um nome só ("Madonna") vai como primeiro e sem sobrenome — melhor que
 * repetir o mesmo valor nos dois campos, que seria um sobrenome falso.
 */
export function primeiroEUltimoNome(completo: string | null | undefined): {
  fn: string;
  ln: string;
} {
  const partes = (completo ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { fn: "", ln: "" };
  if (partes.length === 1) return { fn: hashDeNome(partes[0]), ln: "" };
  return { fn: hashDeNome(partes[0]), ln: hashDeNome(partes[partes.length - 1]) };
}

export interface LeadParaOMeta {
  /** Identificador estável do lead — é o que faz o `event_id` não mudar. */
  chave: string;
  email?: string | null;
  telefone?: string | null;
  /** Nome completo, de uma coluna só. Vira `fn`/`ln` com hash. */
  nome?: string | null;
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
  /** A página onde a pessoa respondeu. Ver `eventoDoLead` para o porquê. */
  event_source_url?: string;
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
  opcoes: {
    stageId: string;
    eventName: string;
    actionSource?: string;
    /** A página do formulário. Ver o bloco sobre `action_source` abaixo. */
    eventSourceUrl?: string | null;
  },
): EventoDoMeta | null {
  const em = hashDeEmail(lead.email);
  const ph = hashDeTelefone(lead.telefone);
  if (!em && !ph) return null;

  const user_data: Record<string, string> = {};
  if (em) user_data.em = em;
  if (ph) user_data.ph = ph;
  // Nome pesa na Qualidade da Correspondência e vinha sendo lido e jogado fora.
  const { fn, ln } = primeiroEUltimoNome(lead.nome);
  if (fn) user_data.fn = fn;
  if (ln) user_data.ln = ln;
  // `external_id` é parâmetro de correspondência pelo próprio Meta, e também é
  // o que permite ao Gerenciador reconhecer a MESMA pessoa entre eventos de
  // faixas diferentes. Hash da nossa chave estável — nunca a chave em claro.
  user_data.external_id = sha256(lead.chave.trim().toLowerCase());

  const custom_data: Record<string, string | number> = { faixa: lead.faixa };
  if (typeof lead.score === "number") custom_data.score = lead.score;

  const url = (opcoes.eventSourceUrl ?? "").trim();

  return {
    event_name: opcoes.eventName,
    event_time: quandoEmSegundos(lead.quando),
    // Determinístico: a mesma etapa com o mesmo lead gera sempre o mesmo id, e
    // o Meta descarta a repetição sozinho.
    event_id: sha256(`${opcoes.stageId}:${lead.chave}:${opcoes.eventName}`).slice(0, 40),
    // ## Por que a URL muda o `action_source`
    //
    // O Meta exige `event_source_url` nos eventos de site, e a Qualidade da
    // Correspondência — a nota que o Gerenciador mostra — só é calculada para
    // evento de site. Com `system_generated` e sem URL, o evento casa pior e
    // não ganha nota nenhuma.
    //
    // Dizer "website" só é honesto porque é verdade: a pessoa preencheu o
    // formulário NUMA PÁGINA, e é essa página que vai aqui. O que nasce do
    // nosso servidor é a classificação, não a ação. Sem URL configurada,
    // continua `system_generated` — nunca "website" sem a página, que seria
    // justamente a mentira que o comentário anterior evitava.
    action_source: opcoes.actionSource ?? (url ? "website" : "system_generated"),
    ...(url ? { event_source_url: url } : {}),
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
/**
 * O nome do evento de uma faixa.
 *
 * O Meta otimiza para UM evento: uma campanha mirando lead A e outra mirando
 * lead B precisam de eventos DIFERENTES para escolher no Gerenciador. Com um
 * nome só, as duas aprenderiam a mesma coisa — que é o que a feature existe
 * para evitar.
 *
 * O escolhido manda; sem escolha, `${base}${faixa}` (`LeadQualificadoA`), sem
 * espaço, que é o formato que o Gerenciador lista sem surpresa.
 */
export function nomeDoEventoDaFaixa(
  base: string,
  faixa: string,
  escolhidos: Record<string, string> = {},
): string {
  const f = (faixa ?? "").trim().toUpperCase();
  const escolhido = (escolhidos[f] ?? escolhidos[faixa] ?? "").trim();
  return escolhido || `${base}${f}`;
}

export function montarLote(
  leads: LeadParaOMeta[],
  opcoes: {
    stageId: string;
    eventName: string;
    faixas: string[];
    /** Nome por faixa; o que faltar cai no padrão. Ver `nomeDoEventoDaFaixa`. */
    eventosPorFaixa?: Record<string, string>;
    /** A página do formulário, igual para todos os leads da etapa. */
    eventSourceUrl?: string | null;
    /** Quem já foi, por `chave|evento` — o mesmo lead pode ir de novo sob outro evento. */
    jaEnviados?: Set<string>;
  },
): {
  eventos: EventoDoMeta[];
  /** Na ordem dos eventos: `{ chave, evento, faixa }` de cada um. */
  enviados: { chave: string; evento: string; faixa: string }[];
  chaves: string[];
  semIdentificador: number;
  jaEstavam: number;
} {
  const querem = new Set(opcoes.faixas.map((f) => f.trim().toUpperCase()).filter(Boolean));
  const eventos: EventoDoMeta[] = [];
  // Saem na MESMA ordem dos eventos: é o que permite registrar como enviado
  // exatamente quem foi, sem tentar adivinhar depois pelo `event_id`.
  const enviados: { chave: string; evento: string; faixa: string }[] = [];
  const chaves: string[] = [];
  let semIdentificador = 0;
  let jaEstavam = 0;

  for (const lead of leads) {
    const faixa = (lead.faixa ?? "").toUpperCase();
    if (!querem.has(faixa)) continue;

    // Cada faixa tem o SEU evento — é o que permite a campanha de lead A
    // otimizar para lead A no Gerenciador.
    const nome = nomeDoEventoDaFaixa(opcoes.eventName, faixa, opcoes.eventosPorFaixa ?? {});
    if (opcoes.jaEnviados?.has(`${lead.chave}|${nome}`)) {
      jaEstavam += 1;
      continue;
    }
    const evento = eventoDoLead(lead, {
      stageId: opcoes.stageId,
      eventName: nome,
      eventSourceUrl: opcoes.eventSourceUrl,
    });
    if (!evento) {
      semIdentificador += 1;
      continue;
    }
    eventos.push(evento);
    enviados.push({ chave: lead.chave, evento: nome, faixa });
    chaves.push(lead.chave);
  }

  return { eventos, enviados, chaves, semIdentificador, jaEstavam };
}
