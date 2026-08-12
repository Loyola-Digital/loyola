/**
 * Backfill do histórico de assinaturas do RevenueCat.
 *
 * O webhook só registra o que acontece DEPOIS de ele ser plugado — no Lyrio, a
 * partir de 10/08/2026. Tudo anterior a isso só existe dentro do RevenueCat.
 *
 * E não dá pra "reenviar os webhooks": a API v2 não expõe histórico de eventos
 * (`/projects/{id}/events` e `/transactions` respondem 404). O que ela expõe é
 * o ESTADO — clientes e suas assinaturas. Então o backfill percorre os clientes
 * e lê as assinaturas de cada um, o que reconstrói quem assinou, quando começou,
 * quando termina e se renova. Os eventos de paywall são irrecuperáveis por
 * qualquer caminho: só existem no instante em que acontecem.
 *
 * Custo: uma chamada por cliente, e a base tem milhares. Por isso o percurso é
 * retomável (cursor em `revenuecat_backfill_state`) e limitado por lote — um
 * ciclo faz o que dá no orçamento de chamadas e o próximo continua de onde
 * parou, em vez de tentar varrer tudo numa requisição só.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  revenuecatBackfillState,
  revenuecatConnections,
  revenuecatStageConfig,
  revenuecatSubscriptions,
} from "../db/schema.js";
import { decrypt } from "./encryption.js";

const RC_BASE = "https://api.revenuecat.com/v2";

/** Pausa entre chamadas — o RevenueCat responde 429 quando a rajada é grande. */
const PAUSA_MS = 120;

export interface BackfillOptions {
  /**
   * Teto APROXIMADO de clientes por execução (default 500). A checagem é por
   * página, não por cliente: a página corrente termina inteira antes de parar,
   * então o total real arredonda pra cima até o múltiplo de 100 (tamanho da
   * página). Medido: ~0,55s por cliente, então 500 ≈ 4-5 min.
   */
  limite?: number;
  log?: (msg: string) => void;
}

export interface BackfillResult {
  status: "done" | "partial" | "error";
  customersProcessed: number;
  subscriptionsUpserted: number;
  /** true = ainda há clientes; chamar de novo continua do cursor. */
  temMais: boolean;
  error?: string;
}

interface RcCustomer {
  id: string;
}

interface RcSubscription {
  id: string;
  customer_id?: string;
  product_id?: string;
  store?: string;
  country?: string;
  auto_renewal_status?: string;
  status?: string;
  starts_at?: number;
  ends_at?: number;
  current_period_starts_at?: number;
  current_period_ends_at?: number;
  entitlements?: unknown;
}

