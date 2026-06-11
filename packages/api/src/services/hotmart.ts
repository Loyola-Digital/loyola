// Story 34.2 — Service Hotmart (Assinaturas / recorrência).
//
// Auth: OAuth2 client_credentials.
//   POST https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=..&client_secret=..
//   header Authorization: Basic base64(client_id:client_secret)
//   -> { access_token, token_type: "bearer", expires_in (segundos) }
//   Só o access_token expira -> cachear em memória e renovar ~5 min antes do expires_in.
// APIs de dados: https://developers.hotmart.com/payments/api/v1, header Authorization: Bearer <access_token>.
//
// SEGURANÇA: NUNCA logar/serializar client_secret nem o Basic. PII do subscriber
// nunca é logada. Mensagens de erro carregam só status + detalhe da Hotmart.

import { encrypt, decrypt } from "./encryption.js";

const TOKEN_URL = "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_BASE = "https://developers.hotmart.com/payments/api/v1";

// Renova o token 5 min (300s) antes do expires_in.
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

// Guarda contra loop infinito na auto-paginação por cursor.
const MAX_PAGES = 200;

// ============================================================
// Tipos
// ============================================================

export interface MoneyByCurrency {
  /** currency_code (ex.: "BRL", "USD"). */
  currency: string;
  value: number;
}

export interface HotmartPlan {
  id?: number | string;
  name?: string;
  /** Período de recorrência em DIAS (30=mensal, 360=anual). */
  recurrency_period?: number;
  max_charge_cycles?: number;
}

export interface HotmartPrice {
  value?: number;
  currency_code?: string;
}

export interface HotmartProductRef {
  id?: number | string;
  name?: string;
  ucode?: string;
}

/**
 * Item de /subscriptions/summary. PEGADINHA confirmada ao vivo: este endpoint
 * NÃO retorna `price` nem `date_next_charge` — só `lifetime` (em DIAS, não em
 * ciclos), `plan`, `status`, `product`. Por isso é usado SÓ como base do LT.
 * MRR/LTV/renovações vêm de /subscriptions (HotmartActiveSub), que tem price.
 */
export interface HotmartSummaryItem {
  subscriber_code?: string;
  subscription_id?: number | string;
  status?: string;
  /** Tempo de vida da assinatura em DIAS (ex.: 238 ≈ 8 meses). NÃO é nº de ciclos. */
  lifetime?: number;
  accession_date?: number;
  last_recurrency?: unknown;
  plan?: HotmartPlan;
  product?: HotmartProductRef;
}

/**
 * Item de /subscriptions (NÃO o /summary). Confirmado ao vivo: traz `price`,
 * `date_next_charge` e `plan.recurrency_period` — base de MRR, renovações do
 * próximo mês e LTV. Não traz `lifetime` (esse só no /summary).
 */
export interface HotmartActiveSub {
  subscriber_code?: string;
  status?: string;
  price?: HotmartPrice;
  /** epoch ms UTC da próxima cobrança. */
  date_next_charge?: number;
  plan?: HotmartPlan;
  product?: HotmartProductRef;
}

export interface HotmartSalesSummaryItem {
  total_items?: number;
  total_value?: { value?: number; currency_code?: string };
}

export interface HotmartDashboard {
  totalSubscriptions: number;
  activeSubscriptions: number; // ACTIVE
  cancelledSubscriptions: number; // CANCELLED_BY_*
  overdueSubscriptions: number; // OVERDUE + DELAYED
  refunded: { totalItems: number; totalValue: MoneyByCurrency[] };
  mrr: MoneyByCurrency[]; // por moeda
  ltv: MoneyByCurrency[]; // por moeda
  ltMonths: number; // LT médio em meses
  retentionRate: number; // 0..1 (ativas/total)
  churnRate: number; // 0..1 (canceladas/total)
  nextMonthRenewals: { count: number; expectedRevenue: MoneyByCurrency[] };
  statusDistribution: Array<{ status: string; count: number }>;
  currencyPrimary: string; // "BRL"
}

