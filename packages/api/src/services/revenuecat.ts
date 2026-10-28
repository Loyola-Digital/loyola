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
// Story 42.14 — receita por intervalo e a causa de uma falha
// ============================================================
//
// GET /v2/projects/{project_id}/metrics/revenue?start_date&end_date — o
// endpoint de intervalo do domínio Charts & Metrics (documentação oficial
// `api-v2/charts-and-metrics.md`, lida em 2026-10-16).
//
// Conferido na sonda de produção `rc-formato.mjs` (Danilo, 2026-10-16, ~15:30Z):
//  - `value` em dólares: 2531.46 para 19/09–16/10, o mesmo `summary.total` do
//    chart `revenue` no intervalo — o intervalo é INCLUSIVO nas duas pontas;
//  - `revenue_type` default = `revenue`, a receita bruta (o `proceeds` deu 1619.15);
//    a descrição oficial da medida: "total revenue … minus refunds and downward
//    subscription payment adjustments";
//  - `currency` = USD (com e sem `currency=USD`); `start_date`/`end_date` ecoados
//    como AAAA-MM-DD;
//  - os dias são de UTC (não de SP), e o dia de hoje vem incompleto.
// A leitura continua estrita: `value` não numérico é ERRO, nunca zero.

/** O que a rota de receita precisa da resposta de `/metrics/revenue`. */
export interface ReceitaDoRevenuecat {
  valor: number;
  moeda: string;
  tipoDeReceita: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Receita do projeto num intervalo de DIAS (`AAAA-MM-DD`, inclusivo).
 *
 * - `revenue_type=revenue`: a receita BRUTA (PO-D5, P18) — o default
 *   documentado e o que o card media com `revenue_last_28_days`.
 * - `currency=USD` (PO-12): sem ele a API devolve na moeda principal do
 *   projeto, que ninguém conferiu ser dólar. A moeda devolvida é CONFERIDA:
 *   qualquer outra vira erro, porque o card formata em US$.
 */
export async function getRevenuecatRevenue(
  apiKey: string,
  rcProjectId: string,
  intervalo: { startDate: string; endDate: string },
): Promise<ReceitaDoRevenuecat> {
  const qs = new URLSearchParams({
    start_date: intervalo.startDate,
    end_date: intervalo.endDate,
    currency: "USD",
    revenue_type: "revenue",
  });
  const data = (await rcFetch(apiKey, `/projects/${rcProjectId}/metrics/revenue?${qs.toString()}`)) as Record<string, unknown>;
  const valor = data?.value;
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`Resposta inesperada do RevenueCat em metrics/revenue: "value" não é número (${JSON.stringify(valor)?.slice(0, 40)})`);
  }
  const moeda = typeof data.currency === "string" ? data.currency : null;
  if (moeda !== "USD") {
    throw new Error(`O RevenueCat devolveu a receita em ${moeda ?? "moeda não informada"}, não em USD — o card formata em dólar.`);
  }
  return {
    valor,
    moeda,
    tipoDeReceita: typeof data.revenue_type === "string" ? data.revenue_type : null,
    startDate: typeof data.start_date === "string" ? data.start_date : null,
    endDate: typeof data.end_date === "string" ? data.end_date : null,
  };
}

/** O total de um chart de contagem num intervalo de DIAS, e o que veio junto. */
export interface TotalDoChart {
  total: number;
  /** O `display_name` da medida (a chave do `summary.total`). */
  medida: string;
  /** Quantos dias vieram com `incomplete: true` (hoje, em andamento). */
  diasIncompletos: number;
}

