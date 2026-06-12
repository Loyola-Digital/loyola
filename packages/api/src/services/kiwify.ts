// Story 35.2 — Service Kiwify (Assinaturas / recorrência, Pull-MVP).
//
// Auth: OAuth2 client credentials (sem grant_type explícito — só client_id+client_secret).
//   POST https://public-api.kiwify.com/v1/oauth/token
//   body application/x-www-form-urlencoded { client_id, client_secret }
//   -> { access_token (JWT), token_type: "Bearer", expires_in: 86400 (segundos) }
//   Só o access_token expira -> cachear em memória e renovar ~5 min antes do expires_in.
// APIs de dados: https://public-api.kiwify.com/v1, header Authorization: Bearer <access_token>
//   + header OBRIGATÓRIO x-kiwify-account-id: <accountId>.
//
// ADAPTADOR (diferenças vs Hotmart — NÃO copiar cego):
//   - Datas: YYYY-MM-DD (string), NÃO epoch ms.
//   - Paginação: OFFSET (page_number/page_size + pagination.count), NÃO cursor.
//   - Header extra: x-kiwify-account-id obrigatório.
//   - Janela: teto rígido de 90 dias por chamada de /sales -> janelar.
//   - Assinatura: NÃO existe /v1/subscriptions -> métricas derivam do stream de /sales.
//   - Valores: net_amount em CENTAVOS (manter no backend).
//
// SEGURANÇA: NUNCA logar/serializar client_secret nem o token. PII do customer
// (name/email/cpf/cnpj/mobile/address) nunca é logada. Mensagens de erro carregam
// só status + detalhe da Kiwify.

import { encrypt, decrypt } from "./encryption.js";

const TOKEN_URL = "https://public-api.kiwify.com/v1/oauth/token";
const API_BASE = "https://public-api.kiwify.com/v1";

// Renova o token 5 min (300s) antes do expires_in.
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

// Default do expires_in da Kiwify (24h).
const DEFAULT_EXPIRES_IN_SEC = 86400;

// Teto rígido de janela da Kiwify para /sales (90 dias).
const MAX_WINDOW_DAYS = 90;

// Tamanho de página padrão para varredura por offset.
const PAGE_SIZE = 100;

// Guarda contra loop infinito na auto-paginação por offset.
const MAX_PAGES = 1000;

const PRIMARY_CURRENCY = "BRL";

// Janela de MRR aproximado: últimos 30 dias.
const MRR_WINDOW_DAYS = 30;

// ============================================================
// Tipos
// ============================================================

export interface MoneyByCurrency {
  /** currency code (ex.: "BRL", "USD"). */
  currency: string;
  /** valor em CENTAVOS. */
  value: number;
}

export interface KiwifyChargeBucket {
  count: number;
  value: MoneyByCurrency[];
}

/** Produto de /v1/products. ASSINATURA = payment_type === "recurring". */
export interface KiwifyProduct {
  id?: string;
  name?: string;
  type?: string;
  /** "one_time" | "recurring" — assinaturas são "recurring". */
  payment_type?: string;
  /** preço em CENTAVOS. */
  price?: number;
  currency?: string;
  status?: string;
}

/** Referência de produto/plano dentro de uma venda. */
export interface KiwifySaleProduct {
  id?: string;
  name?: string;
  plan_id?: string;
  plan_name?: string;
}

/**
 * Venda de /v1/sales. Com view_full_sale_details=true vêm campos extras
 * (approved_date, refunded_at, parent_order_id, payment, tracking). O
 * `parent_order_id` distingue NOVA venda (vazio) de RENOVAÇÃO (preenchido).
 * `net_amount` em CENTAVOS. `customer` é PII — NUNCA logar/serializar.
 */
export interface KiwifySale {
  id?: string;
  product?: KiwifySaleProduct;
  status?: string;
  payment_method?: string;
  /** valor líquido em CENTAVOS. */
  net_amount?: number;
  currency?: string;
  /** preenchido em renovações; vazio em vendas novas (full details). */
  parent_order_id?: string | null;
  approved_date?: string;
  refunded_at?: string | null;
}

