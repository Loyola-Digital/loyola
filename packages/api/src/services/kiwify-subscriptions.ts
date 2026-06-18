// Story 35.6 (Epic 35 fase 2) — Normalização de webhooks de assinatura Kiwify.
//
// A Public API da Kiwify NÃO expõe estado de assinatura (sem /subscriptions); o
// estado real (vigente/cancelada/atrasada/reembolsada) só chega via WEBHOOKS.
// Este módulo é PURO (sem rede / sem db) e portanto testável isolado.
//
// O payload de webhook da Kiwify é notoriamente inconsistente: chaves ora
// capitalizadas (`Subscription`, `Customer`, `Product`, `Commissions`), ora
// snake_case, e o evento varia (`webhook_event_type`). Por isso a extração é
// DEFENSIVA: lê de múltiplos caminhos candidatos e nunca lança. O corpo cru é
// sempre persistido em kiwify_webhook_events, então a normalização pode ser
// refeita se o formato mudar.
//
// SEGURANÇA: customer_email / customer_name são PII — NUNCA logar.

import { createHash } from "node:crypto";

// ============================================================
// Tipos
// ============================================================

/** Payload de webhook cru (estrutura aberta — chaves variam). */
export type KiwifyWebhookPayload = Record<string, unknown>;

/** Estado normalizado de uma assinatura, extraído de um evento de webhook. */
export interface NormalizedKiwifySubscription {
  subscriptionId: string;
  status: KiwifySubscriptionStatus;
  productId: string | null;
  productName: string | null;
  planName: string | null;
  customerEmail: string | null;
  customerName: string | null;
  orderId: string | null;
  /** valor da recorrência em CENTAVOS, ou null. */
  amount: number | null;
  currency: string | null;
  startedAt: Date | null;
  nextChargeAt: Date | null;
  canceledAt: Date | null;
  eventType: string | null;
}

/** Status canônico de assinatura (normalizado dos vários sinônimos da Kiwify). */
export type KiwifySubscriptionStatus =
  | "active"
  | "waiting_payment"
  | "late"
  | "canceled"
  | "refunded"
  | "chargedback"
  | "trialing"
  | "completed"
  | "unknown";

// ============================================================
// Idempotência
// ============================================================

/** dedup_key = sha256 hex do corpo cru. Reenvios idênticos colidem e são ignorados. */
export function computeDedupKey(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

// ============================================================
// Helpers de leitura defensiva
// ============================================================

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Primeiro objeto não-nulo entre os caminhos candidatos (case-sensitive). */
function pickObject(root: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const k of keys) {
    const obj = asRecord(root[k]);
    if (obj) return obj;
  }
  return null;
}

/** Primeira string não-vazia entre os caminhos candidatos, varrendo vários objetos. */
function pickString(sources: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const v = src[k];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
  }
  return null;
}

/** Inteiro (centavos) a partir do primeiro campo numérico/parseável encontrado. */
function pickAmountCents(sources: Array<Record<string, unknown> | null>, keys: string[]): number | null {
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const v = src[k];
      if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
        return Math.round(Number(v));
      }
    }
  }
  return null;
}

/**
 * Parse tolerante de datas da Kiwify: ISO 8601, "YYYY-MM-DD HH:mm:ss" (tratado
 * como UTC) ou "YYYY-MM-DD". Retorna null para entradas inválidas/ausentes.
 */
export function parseKiwifyDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  // "YYYY-MM-DD HH:mm:ss" (sem timezone) -> assume UTC trocando espaço por "T" + "Z".
  const sqlLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const iso = sqlLike.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ============================================================
// Mapeamento de status
// ============================================================

const STATUS_SYNONYMS: Record<string, KiwifySubscriptionStatus> = {
  active: "active",
  paid: "active",
  approved: "active",
  authorized: "active",
  waiting_payment: "waiting_payment",
  pending: "waiting_payment",
  processing: "waiting_payment",
  late: "late",
  overdue: "late",
  delayed: "late",
  canceled: "canceled",
  cancelled: "canceled",
  refunded: "refunded",
  refund: "refunded",
  chargedback: "chargedback",
  chargeback: "chargedback",
  trialing: "trialing",
  trial: "trialing",
  completed: "completed",
  finished: "completed",
  ended: "completed",
};

