// Zoom Server-to-Server OAuth + Reports API client.
// Token cache em memória (1h TTL).

import { decrypt } from "./encryption.js";

interface ZoomTokenResponse {
  access_token: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export async function getServerToServerToken(
  accountId: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cacheKey = `${accountId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Zoom OAuth falhou (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as ZoomTokenResponse;
  // Renova 60s antes do real expiry pra evitar borda
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 });
  return json.access_token;
}

export interface DecryptedZoomConnection {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

export function decryptZoomConnection(row: {
  accountId: string;
  clientId: string;
  clientSecretEncrypted: string;
  clientSecretIv: string;
}): DecryptedZoomConnection {
  return {
    accountId: row.accountId,
    clientId: row.clientId,
    clientSecret: decrypt(row.clientSecretEncrypted, row.clientSecretIv),
  };
}

interface PastMeetingInstance {
  uuid: string;
  start_time: string;
}

/**
 * Resolve meeting ID numérico → todos os UUIDs de instâncias passadas.
 * Se input já parece UUID, retorna ele mesmo.
 */
export async function resolveMeetingUuids(token: string, meetingIdOrUuid: string): Promise<string[]> {
  const isNumericId = /^\d+$/.test(meetingIdOrUuid.trim());
  if (!isNumericId) return [meetingIdOrUuid];

  const url = `https://api.zoom.us/v2/past_meetings/${meetingIdOrUuid}/instances`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Não consegui listar instâncias da reunião ${meetingIdOrUuid} (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { meetings?: PastMeetingInstance[] };
  if (!data.meetings || data.meetings.length === 0) {
    throw new Error(`Reunião ${meetingIdOrUuid} não tem instâncias passadas`);
  }
  return data.meetings.map((m) => m.uuid);
}

function encodeMeetingUuid(uuid: string): string {
  if (uuid.includes("/") || uuid.includes("==")) {
    return encodeURIComponent(encodeURIComponent(uuid));
  }
  return uuid;
}

export interface ZoomParticipantRaw {
  id?: string;
  user_id?: string;
  name?: string;
  user_email?: string;
  join_time?: string;
  leave_time?: string;
  duration?: number;
  status?: string;
}

async function fetchParticipantsFromEndpoint(
  token: string,
  baseUrl: string,
): Promise<ZoomParticipantRaw[]> {
  const all: ZoomParticipantRaw[] = [];
  let nextPageToken = "";
  // 50 iterações * 300/page = 15000 participantes max — cobre webinars grandes
  for (let i = 0; i < 50; i++) {
    const url = new URL(baseUrl);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      const err: Error & { status?: number } = new Error(`Zoom API ${res.status}: ${detail.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = (await res.json()) as { participants?: ZoomParticipantRaw[]; next_page_token?: string };
    if (data.participants) all.push(...data.participants);
    if (!data.next_page_token) break;
    nextPageToken = data.next_page_token;
  }
  return all;
}

interface ParticipantsAttempt {
  endpoint: string;
  source: "webinar" | "meeting";
  identifier: "id" | "uuid";
}

/**
 * Tenta os 4 endpoints em PARALELO (Promise.allSettled). Quem retornar mais
 * participantes ganha. Se preferSource for passado (vem da primeira instância
 * da reunião), tenta só endpoints daquele source pra economizar.
 */
export async function fetchAllParticipants(
  token: string,
  meetingId: string,
  meetingUuid: string,
  preferSource?: "webinar" | "meeting",
): Promise<{
  participants: ZoomParticipantRaw[];
  source: "webinar" | "meeting";
}> {
  const encoded = encodeMeetingUuid(meetingUuid);
  const allAttempts: ParticipantsAttempt[] = [
    { endpoint: `https://api.zoom.us/v2/report/webinars/${meetingId}/participants`, source: "webinar", identifier: "id" },
    { endpoint: `https://api.zoom.us/v2/report/webinars/${encoded}/participants`, source: "webinar", identifier: "uuid" },
    { endpoint: `https://api.zoom.us/v2/report/meetings/${encoded}/participants`, source: "meeting", identifier: "uuid" },
    { endpoint: `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`, source: "meeting", identifier: "id" },
  ];
  // Memoização: se a primeira instância detectou source, só tenta endpoints
  // daquele source — economiza 50% das chamadas em reuniões com múltiplas
  // instâncias.
  const attempts = preferSource ? allAttempts.filter((a) => a.source === preferSource) : allAttempts;

  const results = await Promise.allSettled(
    attempts.map(async (attempt) => {
      const participants = await fetchParticipantsFromEndpoint(token, attempt.endpoint);
      return { participants, source: attempt.source };
    }),
  );

  // Pega o resultado com mais participantes
  let best: { participants: ZoomParticipantRaw[]; source: "webinar" | "meeting" } | null = null;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.participants.length > 0) {
      if (!best || r.value.participants.length > best.participants.length) {
        best = r.value;
      }
    }
  }