interface RcLista<T> {
  items?: T[];
  next_page?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paraData(ms: number | undefined | null): Date | null {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

/**
 * GET na API v2 com retry em 429/5xx. Sem isto, um pico de rate limit no meio
 * de milhares de chamadas abortaria o backfill inteiro.
 */
async function rcGet<T>(url: string, apiKey: string, tentativa = 0): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  if (res.status === 429 || res.status >= 500) {
    if (tentativa >= 4) {
      throw new Error(`RevenueCat ${res.status} após ${tentativa} tentativas`);
    }
    // Backoff exponencial simples: 0.5s, 1s, 2s, 4s.
    await sleep(500 * 2 ** tentativa);
    return rcGet<T>(url, apiKey, tentativa + 1);
  }

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`RevenueCat ${res.status}: ${corpo.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Credenciais + projeto RC da etapa, ou null se não estiver configurada. */
async function contexto(db: Database, stageId: string) {
  const [cfg] = await db
    .select()
    .from(revenuecatStageConfig)
    .where(eq(revenuecatStageConfig.stageId, stageId))
    .limit(1);
  if (!cfg?.rcProjectId) return null;

  const [conn] = await db
    .select()
    .from(revenuecatConnections)
    .where(eq(revenuecatConnections.projectId, cfg.projectId))
    .limit(1);
  if (!conn) return null;

  return {
    projectId: cfg.projectId,
    rcProjectId: cfg.rcProjectId,
    apiKey: decrypt(conn.apiKeyEncrypted, conn.apiKeyIv),
  };
}

export async function backfillRevenuecatSubscriptions(
  db: Database,
  stageId: string,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const limite = opts.limite ?? 500;
  const log = opts.log ?? (() => {});

  const ctx = await contexto(db, stageId);
  if (!ctx) {
    return {
      status: "error",
      customersProcessed: 0,
      subscriptionsUpserted: 0,
      temMais: false,
      error: "Etapa sem conexão RevenueCat ou sem app selecionado",
    };
  }

  const [estado] = await db
    .select()
    .from(revenuecatBackfillState)
    .where(eq(revenuecatBackfillState.stageId, stageId))
    .limit(1);

  const agora = new Date();
  // Retoma do cursor salvo; a 1ª execução começa do início da lista.
  let proximaUrl =
    estado?.nextCursor ?? `${RC_BASE}/projects/${ctx.rcProjectId}/customers?limit=100`;
  let clientes = estado?.customersProcessed ?? 0;
  let assinaturas = estado?.subscriptionsUpserted ?? 0;
  const clientesNoCiclo = { total: 0 };

  await db
    .insert(revenuecatBackfillState)
    .values({
      stageId,
      status: "running",
      nextCursor: estado?.nextCursor ?? null,
      customersProcessed: clientes,
      subscriptionsUpserted: assinaturas,
      startedAt: estado?.startedAt ?? agora,
      updatedAt: agora,
      error: null,
    })
    .onConflictDoUpdate({
      target: revenuecatBackfillState.stageId,
      set: { status: "running", updatedAt: agora, error: null },
    });

  try {
    while (proximaUrl && clientesNoCiclo.total < limite) {
      const pagina = await rcGet<RcLista<RcCustomer>>(proximaUrl, ctx.apiKey);
      const itens = pagina.items ?? [];

      for (const cliente of itens) {
        if (!cliente?.id) continue;
        const subs = await rcGet<RcLista<RcSubscription>>(
          `${RC_BASE}/projects/${ctx.rcProjectId}/customers/${encodeURIComponent(cliente.id)}/subscriptions?limit=50`,
          ctx.apiKey,
        );

        for (const sub of subs.items ?? []) {
          if (!sub?.id) continue;
          await db
            .insert(revenuecatSubscriptions)
            .values({
              stageId,
              projectId: ctx.projectId,
              subscriptionId: sub.id,
              customerId: sub.customer_id ?? cliente.id,
              productId: sub.product_id ?? null,
              store: sub.store ?? null,
              country: sub.country ?? null,
              autoRenewalStatus: sub.auto_renewal_status ?? null,
              status: sub.status ?? null,
              startsAt: paraData(sub.starts_at),
              endsAt: paraData(sub.ends_at),
              currentPeriodStartsAt: paraData(sub.current_period_starts_at),
              currentPeriodEndsAt: paraData(sub.current_period_ends_at),
              entitlements: sub.entitlements ?? null,
              payload: sub,
              syncedAt: new Date(),
            })
            // Assinatura é ESTADO: reexecutar deve ATUALIZAR, não ignorar.
            .onConflictDoUpdate({
              target: [revenuecatSubscriptions.stageId, revenuecatSubscriptions.subscriptionId],
              set: {
                autoRenewalStatus: sub.auto_renewal_status ?? null,
                status: sub.status ?? null,
                endsAt: paraData(sub.ends_at),
                currentPeriodStartsAt: paraData(sub.current_period_starts_at),
                currentPeriodEndsAt: paraData(sub.current_period_ends_at),
                entitlements: sub.entitlements ?? null,
                payload: sub,
                syncedAt: new Date(),
              },
            });
          assinaturas++;
        }

        clientes++;
        clientesNoCiclo.total++;
        await sleep(PAUSA_MS);
      }

      proximaUrl = pagina.next_page
        ? pagina.next_page.startsWith("http")
          ? pagina.next_page
          : `https://api.revenuecat.com${pagina.next_page}`
        : "";

      log(`[rc-backfill] ${clientes} clientes · ${assinaturas} assinaturas`);

      // Salva o cursor a cada página: se cair agora, retoma daqui.
      await db
        .update(revenuecatBackfillState)
        .set({
          nextCursor: proximaUrl || null,
          customersProcessed: clientes,
          subscriptionsUpserted: assinaturas,
          updatedAt: new Date(),
        })
        .where(eq(revenuecatBackfillState.stageId, stageId));
    }

    const acabou = !proximaUrl;
    await db
      .update(revenuecatBackfillState)
      .set({
        status: acabou ? "done" : "idle",
        nextCursor: proximaUrl || null,
        customersProcessed: clientes,
        subscriptionsUpserted: assinaturas,
        finishedAt: acabou ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(revenuecatBackfillState.stageId, stageId));

    return {
      status: acabou ? "done" : "partial",
      customersProcessed: clientes,
      subscriptionsUpserted: assinaturas,
      temMais: !acabou,
    };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await db
      .update(revenuecatBackfillState)
      .set({ status: "error", error: mensagem, updatedAt: new Date() })
      .where(eq(revenuecatBackfillState.stageId, stageId));
    log(`[rc-backfill] erro: ${mensagem}`);
    return {
      status: "error",
      customersProcessed: clientes,
      subscriptionsUpserted: assinaturas,
      // O cursor ficou salvo — retomar continua de onde parou.
      temMais: true,
      error: mensagem,
    };
  }
}

/** Progresso do backfill de uma etapa (pra UI mostrar sem disparar nada). */
export async function statusBackfill(db: Database, stageId: string) {
  const [estado] = await db
    .select()
    .from(revenuecatBackfillState)
    .where(eq(revenuecatBackfillState.stageId, stageId))
    .limit(1);

  const [contagem] = await db
    .select({ total: revenuecatSubscriptions.id })
    .from(revenuecatSubscriptions)
    .where(and(eq(revenuecatSubscriptions.stageId, stageId)))
    .limit(1);

  return {
    status: estado?.status ?? "idle",
    customersProcessed: estado?.customersProcessed ?? 0,
    subscriptionsUpserted: estado?.subscriptionsUpserted ?? 0,
    temMais: Boolean(estado?.nextCursor),
    error: estado?.error ?? null,
    startedAt: estado?.startedAt?.toISOString() ?? null,
    finishedAt: estado?.finishedAt?.toISOString() ?? null,
    temAlgumaAssinatura: Boolean(contagem),
  };
}
