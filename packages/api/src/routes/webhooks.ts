import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { timingSafeEqual } from "node:crypto";
import { eq, and, like, ne, sql } from "drizzle-orm";
import {
  users,
  kiwifyConnections,
  kiwifyWebhookEvents,
  kiwifySubscriptions,
  revenuecatStageConfig,
  revenuecatSales,
  webhookLeadSources,
  webhookLeads,
  funnelSurveys,
  webhookSurveyResponses,
} from "../db/schema.js";
import {
  computeDedupKey,
  extractEventType,
  extractOrderId,
  normalizeKiwifySubscriptionEvent,
} from "../services/kiwify-subscriptions.js";
import {
  computeRevenuecatDedupKey,
  normalizeRevenuecatEvent,
} from "../services/revenuecat.js";
import { normalizarLead, parseCorpoDeWebhook } from "../services/webhook-leads.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparação constant-time de tokens (false se tamanhos diferem — não lança). */
function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

interface ClerkWebhookPayload {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    image_url?: string | null;
  };
}

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Capture raw body before Fastify parses JSON
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // O Mautic manda form-urlencoded (`GuzzleHttp/7`), não JSON — e o Fastify não
  // traz parser para esse tipo. Mesmo tratamento do JSON acima: chega como
  // string e cada rota decide o que fazer.
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  fastify.post("/api/webhooks/clerk", async (request, reply) => {
    const webhookSecret = fastify.config.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      fastify.log.error("CLERK_WEBHOOK_SECRET not configured");
      return reply.code(400).send({ error: "Webhook secret not configured" });
    }

    // Verify signature (AC 2)
    const svixId = request.headers["svix-id"] as string;
    const svixTimestamp = request.headers["svix-timestamp"] as string;
    const svixSignature = request.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      fastify.log.warn("Missing svix headers");
      return reply.code(400).send({ error: "Missing webhook headers" });
    }

    let payload: ClerkWebhookPayload;

    try {
      const wh = new Webhook(webhookSecret);
      payload = wh.verify(request.body as string, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookPayload;
    } catch (err) {
      fastify.log.warn({ err }, "Webhook signature verification failed");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    const { type, data } = payload;

    try {
      switch (type) {
        case "user.created": {
          const email = data.email_addresses?.[0]?.email_address ?? "";
          const firstName = data.first_name ?? "";
          const lastName = data.last_name ?? "";
          const name =
            `${firstName} ${lastName}`.trim() ||
            data.username ||
            email.split("@")[0] ||
            "Usuário";

          // Check if there's an invited stub user with this email
          const stubUser = await fastify.db
            .select({ id: users.id, clerkId: users.clerkId })
            .from(users)
            .where(and(eq(users.email, email), like(users.clerkId, "guest:%")))
            .limit(1);

          if (stubUser.length > 0) {
            // The auth middleware may have already auto-provisioned a placeholder
            // user with this clerkId — delete it first to avoid unique conflict
            await fastify.db
              .delete(users)
              .where(and(eq(users.clerkId, data.id), ne(users.id, stubUser[0].id)));

            // Merge: activate invited user with real Clerk ID
            await fastify.db
              .update(users)
              .set({ clerkId: data.id, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
              .where(eq(users.id, stubUser[0].id));
            fastify.log.info({ clerkId: data.id, email }, "Invited user activated");
          } else {
            // No stub found — check if auto-provisioned placeholder exists and fix its email
            const placeholderUser = await fastify.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.clerkId, data.id))
              .limit(1);

            if (placeholderUser.length > 0) {
              await fastify.db
                .update(users)
                .set({ email, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
                .where(eq(users.id, placeholderUser[0].id));
              fastify.log.info({ clerkId: data.id }, "Placeholder user email updated");
            } else {
              // Brand new user — starts as pending
              await fastify.db
                .insert(users)
                .values({ clerkId: data.id, email, name, avatarUrl: data.image_url ?? null, status: "pending" });
              fastify.log.info({ clerkId: data.id }, "New user provisioned as pending");
            }
          }
          break;
        }

        case "user.updated": {
          const email = data.email_addresses?.[0]?.email_address ?? "";
          const firstName = data.first_name ?? "";
          const lastName = data.last_name ?? "";
          const name =
            `${firstName} ${lastName}`.trim() ||
            data.username ||
            email.split("@")[0] ||
            "Usuário";

          await fastify.db
            .update(users)
            .set({ email, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
            .where(eq(users.clerkId, data.id));

          fastify.log.info({ clerkId: data.id }, "User profile updated");
          break;
        }

        case "user.deleted": {
          // AC 5: Delete (cascade handles FKs)
          await fastify.db
            .delete(users)
            .where(eq(users.clerkId, data.id));

          fastify.log.info({ clerkId: data.id }, "User deleted");
          break;
        }

        default:
          // AC 8: Ignore unknown events silently
          fastify.log.info({ type }, "Ignoring unknown webhook event");
      }
    } catch (err) {
      fastify.log.error({ err, type, clerkId: data.id }, "Webhook handler error");
    }

    // AC 8: Always return 200
    return reply.code(200).send({ success: true });
  });

  // ============================================================
  // Story 35.6 (Epic 35 fase 2) — Webhook de assinatura Kiwify.
  // URL única por projeto: POST /api/webhooks/kiwify/:projectId?token=<webhookToken>.
  // O expert cola essa URL no painel da Kiwify dele. Roteamento pelo projectId no
  // path; autenticação pela comparação constant-time do token (sem HMAC nesta fase).
  //
  // Estratégia: grava SEMPRE o evento bruto (idempotente via dedup_key = sha256 do
  // corpo) e, se o evento referir uma assinatura, faz upsert do estado normalizado.
  // Responde 200 em qualquer erro de processamento (não-2xx faz a Kiwify reenviar).
  //
  // SEGURANÇA: nunca logar o corpo (PII do customer) nem o token.
  // ============================================================
  fastify.post("/api/webhooks/kiwify/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const token = (request.query as { token?: string }).token ?? "";

    if (!UUID_RE.test(projectId)) {
      return reply.code(404).send({ error: "Not found" });
    }

    // Roteia + autentica: token secreto guardado na conexão Kiwify do projeto.
    const [conn] = await fastify.db
      .select({ webhookToken: kiwifyConnections.webhookToken })
      .from(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, projectId))
      .limit(1);

    if (!conn?.webhookToken) {
      // Projeto sem webhook configurado — não revela se o projeto existe.
      return reply.code(404).send({ error: "Not found" });
    }
    if (!token || !tokensMatch(token, conn.webhookToken)) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const rawBody = typeof request.body === "string" ? request.body : "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      fastify.log.warn({ projectId }, "Kiwify webhook: corpo não-JSON, ignorando");
      return reply.code(200).send({ ok: true });
    }

    try {
      const dedupKey = computeDedupKey(rawBody);
      const eventType = extractEventType(payload);
      const orderId = extractOrderId(payload);
      const norm = normalizeKiwifySubscriptionEvent(payload);

      // 1) Log bruto idempotente. Reenvio idêntico (mesmo corpo) colide e é no-op.
      const inserted = await fastify.db
        .insert(kiwifyWebhookEvents)
        .values({
          projectId,
          eventType,
          orderId,
          subscriptionId: norm?.subscriptionId ?? null,
          dedupKey,
          payload,
        })
        .onConflictDoNothing({
          target: [kiwifyWebhookEvents.projectId, kiwifyWebhookEvents.dedupKey],
        })
        .returning({ id: kiwifyWebhookEvents.id });

      if (inserted.length === 0) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }

      // 2) Upsert do estado normalizado quando o evento referir uma assinatura.
      // "Último recebido vence" (lastEventAt = hora de recebimento). Campos de
      // identidade usam coalesce p/ não apagar valor já conhecido quando um evento
      // posterior vier sem ele. Limitação conhecida: entrega fora de ordem pode
      // sobrescrever um estado mais recente (raro; o log bruto permite reprocessar).
      if (norm) {
        const now = new Date();
        await fastify.db
          .insert(kiwifySubscriptions)
          .values({
            projectId,
            subscriptionId: norm.subscriptionId,
            productId: norm.productId,
            productName: norm.productName,
            planName: norm.planName,
            customerEmail: norm.customerEmail,
            customerName: norm.customerName,
            status: norm.status,
            orderId: norm.orderId,
            amount: norm.amount,
            currency: norm.currency,
            startedAt: norm.startedAt,
            nextChargeAt: norm.nextChargeAt,
            canceledAt: norm.canceledAt,
            lastEventType: norm.eventType,
            lastEventAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [kiwifySubscriptions.projectId, kiwifySubscriptions.subscriptionId],
            set: {
              status: norm.status,
              orderId: norm.orderId,
              amount: norm.amount,
              nextChargeAt: norm.nextChargeAt,
              canceledAt: norm.canceledAt,
              lastEventType: norm.eventType,
              lastEventAt: now,
              updatedAt: now,
              // Identidade: preserva o valor anterior se o novo vier nulo.
              productId: sql`coalesce(excluded.product_id, ${kiwifySubscriptions.productId})`,
              productName: sql`coalesce(excluded.product_name, ${kiwifySubscriptions.productName})`,
              planName: sql`coalesce(excluded.plan_name, ${kiwifySubscriptions.planName})`,
              customerEmail: sql`coalesce(excluded.customer_email, ${kiwifySubscriptions.customerEmail})`,
              customerName: sql`coalesce(excluded.customer_name, ${kiwifySubscriptions.customerName})`,
              currency: sql`coalesce(excluded.currency, ${kiwifySubscriptions.currency})`,
              startedAt: sql`coalesce(excluded.started_at, ${kiwifySubscriptions.startedAt})`,
            },
          });
      }
    } catch (err) {
      // Nunca propagar erro (não-2xx faz a Kiwify reenviar em loop). Só status.
      fastify.log.error({ err, projectId }, "Kiwify webhook handler error");
    }

    return reply.code(200).send({ ok: true });
  });

  // ============================================================
  // Etapa Lyrio — Webhook RevenueCat.
  // URL única por ETAPA: POST /api/webhooks/revenuecat/:stageId?token=<webhookToken>.
  // O expert cola essa URL no painel de webhooks do RevenueCat. Roteamento pelo
  // stageId no path; autenticação pela comparação constant-time do token guardado
  // na config da etapa (revenuecat_stage_config).
  //
  // O RevenueCat também permite configurar um header Authorization no webhook —
  // se enviado, exigimos que bata com o token (defesa extra). O token na query é
  // o canal principal (o header pode não estar disponível em toda config).
  //
  // Idempotente via (stage_id, event_id). Responde 200 em qualquer erro de
  // processamento (não-2xx faz o RevenueCat reenviar). SEGURANÇA: nunca logar o
  // corpo (app_user_id é PII) nem o token.
  // ============================================================
  fastify.post("/api/webhooks/revenuecat/:stageId", async (request, reply) => {
    const { stageId } = request.params as { stageId: string };
    const token = (request.query as { token?: string }).token ?? "";

    if (!UUID_RE.test(stageId)) {
      return reply.code(404).send({ error: "Not found" });
    }

    const [cfg] = await fastify.db
      .select({
        projectId: revenuecatStageConfig.projectId,
        webhookToken: revenuecatStageConfig.webhookToken,
      })
      .from(revenuecatStageConfig)
      .where(eq(revenuecatStageConfig.stageId, stageId))
      .limit(1);

    if (!cfg?.webhookToken) {
      // Etapa sem webhook configurado — não revela se a etapa existe.
      return reply.code(404).send({ error: "Not found" });
    }

    // Token via query (canal principal) OU via header Authorization (se o
    // RevenueCat estiver configurado com "Authorization: <token>").
    const authHeader = (request.headers["authorization"] as string | undefined) ?? "";
    const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const provided = token || headerToken;
    if (!provided || !tokensMatch(provided, cfg.webhookToken)) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const rawBody = typeof request.body === "string" ? request.body : "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      fastify.log.warn({ stageId }, "RevenueCat webhook: corpo não-JSON, ignorando");
      return reply.code(200).send({ ok: true });
    }

    try {
      const norm = normalizeRevenuecatEvent(payload, rawBody);
      if (!norm) {
        // Payload sem objeto de evento (ex.: teste de conexão) — 200 e ignora.
        return reply.code(200).send({ ok: true });
      }
      const dedupKey = computeRevenuecatDedupKey(rawBody);

      const inserted = await fastify.db
        .insert(revenuecatSales)
        .values({
          stageId,
          projectId: cfg.projectId,
          eventId: norm.eventId,
          dedupKey,
          eventType: norm.eventType,
          store: norm.store,
          environment: norm.environment,
          appUserId: norm.appUserId,
          productId: norm.productId,
          countryCode: norm.countryCode,
          currency: norm.currency,
          priceInPurchasedCurrency: norm.priceInPurchasedCurrency,
          revenueUsd: norm.revenueUsd,
          purchasedAt: norm.purchasedAt,
          eventAt: norm.eventAt,
          // Story 42.6 — atribuição. Sem PII: só UTM, click ids e o atributo
          // custom do app.
          utmSource: norm.utmSource,
          utmMedium: norm.utmMedium,
          utmCampaign: norm.utmCampaign,
          utmTerm: norm.utmTerm,
          utmContent: norm.utmContent,
          gclid: norm.gclid,
          fbclid: norm.fbclid,
          acquisitionSource: norm.acquisitionSource,
          payload,
        })
        .onConflictDoNothing({
          target: [revenuecatSales.stageId, revenuecatSales.eventId],
        })
        .returning({ id: revenuecatSales.id });

      if (inserted.length === 0) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }
    } catch (err) {
      // Nunca propagar erro (não-2xx faz o RevenueCat reenviar em loop).
      fastify.log.error({ err, stageId }, "RevenueCat webhook handler error");
    }

    return reply.code(200).send({ ok: true });
  });

  // ============================================================
  // Leads por webhook — Mautic, n8n, formulário da LP.
  // URL única por FONTE: POST /api/webhooks/leads/:sourceId?token=<token>.
  //
  // Aceita form-urlencoded (o que o Mautic manda) e JSON. A fonte é uma
  // planilha virtual da etapa: as linhas gravadas aqui são lidas de volta por
  // `readSheetData`, então scoring, origem por UTM, debriefing e CAPI veem o
  // mesmo formato de sempre (ver `services/webhook-leads.ts`).
  //
  // Responde 200 em QUALQUER corpo — inclusive o que não dá para aproveitar.
  // Não-2xx faz o Mautic reenviar em laço, e um laço de reenvio é pior que um
  // lead perdido. SEGURANÇA: nunca logar corpo (PII) nem token.
  // ============================================================
  fastify.post("/api/webhooks/leads/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const queryToken = (request.query as { token?: string }).token ?? "";

    if (!UUID_RE.test(sourceId)) {
      return reply.code(404).send({ error: "Not found" });
    }

    const [fonte] = await fastify.db
      .select({ token: webhookLeadSources.token })
      .from(webhookLeadSources)
      .where(eq(webhookLeadSources.id, sourceId))
      .limit(1);

    // Fonte removida (ou nunca existiu) — não revela qual dos dois.
    if (!fonte) return reply.code(404).send({ error: "Not found" });

    const authHeader = (request.headers["authorization"] as string | undefined) ?? "";
    const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const provided = queryToken || headerToken;
    if (!provided || !tokensMatch(provided, fonte.token)) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const corpo = parseCorpoDeWebhook(
      request.body,
      (request.headers["content-type"] as string | undefined) ?? "",
    );
    if (!corpo) {
      fastify.log.warn({ sourceId }, "Webhook de leads: corpo ilegível, ignorando");
      return reply.code(200).send({ ok: true, ignorado: "corpo_ilegivel" });
    }

    const lead = normalizarLead(corpo);
    if (!lead) {
      // Teste de conexão do Mautic/n8n cai aqui, e também o envio em que o
      // campo de e-mail não foi mapeado na origem.
      fastify.log.warn({ sourceId }, "Webhook de leads: sem e-mail nem telefone, ignorando");
      return reply.code(200).send({ ok: true, ignorado: "sem_identificador" });
    }

    try {
      // Reenvio do mesmo lead em menos de um minuto é retry, não inscrição
      // nova. Depois disso entra como linha nova — é o que a planilha faria, e
      // o dedup de "únicos" acontece na leitura.
      const identificador = lead.email
        ? eq(webhookLeads.email, lead.email)
        : eq(webhookLeads.telefone, lead.telefone!);
      const [repetido] = await fastify.db
        .select({ id: webhookLeads.id })
        .from(webhookLeads)
        .where(
          and(
            eq(webhookLeads.sourceId, sourceId),
            identificador,
            sql`${webhookLeads.recebidoEm} > now() - interval '1 minute'`,
          ),
        )
        .limit(1);

      if (repetido) return reply.code(200).send({ ok: true, duplicate: true });

      await fastify.db.insert(webhookLeads).values({
        sourceId,
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
        utmContent: lead.utmContent,
        utmTerm: lead.utmTerm,
        payload: corpo,
      });
    } catch (err) {
      fastify.log.error({ err, sourceId }, "Webhook de leads: falha ao gravar");
    }

    return reply.code(200).send({ ok: true });
  });

  // ============================================================
  // RESPOSTAS DE PESQUISA POR WEBHOOK (sem Tally, sem planilha)
  // ============================================================
  // URL única por PESQUISA: POST /api/webhooks/pesquisa/:surveyId?token=<token>.
  //
  // Guarda o corpo CRU e só ele. Quem envia é que nomeia as perguntas, e o
  // nome da pergunta é a coluna — normalizar aqui seria apagar o que o motor
  // de scoring precisa casar (ver `services/webhook-pesquisa.ts`).
  //
  // Responde 200 em QUALQUER corpo, como a recepção de leads: não-2xx faz o
  // remetente reenviar em laço. SEGURANÇA: nunca logar corpo (PII) nem token.
  // ============================================================
  fastify.post("/api/webhooks/pesquisa/:surveyId", async (request, reply) => {
    const { surveyId } = request.params as { surveyId: string };
    const queryToken = (request.query as { token?: string }).token ?? "";

    if (!UUID_RE.test(surveyId)) {
      return reply.code(404).send({ error: "Not found" });
    }

    const [pesquisa] = await fastify.db
      .select({ token: funnelSurveys.webhookToken })
      .from(funnelSurveys)
      .where(eq(funnelSurveys.id, surveyId))
      .limit(1);

    // Pesquisa removida, ou que é planilha do Google e não tem token — não
    // revela qual dos dois.
    if (!pesquisa?.token) return reply.code(404).send({ error: "Not found" });

    const authHeader = (request.headers["authorization"] as string | undefined) ?? "";
    const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const provided = queryToken || headerToken;
    if (!provided || !tokensMatch(provided, pesquisa.token)) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const corpo = parseCorpoDeWebhook(
      request.body,
      (request.headers["content-type"] as string | undefined) ?? "",
    );
    if (!corpo) {
      fastify.log.warn({ surveyId }, "Webhook de pesquisa: corpo ilegível, ignorando");
      return reply.code(200).send({ ok: true, ignorado: "corpo_ilegivel" });
    }

    // Corpo vazio é o teste de conexão do n8n: nada a gravar, e gravar daria
    // uma linha de respondente que não existe.
    if (Object.keys(corpo).length === 0) {
      return reply.code(200).send({ ok: true, ignorado: "corpo_vazio" });
    }

    try {
      await fastify.db.insert(webhookSurveyResponses).values({ surveyId, payload: corpo });
    } catch (err) {
      fastify.log.error({ err, surveyId }, "Webhook de pesquisa: falha ao gravar");
    }

    return reply.code(200).send({ ok: true });
  });
}
