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

/**
 * Tenta buscar participantes como Webinar primeiro (encoded uuid). Se 404 (não
 * é webinar), cai pra Meeting. Usuário com 1900+ participantes geralmente é
 * webinar — Reports API de meeting limita ao plano default. Webinar Reports
 * exige scope `report:read:list_webinar_participants:admin` + Webinar add-on.
 */
export async function fetchAllParticipants(token: string, meetingUuid: string): Promise<{
  participants: ZoomParticipantRaw[];
  source: "webinar" | "meeting";
}> {
  const encoded = encodeMeetingUuid(meetingUuid);
  // 1ª tentativa: webinar
  try {
    const webinarParticipants = await fetchParticipantsFromEndpoint(
      token,
      `https://api.zoom.us/v2/report/webinars/${encoded}/participants`,
    );
    // Se retornou alguma coisa, é webinar válido
    if (webinarParticipants.length > 0) {
      return { participants: webinarParticipants, source: "webinar" };
    }
    // Vazio mas sem erro? Pode ser webinar sem participantes ou meeting — segue pro fallback
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    // 404/400 = não é webinar (segue pro fallback). Outro erro = relança.
    if (status !== 404 && status !== 400) throw err;
  }

  // 2ª tentativa: meeting
  const meetingParticipants = await fetchParticipantsFromEndpoint(
    token,
    `https://api.zoom.us/v2/report/meetings/${encoded}/participants`,
  );
  return { participants: meetingParticipants, source: "meeting" };
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