  if (best) return best;
  return { participants: [], source: preferSource ?? "meeting" };
}

export interface ZoomPastMeeting {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  type: number;
}

export async function listPastMeetings(token: string): Promise<ZoomPastMeeting[]> {
  const url = `https://api.zoom.us/v2/users/me/meetings?type=previous_meetings&page_size=300`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Zoom listar reuniões falhou (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { meetings?: ZoomPastMeeting[] };
  return data.meetings ?? [];
}

// ============================================================
// Story 28.6 — Chat das reuniões (arquivar antes do corte da API em 22/05)
// ============================================================

export interface ZoomChatMessage {
  sender: string;
  senderEmail?: string;
  dateTime: string; // ISO 8601
  message: string;
}

interface ZoomChatRaw {
  sender?: string;
  sender_email?: string;
  date_time?: string;
  message?: string;
}

/**
 * Busca chat da reunião. Tenta endpoints alternativos em ordem:
 *
 * 1. /metrics/meetings/{id}/chat — disponível em contas Plus/Enterprise
 * 2. /past_meetings/{id}/chat — requer "Save chat to cloud" habilitado
 *
 * Retorna `[]` graceful quando:
 * - Ambos endpoints retornam 404 (chat não habilitado / não disponível)
 * - Chat existe mas vazio
 *
 * Propaga erro quando:
 * - 5xx (problema do Zoom, sync deve falhar)
 * - 401/403 (credenciais inválidas, fix urgente)
 *
 * Pagina internamente até pegar todas as mensagens (page_size=300 × 20 max).
 */
export async function fetchMeetingChat(
  token: string,
  meetingId: string,
  meetingUuid: string,
): Promise<ZoomChatMessage[]> {
  const encoded = encodeMeetingUuid(meetingUuid);
  const endpoints = [
    `https://api.zoom.us/v2/metrics/meetings/${encoded}/chat`,
    `https://api.zoom.us/v2/metrics/meetings/${meetingId}/chat`,
    `https://api.zoom.us/v2/past_meetings/${encoded}/chat_messages`,
    `https://api.zoom.us/v2/past_meetings/${meetingId}/chat_messages`,
  ];

  for (const baseUrl of endpoints) {
    try {
      const all: ZoomChatRaw[] = [];
      let nextPageToken = "";
      for (let i = 0; i < 20; i++) {
        const url = new URL(baseUrl);
        url.searchParams.set("page_size", "300");
        if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // 404 / 400: endpoint não existe pra esta conta, tenta próximo
          if (res.status === 404 || res.status === 400) break;
          const detail = await res.text();
          const err: Error & { status?: number } = new Error(
            `Zoom chat ${res.status}: ${detail.slice(0, 200)}`,
          );
          err.status = res.status;
          throw err;
        }
        const data = (await res.json()) as {
          chat_messages?: ZoomChatRaw[];
          messages?: ZoomChatRaw[];
          next_page_token?: string;
        };
        const msgs = data.chat_messages ?? data.messages ?? [];
        if (msgs.length > 0) all.push(...msgs);
        if (!data.next_page_token) break;
        nextPageToken = data.next_page_token;
      }
      if (all.length > 0) {
        return all
          .filter((m) => m.date_time && m.message)
          .map((m) => ({
            sender: m.sender ?? "Desconhecido",
            senderEmail: m.sender_email,
            dateTime: m.date_time as string,
            message: m.message as string,
          }))
          .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
      }
      // Endpoint respondeu ok mas sem mensagens — tenta próximo (alguns
      // endpoints devolvem 200 com array vazio mesmo quando chat existe)
    } catch (err) {
      const status = (err as { status?: number }).status;
      // 4xx (exceto 404/400) ou 5xx propagam pro caller decidir
      if (status && status >= 500) throw err;
      // Outros erros: continua tentando próximo endpoint
    }
  }
  return [];
}