/** Sinais no nome do evento (webhook_event_type) que implicam um status. */
const EVENT_STATUS_HINTS: Array<[RegExp, KiwifySubscriptionStatus]> = [
  [/cancel/i, "canceled"],
  [/late|overdue|delayed/i, "late"],
  [/renew|approved|paid|charge_completed/i, "active"],
  [/refund/i, "refunded"],
  [/chargeback|chargedback/i, "chargedback"],
];

/** Normaliza um status cru da Kiwify para o conjunto canônico. */
export function mapKiwifyStatus(raw: string | null | undefined): KiwifySubscriptionStatus {
  if (!raw) return "unknown";
  return STATUS_SYNONYMS[raw.trim().toLowerCase()] ?? "unknown";
}

/** Deriva o status do evento quando o objeto Subscription não traz status explícito. */
function statusFromEventType(eventType: string | null): KiwifySubscriptionStatus | null {
  if (!eventType) return null;
  for (const [re, status] of EVENT_STATUS_HINTS) {
    if (re.test(eventType)) return status;
  }
  return null;
}

// ============================================================
// Extração de campos de roteamento (usados mesmo sem assinatura)
// ============================================================

/** webhook_event_type / order_status cru, para o log. */
export function extractEventType(payload: KiwifyWebhookPayload): string | null {
  return pickString([payload], ["webhook_event_type", "event", "event_type", "order_status"]);
}

/** order_id da venda, para o log. */
export function extractOrderId(payload: KiwifyWebhookPayload): string | null {
  return pickString([payload], ["order_id", "order_ref", "id", "reference"]);
}

// ============================================================
// Normalização principal
// ============================================================

/**
 * Extrai o estado normalizado da assinatura de um evento de webhook.
 *
 * Retorna `null` quando o evento NÃO se refere a uma assinatura identificável
 * (ex.: venda avulsa sem subscription_id) — nesse caso só o log bruto é gravado.
 *
 * Precedência do status: Subscription.status explícito > dica do
 * webhook_event_type > "unknown".
 */
export function normalizeKiwifySubscriptionEvent(
  payload: KiwifyWebhookPayload,
): NormalizedKiwifySubscription | null {
  const subscription = pickObject(payload, ["Subscription", "subscription"]);
  const customer = pickObject(payload, ["Customer", "customer"]);
  const product = pickObject(payload, ["Product", "product"]);
  const plan =
    pickObject(subscription ?? {}, ["plan", "Plan"]) ?? pickObject(payload, ["Plan", "plan"]);
  const commissions = pickObject(payload, ["Commissions", "commissions"]);

  // subscription_id pode estar no objeto Subscription (id/subscription_id) ou no topo.
  const subscriptionId = pickString([subscription, payload], [
    "subscription_id",
    "id",
    "subscription",
  ]);
  if (!subscriptionId) return null; // não é (ou não dá para amarrar) uma assinatura

  const eventType = extractEventType(payload);
  const rawStatus = pickString([subscription, payload], ["status", "subscription_status"]);
  const status = rawStatus
    ? mapKiwifyStatus(rawStatus)
    : statusFromEventType(eventType) ?? "unknown";

  const canceledAt =
    status === "canceled"
      ? parseKiwifyDate(
          pickString([subscription, payload], ["canceled_at", "cancelled_at", "updated_at"]),
        )
      : null;

  return {
    subscriptionId,
    status,
    productId: pickString([product, subscription, payload], ["product_id", "id"]),
    productName: pickString([product, payload], ["product_name", "name"]),
    planName: pickString([plan], ["name", "plan_name"]),
    customerEmail: pickString([customer], ["email", "Email"]),
    customerName: pickString([customer], ["full_name", "name", "Full_name"]),
    orderId: extractOrderId(payload),
    amount: pickAmountCents([commissions, subscription, payload], [
      "charge_amount",
      "amount",
      "net_amount",
      "value",
      "price",
    ]),
    currency: pickString([commissions, subscription, payload], ["currency"]) ?? "BRL",
    startedAt: parseKiwifyDate(
      pickString([subscription, payload], ["start_date", "started_at", "created_at"]),
    ),
    nextChargeAt: parseKiwifyDate(
      pickString([subscription, payload], ["next_payment", "next_charge", "next_charge_at"]),
    ),
    canceledAt,
    eventType,
  };
}
