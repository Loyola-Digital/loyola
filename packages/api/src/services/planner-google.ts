/**
 * O Planner lê a agenda do Google.
 *
 * ## O que a medição mostrou
 *
 * A agenda "🇺🇸 [FZ] Agenda Geral" tem 20 eventos e **todos são de dia
 * inteiro** — e são fases de campanha, não compromissos: `FZL3 - Prod.
 * Captação`, `[FZ BLACK] Definições`, `FZM3 - Definições`. O time já planeja
 * lá; o Planner só não sabia ler.
 *
 * Por isso a importação vira FASE, e não uma camada separada de "eventos". Uma
 * segunda representação da mesma coisa obrigaria a manter as duas.
 *
 * ## A pegadinha do `end` do Google
 *
 * Em evento de dia inteiro, `end.date` é o dia SEGUINTE ao último. `13/07 →
 * 18/07` termina em **17/07**. Copiar o valor direto acrescenta um dia em toda
 * fase importada, e o erro é invisível: as datas parecem plausíveis e a
 * duração fica sempre 1 a mais.
 *
 * ## Autenticação
 *
 * Service account com escopo de leitura de Calendar. Não passa pelo
 * `calendarList` de propósito: uma service account não tem caixa de entrada,
 * então nunca aceita o convite de compartilhamento e a lista dela fica sempre
 * vazia. A permissão, essa, vale desde o momento em que o e-mail é adicionado —
 * então acessamos a agenda pelo ID, direto.
 */

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const ESCOPO = "https://www.googleapis.com/auth/calendar.readonly";

interface ChaveDeServico {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let tokenEmCache: { token: string; expiraEm: number } | null = null;

function chave(): ChaveDeServico {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!bruto) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY não configurado");
  return JSON.parse(bruto) as ChaveDeServico;
}

/** O e-mail que precisa ser adicionado no compartilhamento da agenda. */
export function emailDaServiceAccount(): string | null {
  try {
    return chave().client_email;
  } catch {
    return null;
  }
}