/** Statuses de assinatura confirmados ao vivo. */
export const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "DELAYED",
  "OVERDUE",
  "STARTED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "CANCELLED_BY_ADMIN",
] as const;

export const CANCELLED_STATUSES = [
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "CANCELLED_BY_ADMIN",
] as const;

export const OVERDUE_STATUSES = ["OVERDUE", "DELAYED"] as const;

const PRIMARY_CURRENCY = "BRL";

// ============================================================
// Cripto (reusa services/encryption.ts — AES-256-GCM)
// ============================================================

export function encryptHotmartSecret(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptHotmartSecret(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// Helpers de data — a API espera/retorna epoch MILISSEGUNDOS UTC.
// ============================================================

export function nowMs(): number {
  return Date.now();
}

/** epoch ms de `hoje − months` (UTC). Default do dashboard: months=12. */
export function monthsAgoMs(months: number, refMs: number = Date.now()): number {
  const d = new Date(refMs);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() - months,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/**
 * Janela do PRÓXIMO mês em UTC:
 *   startMs = 1º dia 00:00:00.000
 *   endMs   = último dia 23:59:59.999
 * Cobre meses de 28/30/31 dias e virada de ano (mês 11 -> próximo = 0 do ano seguinte).
 */
export function nextMonthWindow(refMs: number = Date.now()): { startMs: number; endMs: number } {
  const d = new Date(refMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  // Date.UTC normaliza overflow de mês (month+1 === 12 -> jan do ano seguinte).
  const startMs = Date.UTC(year, month + 1, 1, 0, 0, 0, 0);
  // Dia 0 do mês seguinte ao próximo = último dia do próximo mês.
  const endMs = Date.UTC(year, month + 2, 0, 23, 59, 59, 999);
  return { startMs, endMs };
}

// ============================================================
// OAuth2 client_credentials — cache em memória por par de credenciais
// ============================================================

interface CachedToken {
  accessToken: string;
  /** epoch ms em que o token expira de fato (já com skew de refresh aplicado no read). */
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Chave de cache do token. NÃO usa o secret em claro como chave logável. */
function tokenCacheKey(clientId: string, clientSecret: string): string {
  return `${clientId}:${clientSecret}`;
}

interface HotmartTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Token OAuth2 client_credentials. Reutiliza o cache enquanto válido; renova
 * ~5 min antes do expires_in. Em falha, lança Error sem vazar clientSecret/Basic.
 */
export async function getHotmartToken(clientId: string, clientSecret: string): Promise<string> {
  const key = tokenCacheKey(clientId, clientSecret);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const qs = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(`${TOKEN_URL}?${qs.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
      },
    });
  } catch {
    // Nunca incluir basic/secret na mensagem.
    throw new Error("Falha de rede ao autenticar na Hotmart");
  }

  if (!res.ok) {
    // Mensagem genérica + status. NÃO inclui credenciais.
    throw new Error(`Hotmart OAuth ${res.status}: credenciais inválidas ou indisponíveis`);
  }

  let data: HotmartTokenResponse;
  try {
    data = (await res.json()) as HotmartTokenResponse;
  } catch {
    throw new Error("Resposta de token da Hotmart inválida (JSON)");
  }

  if (!data.access_token) {
    throw new Error("Hotmart não retornou access_token");
  }

  const expiresInSec = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  const expiresAtMs = Date.now() + expiresInSec * 1000 - TOKEN_REFRESH_SKEW_MS;
  tokenCache.set(key, { accessToken: data.access_token, expiresAtMs });
  return data.access_token;
}

/** Limpa o cache de token (uso em testes / troca de credencial). */
export function clearHotmartTokenCache(): void {
  tokenCache.clear();
}

// ============================================================
// Cliente HTTP genérico — base v1, Bearer
// ============================================================

export async function hotmartGet<T>(
  token: string,
  path: string,
  params?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      qs.append(k, String(v));
    }
  }
  const query = qs.toString();
  const url = `${API_BASE}${path}${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as {
        message?: string;
        error_description?: string;
        error?: string;
      };
      detail = body?.message ?? body?.error_description ?? body?.error ?? "";
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(`Hotmart API ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  return (await res.json()) as T;
}

// ============================================================
// Fetchers
// ============================================================

interface SubscriptionsResponse {
  items?: HotmartSummaryItem[];
  page_info?: { total_results?: number; next_page_token?: string | null };
}

/**
 * Contagem por status SEM baixar todos os itens: lê page_info.total_results.
 * SEMPRE passa accession_date (a API default = últimos 30 dias de adesão).
 */
export async function fetchSubscriptionCount(
  token: string,
  args: { productId: string; status?: string; accessionFrom: number; accessionTo?: number },
): Promise<number> {
  const data = await hotmartGet<SubscriptionsResponse>(token, "/subscriptions", {
    product_id: args.productId,
    status: args.status,
    accession_date: args.accessionFrom,
    end_accession_date: args.accessionTo,
    max_results: 1,
  });
  return data.page_info?.total_results ?? 0;
}

interface SubscriptionsSummaryResponse {
  items?: HotmartSummaryItem[];
  page_info?: { total_results?: number; next_page_token?: string | null };
}

/**
 * Varre /subscriptions/summary com auto-paginação por cursor (page_token /
 * next_page_token) até esgotar. Guarda contra loop infinito (MAX_PAGES + break
 * quando next_page_token ausente ou repetido). SEMPRE passa accession_date.
 */
export async function fetchSubscriptionsSummary(
  token: string,
  args: { productId?: string; accessionFrom: number },
): Promise<HotmartSummaryItem[]> {
  const out: HotmartSummaryItem[] = [];
  let pageToken: string | undefined;
  let lastToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await hotmartGet<SubscriptionsSummaryResponse>(token, "/subscriptions/summary", {
      product_id: args.productId,
      accession_date: args.accessionFrom,
      max_results: 100,
      page_token: pageToken,
    });
    if (data.items?.length) out.push(...data.items);

    const next = data.page_info?.next_page_token;
    if (!next || next === lastToken) break;
    lastToken = next;
    pageToken = next;
  }

  return out;
}

interface SubscriptionsDetailedResponse {
  items?: HotmartActiveSub[];
  page_info?: { total_results?: number; next_page_token?: string | null };
}

/**
 * Varre /subscriptions (NÃO o /summary) com auto-paginação por cursor. Este
 * endpoint traz `price`, `date_next_charge` e `plan` — usado pra coletar as
 * assinaturas ACTIVE (base de MRR, renovações e LTV). Mesmo guard de loop do
 * summary (MAX_PAGES + break em token ausente/repetido).
 */
export async function fetchSubscriptionsDetailed(
  token: string,
  args: { productId: string; status: string; accessionFrom: number; accessionTo?: number },
): Promise<HotmartActiveSub[]> {
  const out: HotmartActiveSub[] = [];
  let pageToken: string | undefined;
  let lastToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await hotmartGet<SubscriptionsDetailedResponse>(token, "/subscriptions", {
      product_id: args.productId,
      status: args.status,
      accession_date: args.accessionFrom,
      end_accession_date: args.accessionTo,
      max_results: 100,
      page_token: pageToken,
    });
    if (data.items?.length) out.push(...data.items);

    const next = data.page_info?.next_page_token;
    if (!next || next === lastToken) break;
    lastToken = next;
    pageToken = next;
  }

  return out;
}

interface SalesSummaryResponse {
  items?: HotmartSalesSummaryItem[];
}

/**
 * /sales/summary agrupado por moeda. PEGADINHA: SEM transaction_status a API
 * retorna só APPROVED+COMPLETE -> sempre passar status quando se quer um recorte
 * específico (ex.: REFUNDED para reembolsos).
 */
export async function fetchSalesSummaryByStatus(
  token: string,
  args: { productId: string; status?: string; from: number; to: number },
): Promise<HotmartSalesSummaryItem[]> {
  const data = await hotmartGet<SalesSummaryResponse>(token, "/sales/summary", {
    product_id: args.productId,
    transaction_status: args.status,
    start_date: args.from,
    end_date: args.to,
  });
  return data.items ?? [];
}

/**
 * Produtos distintos ({ id, name }) derivados de /subscriptions/summary.
 * O endpoint v2 de produtos retorna 401 com esta auth -> derivar é robusto.
 * Sem duplicatas; ordenado por name.
 */
export async function listHotmartProducts(
  token: string,
  accessionFrom: number,
): Promise<Array<{ id: string; name: string }>> {
  const items = await fetchSubscriptionsSummary(token, { accessionFrom });
  return distinctProducts(items);
}

// ============================================================
// Agregação pura (testável sem rede)
// ============================================================

/** Deriva produtos distintos { id, name } de um array de summary items. */
export function distinctProducts(items: HotmartSummaryItem[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const it of items) {
    const id = it.product?.id;
    if (id === undefined || id === null || String(id).trim() === "") continue;
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, it.product?.name ?? key);
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Soma valores por currency_code, retornando um array MoneyByCurrency (BRL primeiro). */
function moneyByCurrencyFromMap(map: Map<string, number>): MoneyByCurrency[] {
  const arr = Array.from(map.entries()).map(([currency, value]) => ({ currency, value }));
  return sortCurrencyPrimaryFirst(arr);
}

/** Ordena moedas com a primária (BRL) primeiro, demais alfabéticas. */
function sortCurrencyPrimaryFirst(arr: MoneyByCurrency[]): MoneyByCurrency[] {
  return arr.sort((a, b) => {
    if (a.currency === PRIMARY_CURRENCY) return -1;
    if (b.currency === PRIMARY_CURRENCY) return 1;
    return a.currency.localeCompare(b.currency);
  });
}

export interface AggregateInput {
  /**
   * Assinaturas ACTIVE detalhadas (de /subscriptions, COM price e
   * date_next_charge). Base de MRR, renovações do próximo mês e LTV.
   */
  activeSubs: HotmartActiveSub[];
  /**
   * items de /subscriptions/summary (têm `lifetime` em DIAS, sem price). Base
   * exclusiva do LT (tempo de vida médio).
   */
  summaryItems: HotmartSummaryItem[];
  /** contagens por status vindas de page_info.total_results (mais confiável que summary). */
  counts: {
    /** Total = soma dos 6 status mostrados pela Hotmart (exclui INACTIVE/STARTED). */
    total: number;
    active: number; // ACTIVE
    delayed: number; // DELAYED (ainda vigente)
    cancelled: number; // soma dos 3 CANCELLED_*
    overdue: number; // OVERDUE (venceu o máximo de recorrências)
    byStatus: Array<{ status: string; count: number }>;
  };
  /** items de /sales/summary?transaction_status=REFUNDED. */
  refundedSales: HotmartSalesSummaryItem[];
  /** referência de tempo (ms UTC) pra janela do próximo mês. Default = agora. */
  refMs?: number;
}

/**
 * Calcula TODAS as métricas a partir de fixtures (sem rede). Fontes alinhadas
 * com o painel oficial da Hotmart (validado ao vivo):
 *
 *  - MRR  = Σ(activeSubs) price.value * 30 / plan.recurrency_period, por moeda.
 *  - LT (meses) = média de (lifetime / 30) das ACTIVE do summary [lifetime em DIAS].
 *  - LTV (por assinante, por moeda) = MRR_médio_por_assinatura * LT
 *         = (MRR_moeda / nº_ativos_da_moeda) * ltMonths.
 *  - Total = active + delayed + cancelled + overdue (exclui INACTIVE/STARTED).
 *  - Vigentes (retenção) = (active + delayed) / total.
 *  - Churn = (cancelled + overdue) / total  [= 1 − retenção].
 *  - Reembolsadas = sales/summary?transaction_status=REFUNDED.
 *  - Renovações próximo mês = activeSubs com date_next_charge na janela.
 */
export function aggregateDashboard(input: AggregateInput): HotmartDashboard {
  const { activeSubs, summaryItems, counts, refundedSales } = input;
  const refMs = input.refMs ?? Date.now();

  // --- MRR: Σ ACTIVE mensalizado por recurrency_period (dias), por moeda ---
  // Também conta ativos por moeda pra derivar o LTV (preço mensal médio × LT).
  const mrrByCurrency = new Map<string, number>();
  const activeCountByCurrency = new Map<string, number>();
  for (const it of activeSubs) {
    const value = it.price?.value;
    const period = it.plan?.recurrency_period;
    const currency = it.price?.currency_code ?? PRIMARY_CURRENCY;
    if (typeof value !== "number" || typeof period !== "number" || period <= 0) continue;
    const monthly = (value * 30) / period;
    mrrByCurrency.set(currency, (mrrByCurrency.get(currency) ?? 0) + monthly);
    activeCountByCurrency.set(currency, (activeCountByCurrency.get(currency) ?? 0) + 1);
  }

  // --- LT (meses): média de lifetime/30 SÓ das ACTIVE (lifetime em DIAS) ---
  // Validado ao vivo: a Hotmart calcula o "Tempo de Vida" sobre as assinaturas
  // ativas (8,97 ≈ 8,98 oficial). Incluir INACTIVE (lifetime 0, nunca ativaram)
  // ou canceladas derruba a média pela metade.
  let ltSum = 0;
  let ltCount = 0;
  for (const it of summaryItems) {
    if (it.status !== "ACTIVE") continue;
    const lifetime = it.lifetime;
    if (typeof lifetime !== "number" || lifetime < 0) continue;
    ltSum += lifetime / 30;
    ltCount += 1;
  }
  const ltMonths = ltCount > 0 ? ltSum / ltCount : 0;

  // --- LTV por moeda: (MRR_moeda / nº_ativos_moeda) * LT ---
  const ltv: MoneyByCurrency[] = [];
  for (const [currency, mrr] of mrrByCurrency.entries()) {
    const n = activeCountByCurrency.get(currency) ?? 0;
    const avgMonthly = n > 0 ? mrr / n : 0;
    ltv.push({ currency, value: avgMonthly * ltMonths });
  }

  // --- Renovações do próximo mês: ACTIVE com date_next_charge na janela ---
  const { startMs, endMs } = nextMonthWindow(refMs);
  let renewalCount = 0;
  const renewalRevenue = new Map<string, number>();
  for (const it of activeSubs) {
    const nextCharge = it.date_next_charge;
    if (typeof nextCharge !== "number") continue;
    if (nextCharge < startMs || nextCharge > endMs) continue;
    renewalCount += 1;
    const value = it.price?.value;
    const currency = it.price?.currency_code ?? PRIMARY_CURRENCY;
    if (typeof value === "number") {
      renewalRevenue.set(currency, (renewalRevenue.get(currency) ?? 0) + value);
    }
  }

  // --- Reembolsos por moeda (de sales/summary?REFUNDED) ---
  let refundedItems = 0;
  const refundedByCurrency = new Map<string, number>();
  for (const s of refundedSales) {
    refundedItems += s.total_items ?? 0;
    const value = s.total_value?.value;
    const currency = s.total_value?.currency_code ?? PRIMARY_CURRENCY;
    if (typeof value === "number") {
      refundedByCurrency.set(currency, (refundedByCurrency.get(currency) ?? 0) + value);
    }
  }

  // Total/retenção/churn alinhados com a Hotmart: vigentes = ACTIVE + DELAYED;
  // churn = CANCELLED + OVERDUE. retenção + churn = 1.
  const total = counts.total;
  const vigentes = counts.active + counts.delayed;
  const retentionRate = total > 0 ? vigentes / total : 0;
  const churnRate = total > 0 ? (counts.cancelled + counts.overdue) / total : 0;

  return {
    totalSubscriptions: counts.total,
    activeSubscriptions: counts.active,
    cancelledSubscriptions: counts.cancelled,
    overdueSubscriptions: counts.overdue,
    refunded: { totalItems: refundedItems, totalValue: moneyByCurrencyFromMap(refundedByCurrency) },
    mrr: moneyByCurrencyFromMap(mrrByCurrency),
    ltv: sortCurrencyPrimaryFirst(ltv),
    ltMonths,
    retentionRate,
    churnRate,
    nextMonthRenewals: {
      count: renewalCount,
      expectedRevenue: moneyByCurrencyFromMap(renewalRevenue),
    },
    statusDistribution: counts.byStatus,
    currencyPrimary: PRIMARY_CURRENCY,
  };
}

// ============================================================
// Orquestração com rede — computeHotmartDashboard
// ============================================================

/** Executa `fn` sobre `items` com no máx. `limit` em paralelo. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

/**
 * Orquestra os fetchers e chama aggregateDashboard. SEMPRE passa a janela de
 * accession_date (default months=12). Fontes (validadas ao vivo):
 *  - activeSubs: /subscriptions?status=ACTIVE (price + date_next_charge) → MRR/LTV/renovações.
 *  - summaryItems: /subscriptions/summary (lifetime em dias) → LT.
 *  - statusCounts: /subscriptions total_results por status → total/retenção/churn.
 *  - refundedSales: /sales/summary?REFUNDED.
 *
 * PERF: as 4 famílias de chamadas são independentes → Promise.all. As 8
 * contagens de status disparam todas de uma vez. Multi-moeda; guardas de
 * divisão por zero vivem em aggregateDashboard.
 */
export async function computeHotmartDashboard(
  token: string,
  args: { productId: string; months: number },
): Promise<HotmartDashboard> {
  const refMs = nowMs();
  const accessionFrom = monthsAgoMs(args.months, refMs);

  const [activeSubs, summaryItems, statusCounts, refundedSales] = await Promise.all([
    // Assinaturas ACTIVE detalhadas (price/date_next_charge) → MRR/LTV/renovações.
    fetchSubscriptionsDetailed(token, {
      productId: args.productId,
      status: "ACTIVE",
      accessionFrom,
      accessionTo: refMs,
    }),
    // Summary (lifetime em dias) → LT.
    fetchSubscriptionsSummary(token, {
      productId: args.productId,
      accessionFrom,
    }),
    // Contagens por status (uma chamada barata por status via total_results).
    mapWithConcurrency(
      [...SUBSCRIPTION_STATUSES],
      SUBSCRIPTION_STATUSES.length,
      async (status): Promise<{ status: string; count: number }> => {
        const count = await fetchSubscriptionCount(token, {
          productId: args.productId,
          status,
          accessionFrom,
          accessionTo: refMs,
        });
        return { status, count };
      },
    ),
    // Reembolsos (sempre passar transaction_status=REFUNDED).
    fetchSalesSummaryByStatus(token, {
      productId: args.productId,
      status: "REFUNDED",
      from: accessionFrom,
      to: refMs,
    }),
  ]);

  const countOf = (status: string): number =>
    statusCounts.find((s) => s.status === status)?.count ?? 0;

  const active = countOf("ACTIVE");
  const delayed = countOf("DELAYED");
  const overdue = countOf("OVERDUE");
  const cancelled = CANCELLED_STATUSES.reduce((acc, s) => acc + countOf(s), 0);
  // Total alinhado com a Hotmart: só os status vigentes/cancelados/vencidos
  // (exclui INACTIVE e STARTED, que o painel oficial não conta).
  const total = active + delayed + overdue + cancelled;

  // statusDistribution: só os 6 status que a Hotmart exibe (sem INACTIVE/STARTED zerados).
  const HIDDEN_STATUSES = new Set(["INACTIVE", "STARTED"]);
  const byStatus = statusCounts.filter((s) => !HIDDEN_STATUSES.has(s.status));

  return aggregateDashboard({
    activeSubs,
    summaryItems,
    counts: {
      total,
      active,
      delayed,
      cancelled,
      overdue,
      byStatus,
    },
    refundedSales,
    refMs,
  });
}
