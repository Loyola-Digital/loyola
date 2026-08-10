// Service RevenueCat — etapa Lyrio (app mobile).
//
// Dois canais (como o usuário pediu):
//  1) API Key (Secret v2): validar a conexão e listar os projects do RevenueCat
//     pro dropdown da etapa. Auth: header Authorization: Bearer <secret_key>.
//     GET https://api.revenuecat.com/v2/projects
//  2) Webhook: o RevenueCat empurra eventos (INITIAL_PURCHASE, RENEWAL, ...) que
//     armazenamos como vendas. A normalização do payload vive aqui.
//
// SEGURANÇA: a Secret Key e o app_user_id (PII) NUNCA devem ser logados.

import { createHash } from "node:crypto";
import { encrypt, decrypt } from "./encryption.js";

const API_BASE = "https://api.revenuecat.com/v2";
const REQUEST_TIMEOUT_MS = 15_000;

// ============================================================
// Cripto (reusa services/encryption.ts — AES-256-GCM)
// ============================================================

export function encryptRevenuecatKey(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptRevenuecatKey(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// REST v2 (API Key)
// ============================================================

export interface RevenuecatProject {
  id: string;
  name: string;
}

async function rcFetch(apiKey: string, path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      // Não incluir a key na mensagem. Só status + corpo curto do RevenueCat.
      const detail = await res.text().catch(() => "");
      throw new Error(`RevenueCat ${res.status}: ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Lista os projects do RevenueCat da conta da key. Usado no dropdown da etapa. */
export async function listRevenuecatProjects(apiKey: string): Promise<RevenuecatProject[]> {
  const data = (await rcFetch(apiKey, "/projects")) as {
    items?: Array<{ id?: unknown; name?: unknown }>;
  };
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .filter((p) => typeof p.id === "string")
    .map((p) => ({
      id: p.id as string,
      name: typeof p.name === "string" ? p.name : (p.id as string),
    }));
}

/** Valida a Secret Key: 1 chamada autenticada. Lança em falha. */
export async function verifyRevenuecatKey(apiKey: string): Promise<void> {
  await listRevenuecatProjects(apiKey);
}

// ============================================================
// Overview metrics (pull agregado via API key)
// ============================================================
// GET /v2/projects/{project_id}/metrics/overview — snapshot de métricas
// agregadas (mrr, assinaturas ativas, receita 28d, etc.). Requer que a Secret
// Key tenha a permissão `charts_metrics:overview:read`. Sem parâmetros de data.
// Docs: revenuecat.com/docs/api-v2 (Overview metrics).

export interface RevenuecatMetric {
  id: string;
  name: string;
  value: number;
  /** "$", "#", "%" ... quando o RevenueCat manda. null = não informado. */
  unit: string | null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

/**
 * Puxa as métricas de overview do project no RevenueCat. Parseia os DOIS shapes
 * conhecidos: `{ metrics: [{ id, name, value, unit }] }` (v2 atual) e o objeto
 * plano `{ mrr: 123, active_subscriptions: 456, ... }`.
 */
export async function getRevenuecatOverview(
  apiKey: string,
  rcProjectId: string,
): Promise<RevenuecatMetric[]> {
  const data = (await rcFetch(apiKey, `/projects/${rcProjectId}/metrics/overview`)) as
    | { metrics?: unknown }
    | Record<string, unknown>;

  const metricsArr = (data as { metrics?: unknown }).metrics;
  if (Array.isArray(metricsArr)) {
    return metricsArr
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .filter((m) => typeof m.id === "string")
      .map((m) => ({
        id: m.id as string,
        name: typeof m.name === "string" ? (m.name as string) : (m.id as string),
        value: toNumber(m.value),
        unit: typeof m.unit === "string" ? (m.unit as string) : null,
      }));
  }

  // Fallback: objeto plano id -> número.
  const out: RevenuecatMetric[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number") out.push({ id: k, name: k, value: v, unit: null });
  }
  return out;
}

// ============================================================
// Webhook — normalização de evento
// ============================================================

/** Tipos de evento que contam como VENDA (receita nova). */
export const REVENUE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
  "UNCANCELLATION",
]);

export interface NormalizedRevenuecatEvent {
  eventId: string;
  eventType: string | null;
  store: string | null;
  environment: string | null;
  appUserId: string | null;
  productId: string | null;
  countryCode: string | null;
  currency: string | null;
  priceInPurchasedCurrency: string | null;
  revenueUsd: string | null;
  purchasedAt: Date | null;
}

/** sha256 hex do corpo cru — idempotência fallback quando falta event.id. */
export function computeRevenuecatDedupKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** numérico -> string decimal (para colunas numeric) ou null. */
function num(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return v;
  return null;
}

/**
 * Extrai os campos de um webhook do RevenueCat. O payload vem como
 * `{ api_version, event: {...} }`. Campos documentados do RevenueCat — sem
 * invenção. Retorna null se não houver objeto de evento.
 */
export function normalizeRevenuecatEvent(
  payload: Record<string, unknown>,
  rawBody: string,
): NormalizedRevenuecatEvent | null {
  const ev = (payload.event ?? payload) as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== "object") return null;

  const purchasedMs = ev.purchased_at_ms;
  const purchasedAt =
    typeof purchasedMs === "number" && Number.isFinite(purchasedMs)
      ? new Date(purchasedMs)
      : null;

  return {
    // event.id é o identificador único do evento; fallback pro hash do corpo.
    eventId: str(ev.id) ?? computeRevenuecatDedupKey(rawBody),
    eventType: str(ev.type),
    store: str(ev.store),
    environment: str(ev.environment),
    appUserId: str(ev.app_user_id),
    productId: str(ev.product_id),
    countryCode: str(ev.country_code),
    currency: str(ev.currency),
    priceInPurchasedCurrency: num(ev.price_in_purchased_currency),
    // event.price é o valor em USD (estimado) do evento.
    revenueUsd: num(ev.price),
    purchasedAt,
  };
}