async function token(): Promise<string> {
  if (tokenEmCache && Date.now() < tokenEmCache.expiraEm) return tokenEmCache.token;

  const k = chave();
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(
    JSON.stringify({ iss: k.client_email, scope: ESCOPO, aud: k.token_uri, iat: agora, exp: agora + 3600 }),
  ).toString("base64url");

  const assinador = createSign("RSA-SHA256");
  assinador.update(`${cabecalho}.${corpo}`);
  const jwt = `${cabecalho}.${corpo}.${assinador.sign(k.private_key, "base64url")}`;

  const r = await fetch(k.token_uri ?? TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(j.error_description ?? "Google recusou o token");

  // Um minuto de folga: um token que expira no meio da requisição vira 401.
  tokenEmCache = { token: j.access_token, expiraEm: Date.now() + 3540_000 };
  return j.access_token;
}

export interface EventoDoGoogle {
  id: string;
  titulo: string;
  /** ISO `YYYY-MM-DD`. */
  inicio: string;
  /** ISO `YYYY-MM-DD`, já corrigido do `end` exclusivo do Google. */
  fim: string;
  /** Evento com hora marcada (reunião), não faixa de dias. */
  temHora: boolean;
}

/** O nome da agenda, ou erro explicando o que fazer. */
export async function nomeDaAgenda(calendarId: string): Promise<string> {
  const r = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (r.status === 404) {
    throw new Error(
      `Sem acesso a esta agenda. Compartilhe com ${emailDaServiceAccount() ?? "a service account"} ` +
        "em Configurações e compartilhamento → Compartilhar com pessoas e grupos.",
    );
  }
  if (!r.ok) throw new Error(`Google respondeu ${r.status} ao abrir a agenda`);
  const j = (await r.json()) as { summary?: string };
  return j.summary ?? calendarId;
}

/**
 * Os eventos da agenda, na janela pedida.
 *
 * `singleEvents` expande a série recorrente em ocorrências — sem isso, um
 * evento semanal viria como UMA linha com regra de repetição, e o Planner
 * desenharia uma fase só no dia em que a série começou.
 */
export async function eventosDaAgenda(
  calendarId: string,
  de: Date,
  ate: Date,
): Promise<EventoDoGoogle[]> {
  const busca = new URLSearchParams({
    timeMin: de.toISOString(),
    timeMax: ate.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });

  const r = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${busca}`,
    { headers: { Authorization: `Bearer ${await token()}` } },
  );
  if (!r.ok) throw new Error(`Google respondeu ${r.status} ao ler os eventos`);

  const j = (await r.json()) as {
    items?: {
      id?: string;
      summary?: string;
      status?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
    }[];
  };

  const saida: EventoDoGoogle[] = [];
  for (const e of j.items ?? []) {
    // Cancelado continua vindo na resposta: importá-lo criaria uma fase que
    // ninguém marcou.
    if (!e.id || e.status === "cancelled") continue;
    const inicio = e.start?.date ?? e.start?.dateTime?.slice(0, 10);
    if (!inicio) continue;

    const temHora = !e.start?.date;
    let fim: string;
    if (e.end?.date) {
      // `end.date` é o dia SEGUINTE ao último. Sem o -1, toda fase importada
      // ganha um dia a mais, e o erro é invisível.
      fim = diaAnterior(e.end.date);
      if (fim < inicio) fim = inicio;
    } else {
      fim = e.end?.dateTime?.slice(0, 10) ?? inicio;
    }

    saida.push({ id: e.id, titulo: (e.summary ?? "").trim() || "(sem título)", inicio, fim, temHora });
  }
  return saida;
}

function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  // Meio-dia: à meia-noite, num dia de mudança de horário, subtrair 24h erra.
  const dt = new Date(a!, m! - 1, d!, 12);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export interface TituloSeparado {
  campanha: string;
  fase: string;
}

/**
 * Quebra o título do evento em campanha e fase.
 *
 * Os dois padrões que a agenda real usa, medidos nela:
 *
 *   `FZL3 - Prod. Captação`          → FZL3        · Prod. Captação
 *   `[FZ BLACK] Definições`          → FZ BLACK    · Definições
 *   `☠️ [FÉRIAS] Fernanda Zapparoli` → FÉRIAS      · Fernanda Zapparoli
 *
 * O colchete tem precedência sobre o hífen porque um título pode ter os dois
 * (`[FZ BLACK] Exec. - semana 2`), e ali quem separa é o colchete.
 *
 * Sem nenhum dos dois, o título inteiro vira a FASE e a campanha fica vazia —
 * quem importa decide onde pôr. Inventar uma campanha a partir da primeira
 * palavra criaria uma campanha nova a cada evento solto.
 */
export function separarTitulo(titulo: string): TituloSeparado {
  const limpo = titulo.trim();

  const colchete = limpo.match(/\[([^\]]+)\]\s*(.*)$/);
  if (colchete) {
    const campanha = colchete[1]!.trim();
    const fase = colchete[2]!.trim();
    return { campanha, fase: fase || campanha };
  }

  // Hífen com espaço dos dois lados: `Prod. Captação` tem ponto, não hífen, e
  // `FZ-BLACK` sem espaços é um nome só.
  const hifen = limpo.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (hifen) return { campanha: hifen[1]!.trim(), fase: hifen[2]!.trim() };

  return { campanha: "", fase: limpo };
}

/** Uma cor estável para a campanha, derivada do nome. */
export function corParaCampanha(nome: string, paleta: readonly string[]): string {
  // Hash simples: a mesma campanha recebe a mesma cor em toda importação, e
  // duas campanhas diferentes raramente colidem.
  let soma = 0;
  for (const c of nome) soma = (soma * 31 + c.charCodeAt(0)) % 100_000;
  return paleta[soma % paleta.length]!;
}