/**
 * Story 42.14 (D22) — o total de um chart de UMA medida num intervalo de dias
 * (`AAAA-MM-DD`, inclusivo), pelo `summary.total` da resposta.
 *
 * Forma conferida na sonda de produção (2026-10-16): `measures[]` (cada uma com
 * `display_name`), `values[]` = `{ cohort, incomplete, measure, value }` por dia
 * em UTC, e `summary.total` indexado pelo `display_name` da medida — presente
 * em `revenue` e `customers_new`; `customers_active` e `actives` só trazem
 * `summary.average`, e por isso NÃO passam por aqui (somar os dias de
 * "clientes vistos no período" contaria a mesma pessoa várias vezes).
 *
 * Estrita: mais de uma medida, medida sem nome ou total que não seja número
 * finito é ERRO — nunca um zero nem um total de outra medida.
 */
export async function getRevenuecatChartTotal(
  apiKey: string,
  rcProjectId: string,
  chart: "customers_new",
  intervalo: { startDate: string; endDate: string },
): Promise<TotalDoChart> {
  const qs = new URLSearchParams({ start_date: intervalo.startDate, end_date: intervalo.endDate });
  const data = (await rcFetch(apiKey, `/projects/${rcProjectId}/charts/${chart}?${qs.toString()}`)) as Record<string, unknown>;
  const measures = Array.isArray(data?.measures) ? (data.measures as Record<string, unknown>[]) : null;
  if (!measures || measures.length !== 1 || typeof measures[0]?.display_name !== "string") {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: esperava UMA medida com display_name (veio ${measures ? measures.length : "nenhuma"})`);
  }
  const medida = measures[0].display_name as string;
  const total = ((data.summary as { total?: Record<string, unknown> } | undefined)?.total ?? {})[medida];
  if (typeof total !== "number" || !Number.isFinite(total)) {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: summary.total["${medida}"] não é número`);
  }
  const values = Array.isArray(data.values) ? (data.values as { incomplete?: unknown }[]) : [];
  return { total, medida, diasIncompletos: values.filter((v) => v?.incomplete === true).length };
}

/** O valor de um chart de ESTOQUE num dia: o que veio e o que a resposta diz dele. */
export interface ValorDoChartNoDia {
  valor: number;
  /** O `display_name` da medida (ex.: "Actives"). */
  medida: string;
  /** O dia veio com `incomplete: true` (hoje, em andamento). */
  incompleto: boolean;
}

/** `AAAA-MM-DD` → o instante 00:00 de UTC desse dia, em segundos (o `cohort` do chart). */
function cohortDoDia(dia: string): number {
  return Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) / 1000;
}

/**
 * Story 42.15 (AC10c) — o valor de um chart de ESTOQUE (`actives`: assinaturas
 * PAGAS ativas, "Active (paying) subscriptions" na documentação) num dia só,
 * pedido com `start_date = end_date = dia`.
 *
 * Forma conferida na sonda de produção (2026-10-28, `actives`): `resolution`
 * "day"; UMA medida, `display_name` "Actives", unidade "#"; `values[]` =
 * `{ cohort, incomplete, measure, value }`, um por dia de UTC (`cohort` = 00:00Z
 * do dia, em segundos); `summary` só com `average` (estoque não tem total). O
 * dia é o de UTC, não o de SP: quem chama declara isso.
 *
 * Estrita: resolução diferente de dia, mais de uma medida, nenhum valor (ou
 * mais de um) para o dia pedido, ou valor que não é número finito → ERRO, nunca
 * zero nem o número de outro dia.
 */
