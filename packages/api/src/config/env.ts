import { z } from "zod";
import fp from "fastify-plugin";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MINDS_BASE_PATH: z.string().default("./squads"),
  CLICKUP_API_TOKEN: z.string().min(1).optional(),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/, "Must be 64-char hex string").optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1).optional(),
  SWITCHY_API_TOKEN: z.string().min(1).optional(),
  // Story 18.37: backfill diário do cache de nomes Meta. Hora local do servidor
  // (0-23; default 3 = madrugada, aplicado no scheduler). `META_BACKFILL_ENABLED=false`
  // desliga o agendador (sempre desligado em NODE_ENV=test). Opcionais p/ não
  // forçar os mocks de config dos testes.
  META_BACKFILL_HOUR: z.coerce.number().int().min(0).max(23).optional(),
  META_BACKFILL_ENABLED: z.enum(["true", "false"]).optional(),
  // Story 36.4: refresh diário da performance Meta (ad/campaign insights) no cache.
  // Hora local (0-23; default 4). META_PERF_SYNC_ENABLED=false desliga.
  META_PERF_SYNC_HOUR: z.coerce.number().int().min(0).max(23).optional(),
  META_PERF_SYNC_ENABLED: z.enum(["true", "false"]).optional(),
  // Janela (dias) do refresh diário completo (com creatives). Default 14.
  META_PERF_SYNC_DAYS: z.coerce.number().int().min(1).max(90).optional(),
  // Epic 35+: refresh INTRADAY (mantém "hoje/recente" fresco no banco para os
  // painéis lerem sem chamar a Meta). Intervalo em minutos (default 15) e janela
  // curta de dias (default 3). META_PERF_INTRADAY_ENABLED=false desliga.
  META_PERF_INTRADAY_ENABLED: z.enum(["true", "false"]).optional(),
  META_PERF_INTRADAY_MINUTES: z.coerce.number().int().min(1).max(720).optional(),
  META_PERF_INTRADAY_DAYS: z.coerce.number().int().min(1).max(90).optional(),
});

export type Env = z.infer<typeof envSchema>;

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export default fp(async function envPlugin(fastify) {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    fastify.log.error(
      { errors: parsed.error.flatten().fieldErrors },
      "Invalid environment variables"
    );
    throw new Error("Invalid environment variables");
  }

  fastify.decorate("config", parsed.data);
});