/** Resposta de listagem com paginação por OFFSET. */
export interface KiwifyOffsetResponse<T> {
  pagination?: {
    count?: number;
    page_number?: number;
    page_size?: number;
  };
  data?: T[];
}

/** Resposta de /v1/stats (aceita janela >90d). SEM MRR/recorrência. */
export interface KiwifyStats {
  total_sales?: number;
  refund_rate?: number;
  chargeback_rate?: number;
}

/** Contrato de saída do dashboard de recorrência (Pull-MVP). */
export interface KiwifyDashboard {
  recurringRevenue: MoneyByCurrency[]; // Σ net_amount de paid/approved no período
  mrrApprox: MoneyByCurrency[]; // receita recorrente dos últimos 30 dias
  charges: {
    paid: KiwifyChargeBucket; // status paid + approved
    refunded: KiwifyChargeBucket; // refunded + refund_requested + pending_refund
    chargeback: KiwifyChargeBucket; // chargedback
    pending: KiwifyChargeBucket; // waiting_payment + pending + processing + authorized
    refused: { count: number }; // refused (sem valor — não houve receita)
  };
  refundRate: number; // razão 0..1 (normalizada de /stats, que vem em %)
  chargebackRate: number; // razão 0..1 (normalizada de /stats, que vem em %)
  newVsRenewal: { new: number; renewal: number }; // parent_order_id vazio vs preenchido
  statusDistribution: Array<{ status: string; count: number }>;
  currencyPrimary: string; // "BRL"
  // GAPS honestos — não disponíveis via pull (fase 2 / webhooks):
  activeSubscriptions: null;
  churnRate: null;
}

// ============================================================
// Buckets de status (enum oficial 11) → mapeamento
// ============================================================

export const PAID_STATUSES = ["paid", "approved"] as const;
export const REFUNDED_STATUSES = ["refunded", "refund_requested", "pending_refund"] as const;
export const CHARGEBACK_STATUSES = ["chargedback"] as const;
export const PENDING_STATUSES = ["waiting_payment", "pending", "processing", "authorized"] as const;
export const REFUSED_STATUSES = ["refused"] as const;

type BucketName = "paid" | "refunded" | "chargeback" | "pending" | "refused";

const STATUS_TO_BUCKET = new Map<string, BucketName>();
for (const s of PAID_STATUSES) STATUS_TO_BUCKET.set(s, "paid");
for (const s of REFUNDED_STATUSES) STATUS_TO_BUCKET.set(s, "refunded");
for (const s of CHARGEBACK_STATUSES) STATUS_TO_BUCKET.set(s, "chargeback");
for (const s of PENDING_STATUSES) STATUS_TO_BUCKET.set(s, "pending");
for (const s of REFUSED_STATUSES) STATUS_TO_BUCKET.set(s, "refused");

/** Bucket de um status de venda (ou undefined se status desconhecido). */
export function bucketForStatus(status: string | undefined): BucketName | undefined {
  if (!status) return undefined;
  return STATUS_TO_BUCKET.get(status);
}

// ============================================================
// Cripto (reusa services/encryption.ts — AES-256-GCM)
// ============================================================

