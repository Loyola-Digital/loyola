import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { googleAdsAccounts } from "../db/schema.js";
import {
  decryptToken,
  fetchGoogleAdsOverview,
  fetchGoogleAdsDailyInsights,
  fetchGoogleAdsCampaigns,
} from "../services/google-ads.js";

const accountIdParamSchema = z.object({
  accountId: z.string().uuid(),
});

const daysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  campaignId: z.string().optional(),
});

export default fp(async function googleAdsAnalyticsRoutes(fastify) {
  // Helper: get account + decrypt tokens
  async function getAccount(accountId: string, userRole: string) {
    if (userRole === "guest") return null;
    const rows = await fastify.db
      .select()
      .from(googleAdsAccounts)
      .where(eq(googleAdsAccounts.id, accountId))
      .limit(1);
    const account = rows[0];
    if (!account) return null;
    return {
      customerId: account.customerId,
      developerToken: decryptToken(account.developerTokenEncrypted, account.developerTokenIv),
      refreshToken: decryptToken(account.refreshTokenEncrypted, account.refreshTokenIv),
    };
  }

  // ---- GET /api/google-ads/analytics/:accountId/overview ----
  fastify.get(
    "/api/google-ads/analytics/:accountId/overview",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = accountIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "accountId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      const account = await getAccount(paramResult.data.accountId, request.userRole!);
      if (!account) {
        return reply.code(404).send({ error: "Conta nao encontrada" });
      }

      try {
        const overview = await fetchGoogleAdsOverview(
          account.customerId,
          account.developerToken,
          account.refreshToken,
          days
        );
        return overview;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar overview do Google Ads",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/google-ads/analytics/:accountId/daily ----
  fastify.get(
    "/api/google-ads/analytics/:accountId/daily",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = accountIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "accountId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const { days, campaignId } = queryResult.success
        ? queryResult.data
        : { days: 30, campaignId: undefined };

      const account = await getAccount(paramResult.data.accountId, request.userRole!);
      if (!account) {
        return reply.code(404).send({ error: "Conta nao encontrada" });
      }

      try {
        const daily = await fetchGoogleAdsDailyInsights(
          account.customerId,
          account.developerToken,
          account.refreshToken,
          days,
          campaignId
        );
        return daily;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar insights diarios do Google Ads",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/google-ads/analytics/:accountId/campaigns ----
  fastify.get(
    "/api/google-ads/analytics/:accountId/campaigns",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = accountIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "accountId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      const account = await getAccount(paramResult.data.accountId, request.userRole!);
      if (!account) {
        return reply.code(404).send({ error: "Conta nao encontrada" });
      }

      try {
        const campaigns = await fetchGoogleAdsCampaigns(
          account.customerId,
          account.developerToken,
          account.refreshToken,
          days
        );
        return { campaigns };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar campanhas do Google Ads",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );
});