export async function getRevenuecatChartNoDia(
  apiKey: string,
  rcProjectId: string,
  chart: "actives",
  dia: string,
): Promise<ValorDoChartNoDia> {
  const qs = new URLSearchParams({ start_date: dia, end_date: dia });
  const data = (await rcFetch(apiKey, `/projects/${rcProjectId}/charts/${chart}?${qs.toString()}`)) as Record<string, unknown>;
  if (data?.resolution !== "day") {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: resolução "${String(data?.resolution)}", esperava "day"`);
  }
  const measures = Array.isArray(data.measures) ? (data.measures as Record<string, unknown>[]) : null;
  if (!measures || measures.length !== 1 || typeof measures[0]?.display_name !== "string") {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: esperava UMA medida com display_name (veio ${measures ? measures.length : "nenhuma"})`);
  }
  const alvo = cohortDoDia(dia);
  const values = Array.isArray(data.values) ? (data.values as { cohort?: unknown; measure?: unknown; value?: unknown; incomplete?: unknown }[]) : [];
  const doDia = values.filter((v) => v?.cohort === alvo && (v.measure === 0 || v.measure === undefined));
  if (doDia.length !== 1) {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: esperava UM valor para ${dia} (veio ${doDia.length})`);
  }
  const valor = doDia[0].value;
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`Resposta inesperada do RevenueCat em charts/${chart}: o valor de ${dia} não é número`);
  }
  return { valor, medida: measures[0].display_name as string, incompleto: doDia[0].incomplete === true };
}

export type CausaDaFalhaDoRevenuecat = "limite" | "permissao" | "outro";

/**
 * PO-D4 (1) — a causa de uma falha numa chamada ao RevenueCat, lida da mensagem
 * que o `rcFetch` monta (`RevenueCat {status}: …`). 429 = limite de 25
 * requisições por minuto do domínio Charts & Metrics (compartilhado entre
 * overview, receita e charts); 403 = a Secret Key sem a permissão de leitura.
 */
export function causaDaFalhaDoRevenuecat(err: unknown): CausaDaFalhaDoRevenuecat {
  const msg = err instanceof Error ? err.message : String(err);
  if (/^RevenueCat 429\b/.test(msg)) return "limite";
  if (/^RevenueCat 403\b/.test(msg)) return "permissao";
  return "outro";
}

/**
 * A resposta de erro das rotas que chamam o RevenueCat: `{ error, details,
 * causa }` — nunca 200 com `null` ou 0. O 429 do RevenueCat sai como 429 (o
 * front não insiste: repetir gasta o limite e não muda a resposta dentro do
 * minuto); o resto sai como 502. A key nunca entra no texto (o `rcFetch` já
 * não a inclui).
 */
export function respostaDeFalhaDoRevenuecat(err: unknown, oQue: string): {
  status: number;
  corpo: { error: string; details: string; causa: CausaDaFalhaDoRevenuecat };
} {
  const causa = causaDaFalhaDoRevenuecat(err);
  const details = err instanceof Error ? err.message : String(err);
  const error =
    causa === "limite"
      ? `Limite de consultas do RevenueCat atingido ao puxar ${oQue} (25 por minuto, compartilhado entre overview, receita e gráficos). Tente de novo em 1 minuto.`
      : causa === "permissao"
        ? `A Secret API Key do RevenueCat não tem permissão para ${oQue}. Confirme a permissão de leitura de métricas (charts_metrics:overview:read).`
        : `Não foi possível puxar ${oQue} do RevenueCat.`;
  return { status: causa === "limite" ? 429 : 502, corpo: { error, details, causa } };
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
  /** Instante do evento — preenchido também nos que não são compra (paywall). */
  eventAt: Date | null;
  // Story 42.6 — atribuição. Vem de `event.subscriber_attributes`, que o app
  // preenche. NUNCA extrair PII daqui ($email, $phoneNumber, $ip, $idfa...):
  // esses atributos seguem só no `payload`, como sempre estiveram.
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  fbclid: string | null;
  /** Atributo custom do app Lyrio: paid_ads | referral_url | play_store_organic. */
  acquisitionSource: string | null;
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

// ============================================================
// Story 42.6 — atribuição em `subscriber_attributes`
// ============================================================

/**
 * Valores que existem no payload mas não são atribuição:
 *
 *  - `{{ad.id}}`, `{{campaign.id}}`, `{{adset.id}}` — macro da Meta que não
 *    interpolou. Medido em produção (2026-08-14): 8 eventos. Persistir isso
 *    cria um "anúncio" chamado `{{ad.id}}` na tabela de Detalhamento.
 *  - `(not set)` — ausência declarada pela origem. 170 eventos.
 */
function ehLixoDeAtribuicao(valor: string): boolean {
  if (/^\{\{.*\}\}$/.test(valor)) return true;
  return valor === "(not set)";
}

/**
 * Lê um atributo de `subscriber_attributes`.
 *
 * O RevenueCat entrega o mesmo campo em DOIS formatos, e os dois chegam em
 * produção hoje: objeto `{ value, updated_at_ms }` (34 eventos em
 * `utm_campaign`) e string plana (3.226). Ler só um perde 99% ou 1% do dado,
 * dependendo de qual for escolhido — por isso esta função existe separada e
 * testada, em vez de um `attrs[k]?.value` espalhado pelo normalize.
 *
 * Devolve `null` para ausente, vazio e lixo conhecido (ver `ehLixoDeAtribuicao`).
 */
export function readSubscriberAttribute(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null;
  const bruto = (attrs as Record<string, unknown>)[key];

  let valor: string | null = null;
  if (typeof bruto === "string") {
    valor = bruto;
  } else if (typeof bruto === "number" && Number.isFinite(bruto)) {
    valor = String(bruto);
  } else if (typeof bruto === "boolean") {
    valor = String(bruto);
  } else if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    const interno = (bruto as Record<string, unknown>).value;
    if (typeof interno === "string") valor = interno;
    else if (typeof interno === "number" && Number.isFinite(interno)) valor = String(interno);
    else if (typeof interno === "boolean") valor = String(interno);
  }

  if (valor === null) return null;
  const limpo = valor.trim();
  if (limpo === "") return null;
  return ehLixoDeAtribuicao(limpo) ? null : limpo;
}

/** Primeiro atributo não-nulo da lista. `utm_*` vem antes do reservado com `$`. */
function primeiroAtributo(attrs: unknown, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = readSubscriberAttribute(attrs, k);
    if (v !== null) return v;
  }
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
  // Evento de verdade sempre traz `type`. Sem ele (corpo vazio, ping de
  // conexão, JSON de outra origem) não há o que registrar — e sem esta guarda
  // um POST `{}` autenticado criava uma linha só com nulos, com o hash do corpo
  // fazendo as vezes de id.
  if (!str(ev.type)) return null;

  const paraData = (valor: unknown): Date | null => {
    const ms = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
  };

  // Story 42.6: o mapa de atributos do cliente. Chega em todos os 7.711
  // eventos recebidos até 2026-08-14, mas o RevenueCat não garante — daí o
  // acesso sempre passar por `readSubscriberAttribute`, que tolera ausência.
  const attrs = ev.subscriber_attributes;

  const purchasedAt = paraData(ev.purchased_at_ms);
  // Evento de paywall (PAYWALL_IMPRESSION, PAYWALL_CLOSE…) não tem
  // `purchased_at_ms` — carimba em `event_timestamp_ms`. Sem esse fallback ele
  // entrava no banco sem data e sumia de qualquer leitura por período.
  const eventAt = paraData(ev.event_timestamp_ms) ?? purchasedAt;

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
    eventAt,
    // `utm_*` vence; o reservado com `$` só entra quando o utm correspondente
    // falta ou foi descartado. Em produção os dois vêm espelhados (utm_campaign
    // e $campaign aparecem no mesmo número de eventos), mas a precedência
    // precisa ser determinística para o dado não oscilar entre execuções.
    utmSource: primeiroAtributo(attrs, "utm_source", "$mediaSource"),
    utmMedium: primeiroAtributo(attrs, "utm_medium"),
    utmCampaign: primeiroAtributo(attrs, "utm_campaign", "$campaign"),
    utmTerm: primeiroAtributo(attrs, "utm_term", "$keyword"),
    utmContent: primeiroAtributo(attrs, "utm_content", "$creative"),
    gclid: primeiroAtributo(attrs, "gclid"),
    fbclid: primeiroAtributo(attrs, "fbclid"),
    acquisitionSource: primeiroAtributo(attrs, "acquisition_source"),
  };
}