export function encryptKiwifySecret(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptKiwifySecret(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// Helpers de data — a API usa datas YYYY-MM-DD (string), NÃO epoch ms.
// ============================================================

/** Formata uma Date como YYYY-MM-DD em UTC. */
export function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse de YYYY-MM-DD para epoch ms (UTC, meia-noite). */
export function fromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

/** YYYY-MM-DD de `hoje − months` (UTC). Default do dashboard: months=12. */
export function monthsAgo(months: number, ref: Date = new Date()): string {
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() - months;
  // Clampa o dia ao último dia válido do mês alvo — evita o overflow de mês do JS
  // (ex.: 31/03 − 1 mês cairia em 03/03; com o clamp vira 28/02).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(ref.getUTCDate(), lastDay);
  const ms = Date.UTC(year, month, day, 0, 0, 0, 0);
  return toYmd(new Date(ms));
}

/** YYYY-MM-DD de `hoje − days` (UTC). Usado no MRR (30d). */
export function daysAgo(days: number, ref: Date = new Date()): string {
  const ms = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - days, 0, 0, 0, 0);
  return toYmd(new Date(ms));
}

/**
 * Fatia o intervalo [from, to] (ambos YYYY-MM-DD, inclusivos) em janelas de no
 * máximo 90 dias para respeitar o teto rígido da Kiwify em /sales. Cada janela
 * é [start, end] inclusiva e janelas adjacentes não se sobrepõem (avança 1 dia).
 *
 * Ex.: 12 meses (~365 dias) -> 5 janelas (90+90+90+90+~5).
 */
export function windowDateRange(from: string, to: string): Array<{ from: string; to: string }> {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowSpanMs = (MAX_WINDOW_DAYS - 1) * dayMs; // janela inclusiva de 90 dias-calendário
  const startMs = fromYmd(from);
  const endMs = fromYmd(to);
  if (endMs < startMs) return [];

  const windows: Array<{ from: string; to: string }> = [];
  let cursor = startMs;
  while (cursor <= endMs) {
    const windowEnd = Math.min(cursor + windowSpanMs, endMs);
    windows.push({ from: toYmd(new Date(cursor)), to: toYmd(new Date(windowEnd)) });
    cursor = windowEnd + dayMs; // próxima janela começa no dia seguinte
  }
  return windows;
}

// ============================================================
// OAuth2 — cache em memória por par de credenciais
// ============================================================

interface CachedToken {
  accessToken: string;
  /** epoch ms em que o token expira (já com skew de refresh aplicado). */
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Chave de cache do token. NÃO usa o secret em claro em nenhum log. */
function tokenCacheKey(clientId: string, clientSecret: string): string {
  return `${clientId}:${clientSecret}`;
}

interface KiwifyTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Token OAuth2 da Kiwify. Reutiliza o cache enquanto válido; renova ~5 min antes
 * do expires_in (default 86400s). Em falha, lança Error sem vazar clientSecret/token.
 */
export async function getKiwifyToken(clientId: string, clientSecret: string): Promise<string> {
  const key = tokenCacheKey(clientId, clientSecret);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
  } catch {
    // Nunca incluir credenciais na mensagem.
    throw new Error("Falha de rede ao autenticar na Kiwify");
  }

  if (!res.ok) {
    // Mensagem genérica + status. NÃO inclui credenciais.
    throw new Error(`Kiwify OAuth ${res.status}: credenciais inválidas ou indisponíveis`);
  }

  let data: KiwifyTokenResponse;
  try {
    data = (await res.json()) as KiwifyTokenResponse;
  } catch {
    throw new Error("Resposta de token da Kiwify inválida (JSON)");
  }

  if (!data.access_token) {
    throw new Error("Kiwify não retornou access_token");
  }

  const expiresInSec =
    typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : DEFAULT_EXPIRES_IN_SEC;
  const expiresAtMs = Date.now() + expiresInSec * 1000 - TOKEN_REFRESH_SKEW_MS;
  tokenCache.set(key, { accessToken: data.access_token, expiresAtMs });
  return data.access_token;
}

/** Limpa o cache de token (uso em testes / troca de credencial). */
export function clearKiwifyTokenCache(): void {
  tokenCache.clear();
}

// ============================================================
// Cliente HTTP genérico — base v1, Bearer + x-kiwify-account-id
// ============================================================

export async function kiwifyGet<T>(
  token: string,
  accountId: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
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

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-kiwify-account-id": accountId,
        Accept: "application/json",
      },
    });
  } catch {
    // Erro de rede — nunca expor URL/headers (espelha o tratamento de getKiwifyToken).
    throw new Error("Falha de rede ao chamar a API da Kiwify");
  }

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
    throw new Error(`Kiwify API ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  return (await res.json()) as T;
}

// ============================================================
// Fetchers
// ============================================================

/**
 * Lista produtos distintos { id, name } com payment_type === "recurring",
 * paginando /v1/products por offset (page_number/page_size) até esgotar
 * pagination.count. Ordenado por name.
 */
export async function listKiwifyProducts(
  token: string,
  accountId: string,
): Promise<Array<{ id: string; name: string }>> {
  const out: KiwifyProduct[] = [];
  let total = Infinity;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await kiwifyGet<KiwifyOffsetResponse<KiwifyProduct>>(token, accountId, "/products", {
      page_number: page,
      page_size: PAGE_SIZE,
    });
    const items = data.data ?? [];
    if (items.length) out.push(...items);

    total = data.pagination?.count ?? out.length;
    if (out.length >= total || items.length === 0) break;
  }

  return distinctRecurringProducts(out);
}

/**
 * Varre /v1/sales respeitando o teto de 90 dias: fatia [from, to] em janelas
 * ≤90d e, dentro de cada janela, pagina por offset até esgotar pagination.count.
 * Guard contra loop infinito (MAX_PAGES). Retorna todas as vendas.
 */
export async function fetchSalesWindowed(
  token: string,
  accountId: string,
  args: {
    productId?: string;
    status?: string;
    from: string;
    to: string;
    fullDetails?: boolean;
  },
): Promise<KiwifySale[]> {
  const out: KiwifySale[] = [];
  const windows = windowDateRange(args.from, args.to);

  for (const win of windows) {
    // Itens lidos NESTA janela (não cumulativo entre janelas — senão, sem
    // pagination.count, a parada usaria um total errado e descartaria vendas).
    let readInWindow = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await kiwifyGet<KiwifyOffsetResponse<KiwifySale>>(token, accountId, "/sales", {
        product_id: args.productId,
        status: args.status,
        start_date: win.from,
        end_date: win.to,
        view_full_sale_details: args.fullDetails ? "true" : undefined,
        page_size: PAGE_SIZE,
        page_number: page,
      });
      const items = data.data ?? [];
      if (items.length) out.push(...items);
      readInWindow += items.length;

      const total = data.pagination?.count;
      // Para em página curta/vazia (esgotou a janela) OU ao atingir o count
      // reportado. Sem count, confia no tamanho da página — nunca perde vendas.
      // (O guard MAX_PAGES limita a janela a ~MAX_PAGES*PAGE_SIZE vendas; volume
      //  extremo improvável para 1 produto em 90d — débito conhecido.)
      if (items.length < PAGE_SIZE || (typeof total === "number" && readInWindow >= total)) break;
    }
  }

  return out;
}

/**
 * Conta vendas SEM baixar tudo: para cada janela de 90d, faz 1 chamada com
 * page_size=1 e soma pagination.count. Mais barato que fetchSalesWindowed.
 */
export async function fetchSalesCount(
  token: string,
  accountId: string,
  args: { productId?: string; status?: string; from: string; to: string },
): Promise<number> {
  const windows = windowDateRange(args.from, args.to);
  let total = 0;

  for (const win of windows) {
    const data = await kiwifyGet<KiwifyOffsetResponse<KiwifySale>>(token, accountId, "/sales", {
      product_id: args.productId,
      status: args.status,
      start_date: win.from,
      end_date: win.to,
      page_size: 1,
      page_number: 1,
    });
    total += data.pagination?.count ?? 0;
  }

  return total;
}

/** GET /v1/stats (refund_rate, chargeback_rate, total_sales). Aceita janela >90d. */
export async function fetchKiwifyStats(
  token: string,
  accountId: string,
  args: { from: string; to: string; productId?: string },
): Promise<KiwifyStats> {
  return kiwifyGet<KiwifyStats>(token, accountId, "/stats", {
    start_date: args.from,
    end_date: args.to,
    product_id: args.productId,
  });
}

// ============================================================
// Agregação pura (testável sem rede)
// ============================================================

/**
 * Produtos distintos { id, name } filtrando payment_type === "recurring".
 * Sem duplicatas; ordenado por name.
 */
export function distinctRecurringProducts(items: KiwifyProduct[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const it of items) {
    if (it.payment_type !== "recurring") continue;
    const id = it.id;
    if (id === undefined || id === null || String(id).trim() === "") continue;
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, it.name ?? key);
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Ordena moedas com a primária (BRL) primeiro, demais alfabéticas. */
function sortCurrencyPrimaryFirst(arr: MoneyByCurrency[]): MoneyByCurrency[] {
  return arr.sort((a, b) => {
    if (a.currency === PRIMARY_CURRENCY) return -1;
    if (b.currency === PRIMARY_CURRENCY) return 1;
    return a.currency.localeCompare(b.currency);
  });
}

/** Constrói array MoneyByCurrency (BRL primeiro) a partir de um Map. */
function moneyByCurrencyFromMap(map: Map<string, number>): MoneyByCurrency[] {
  const arr = Array.from(map.entries()).map(([currency, value]) => ({ currency, value }));
  return sortCurrencyPrimaryFirst(arr);
}

/** Soma net_amount (centavos) por moeda das vendas, retornando MoneyByCurrency[]. */
export function sumRevenueByCurrency(sales: KiwifySale[]): MoneyByCurrency[] {
  const map = new Map<string, number>();
  for (const s of sales) {
    const value = s.net_amount;
    if (typeof value !== "number") continue;
    const currency = s.currency ?? PRIMARY_CURRENCY;
    map.set(currency, (map.get(currency) ?? 0) + value);
  }
  return moneyByCurrencyFromMap(map);
}

export interface AggregateKiwifyInput {
  /**
   * TODAS as vendas do período (qualquer status), idealmente com
   * view_full_sale_details=true (parent_order_id para novos vs renovação).
   */
  sales: KiwifySale[];
  /** Vendas dos últimos 30 dias (paid/approved) para o MRR aproximado. */
  mrrSales: KiwifySale[];
  /** Métricas de /stats (refund_rate, chargeback_rate em %). */
  stats: KiwifyStats;
}

/**
 * Calcula TODAS as métricas a partir de fixtures (sem rede). Derivada do stream
 * de /sales (a Kiwify NÃO expõe estado de assinatura via pull).
 *
 *  - recurringRevenue = Σ net_amount (centavos) de paid/approved, por moeda.
 *  - mrrApprox        = mesma soma restrita aos últimos 30 dias.
 *  - charges          = buckets de status (count + valor por moeda; refused só count).
 *  - newVsRenewal     = parent_order_id vazio (novo) vs preenchido (renovação),
 *                       considerando só vendas paid/approved.
 *  - refundRate/chargebackRate = de /stats.
 *  - activeSubscriptions/churnRate = GAPS honestos (null — fase 2 / webhooks).
 */
export function aggregateKiwifyDashboard(input: AggregateKiwifyInput): KiwifyDashboard {
  const { sales, mrrSales, stats } = input;

  // --- Buckets de status: count + valor (centavos) por moeda ---
  const paidRevenue = new Map<string, number>();
  const refundedValue = new Map<string, number>();
  const chargebackValue = new Map<string, number>();
  const pendingValue = new Map<string, number>();
  let paidCount = 0;
  let refundedCount = 0;
  let chargebackCount = 0;
  let pendingCount = 0;
  let refusedCount = 0;

  // --- Distribuição por status (status cru da venda) ---
  const statusCounts = new Map<string, number>();

  // --- Novos vs renovação (só paid/approved) ---
  let newCount = 0;
  let renewalCount = 0;

  for (const s of sales) {
    const status = s.status ?? "unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const bucket = bucketForStatus(s.status);
    const value = typeof s.net_amount === "number" ? s.net_amount : 0;
    const currency = s.currency ?? PRIMARY_CURRENCY;

    switch (bucket) {
      case "paid":
        paidCount += 1;
        paidRevenue.set(currency, (paidRevenue.get(currency) ?? 0) + value);
        // Novos vs renovação só faz sentido em vendas efetivadas.
        if (s.parent_order_id) renewalCount += 1;
        else newCount += 1;
        break;
      case "refunded":
        refundedCount += 1;
        refundedValue.set(currency, (refundedValue.get(currency) ?? 0) + value);
        break;
      case "chargeback":
        chargebackCount += 1;
        chargebackValue.set(currency, (chargebackValue.get(currency) ?? 0) + value);
        break;
      case "pending":
        pendingCount += 1;
        pendingValue.set(currency, (pendingValue.get(currency) ?? 0) + value);
        break;
      case "refused":
        refusedCount += 1;
        break;
      default:
        // status desconhecido: aparece em statusDistribution mas não num bucket.
        break;
    }
  }

  const recurringRevenue = moneyByCurrencyFromMap(paidRevenue);
  const mrrApprox = sumRevenueByCurrency(
    mrrSales.filter((s) => bucketForStatus(s.status) === "paid"),
  );

  const statusDistribution = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => a.status.localeCompare(b.status));

  return {
    recurringRevenue,
    mrrApprox,
    charges: {
      paid: { count: paidCount, value: recurringRevenue },
      refunded: { count: refundedCount, value: moneyByCurrencyFromMap(refundedValue) },
      chargeback: { count: chargebackCount, value: moneyByCurrencyFromMap(chargebackValue) },
      pending: { count: pendingCount, value: moneyByCurrencyFromMap(pendingValue) },
      refused: { count: refusedCount },
    },
    // /stats devolve em PORCENTAGEM (ex.: 2.22 = 2,22%). Normalizamos para razão
    // 0..1 (padrão Hotmart) — o fmtPct compartilhado multiplica por 100 ao exibir.
    refundRate: typeof stats.refund_rate === "number" ? stats.refund_rate / 100 : 0,
    chargebackRate: typeof stats.chargeback_rate === "number" ? stats.chargeback_rate / 100 : 0,
    newVsRenewal: { new: newCount, renewal: renewalCount },
    statusDistribution,
    currencyPrimary: PRIMARY_CURRENCY,
    // GAPS honestos — não há estado de assinatura via pull (fase 2 / webhooks).
    activeSubscriptions: null,
    churnRate: null,
  };
}

// ============================================================
// Orquestração com rede — computeKiwifyDashboard
// ============================================================

/**
 * Orquestra os fetchers e chama aggregateKiwifyDashboard. Deriva tudo do stream
 * de /sales (a Kiwify NÃO tem /subscriptions). Janela default months=12.
 *
 *  - sales: /sales (full details, janelado 90d) -> buckets, novos vs renovação.
 *  - mrrSales: /sales dos últimos 30 dias -> MRR aproximado.
 *  - stats: /stats -> refund_rate, chargeback_rate.
 *
 * PERF: as 3 famílias de chamadas são independentes -> Promise.all.
 */
export async function computeKiwifyDashboard(
  token: string,
  accountId: string,
  args: { productId: string; months: number },
): Promise<KiwifyDashboard> {
  const ref = new Date();
  const from = monthsAgo(args.months, ref);
  const to = toYmd(ref);
  const mrrFrom = daysAgo(MRR_WINDOW_DAYS, ref);

  const [sales, mrrSales, stats] = await Promise.all([
    // Todas as vendas do período (full details para parent_order_id).
    fetchSalesWindowed(token, accountId, {
      productId: args.productId,
      from,
      to,
      fullDetails: true,
    }),
    // Vendas dos últimos 30 dias para o MRR aproximado.
    fetchSalesWindowed(token, accountId, {
      productId: args.productId,
      from: mrrFrom,
      to,
      fullDetails: true,
    }),
    // Taxas de reembolso/chargeback.
    fetchKiwifyStats(token, accountId, { from, to, productId: args.productId }),
  ]);

  return aggregateKiwifyDashboard({ sales, mrrSales, stats });
}
