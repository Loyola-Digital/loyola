import { z } from "zod";
import fp from "fastify-plugin";

// ============================================================
// POC — Zoom Meeting Participants
// ============================================================
//
// Não persiste nada. Recebe credenciais da request, gera token Server-to-Server
// OAuth, busca participants do Reports API e retorna. Pra validar viabilidade
// antes de virar epic com schema/integração formal.

const bodySchema = z.object({
  accountId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  meetingId: z.string().min(1),
});

interface ZoomTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface ZoomParticipantRaw {
  id?: string;
  user_id?: string;
  name?: string;
  user_email?: string;
  join_time?: string;
  leave_time?: string;
  duration?: number;
  status?: string;
}

interface ZoomParticipantsResponse {
  participants?: ZoomParticipantRaw[];
  page_count?: number;
  page_size?: number;
  total_records?: number;
  next_page_token?: string;
}

async function getServerToServerToken(accountId: string, clientId: string, clientSecret: string): Promise<string> {
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
  return json.access_token;
}

/**
 * Encode meetingUUID conforme docs Zoom: se contém "/" ou "==", precisa
 * encoding duplo. Caso contrário, pode passar direto.
 */
function encodeMeetingUuid(uuid: string): string {
  if (uuid.includes("/") || uuid.includes("==")) {
    return encodeURIComponent(encodeURIComponent(uuid));
  }
  return uuid;
}

async function fetchAllParticipants(token: string, meetingId: string): Promise<ZoomParticipantRaw[]> {
  const all: ZoomParticipantRaw[] = [];
  const encoded = encodeMeetingUuid(meetingId);
  let nextPageToken = "";
  for (let i = 0; i < 20; i++) {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encoded}/participants`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Zoom Reports API falhou (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as ZoomParticipantsResponse;
    if (data.participants) all.push(...data.participants);
    if (!data.next_page_token) break;
    nextPageToken = data.next_page_token;
  }
  return all;
}

export default fp(async function zoomPocRoutes(fastify) {
  fastify.post("/api/zoom-poc/participants", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Body inválido", details: parsed.error.flatten() });
    }
    const { accountId, clientId, clientSecret, meetingId } = parsed.data;
    try {
      const token = await getServerToServerToken(accountId, clientId, clientSecret);
      const participants = await fetchAllParticipants(token, meetingId);
      return {
        participants: participants.map((p) => ({
          id: p.id ?? null,
          name: p.name ?? "",
          email: p.user_email ?? null,
          joinTime: p.join_time ?? null,
          leaveTime: p.leave_time ?? null,
          durationSeconds: p.duration ?? 0,
          status: p.status ?? null,
        })),
        total: participants.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: "Erro ao consultar Zoom", details: message });
    }
  });
});
