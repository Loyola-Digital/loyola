// Story 32.1 — Cliente da REST API do Mautic (Basic Auth).
//
// Auth: header `Authorization: Basic base64(username:password)`. Base `{url}/api`.
// Endpoints usados:
//   GET /api/campaigns            → lista campanhas (objeto keyed por id)
//   GET /api/campaigns/{id}       → campanha + events[] (email.send → properties.email)
//   GET /api/emails/{id}          → email com sentCount / readCount (aberturas)
//
// Limitação conhecida: cliques NÃO vêm no objeto email padrão da API nem em
// endpoint dedicado — só `sentCount` (enviados) e `readCount` (aberturas).

import { encrypt, decrypt } from "./encryption.js";

export interface MauticCampaign {
  id: string;
  name: string;
}

export interface MauticEmailStats {
  /** Nº de emails (email.send) na campanha. */
  emailCount: number;
  sent: number;
  opens: number;
  /** opens / sent (0..1). null se sent === 0. */
  openRate: number | null;
}

export function encryptMauticPassword(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptMauticPassword(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

/** Remove barra final pra montar `${base}/api/...` de forma previsível. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function mauticFetch<T>(
  baseUrl: string,
  username: string,
  password: string,
  path: string,
): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}/api${path}`;
  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { errors?: Array<{ message?: string }> };
      detail = body?.errors?.[0]?.message ?? "";
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(`Mautic API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Testa as credenciais batendo num endpoint leve. Lança erro com mensagem
 * legível se falhar (credencial inválida, Basic Auth desabilitado, URL errada).
 */
export async function testMauticConnection(
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> {
  // /api/campaigns?limit=1 é leve e exige auth válida.
  await mauticFetch<unknown>(baseUrl, username, password, "/campaigns?limit=1");
}

type MauticCampaignsResponse = {
  total?: number | string;
  campaigns?: Record<string, { id: number | string; name: string }>;
};

/** Lista campanhas (id+name). Mautic retorna `campaigns` como objeto keyed por id. */
export async function listMauticCampaigns(
  baseUrl: string,
  username: string,
  password: string,
): Promise<MauticCampaign[]> {
  const data = await mauticFetch<MauticCampaignsResponse>(
    baseUrl,
    username,
    password,
    "/campaigns?limit=200&orderBy=name&orderByDir=ASC",
  );
  const campaignsObj = data.campaigns ?? {};
  return Object.values(campaignsObj).map((c) => ({
    id: String(c.id),
    name: c.name,
  }));
}

type MauticCampaignDetailResponse = {
  campaign?: {
    id: number | string;
    name: string;
    events?: Record<
      string,
      { type?: string; eventType?: string; properties?: { email?: number | string } }
    >;
  };
};

type MauticEmailResponse = {
  email?: { id: number | string; sentCount?: number | string; readCount?: number | string };
};

/**
 * Agrega métricas de email de uma campanha: percorre os events `email.send`,
 * pega os email ids e soma sentCount/readCount de cada email.
 */
export async function getMauticCampaignEmailStats(
  baseUrl: string,
  username: string,
  password: string,
  campaignId: string,
): Promise<MauticEmailStats> {
  const detail = await mauticFetch<MauticCampaignDetailResponse>(
    baseUrl,
    username,
    password,
    `/campaigns/${encodeURIComponent(campaignId)}`,
  );
  const events = detail.campaign?.events ?? {};
  // Coleta email ids únicos dos events de envio de email.
  const emailIds = new Set<string>();
  for (const ev of Object.values(events)) {
    const isEmailSend =
      ev.type === "email.send" || ev.eventType === "email.send" || ev.type === "email.send.email";
    const emailId = ev.properties?.email;
    if (isEmailSend && emailId != null && String(emailId).trim() !== "") {
      emailIds.add(String(emailId));
    }
  }

  let sent = 0;
  let opens = 0;
  for (const emailId of emailIds) {
    try {
      const emailResp = await mauticFetch<MauticEmailResponse>(
        baseUrl,
        username,
        password,
        `/emails/${encodeURIComponent(emailId)}`,
      );
      sent += Number(emailResp.email?.sentCount ?? 0) || 0;
      opens += Number(emailResp.email?.readCount ?? 0) || 0;
    } catch {
      // Email individual falhou — segue agregando os demais.
    }
  }

  return {
    emailCount: emailIds.size,
    sent,
    opens,
    openRate: sent > 0 ? opens / sent : null,
  };
}

/**
 * Auto-match: acha a campanha cujo nome contém o token do funil (ex.: "fz-l2").
 * Case-insensitive, ignora espaços nas pontas. Retorna a 1ª que casar (nome
 * mais curto primeiro, pra evitar pegar uma variante mais específica por engano).
 */
export function matchCampaignByName(
  campaigns: MauticCampaign[],
  token: string,
): MauticCampaign | null {
  const needle = token.trim().toLowerCase();
  if (!needle) return null;
  const matches = campaigns
    .filter((c) => c.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.length - b.name.length);
  return matches[0] ?? null;
}
