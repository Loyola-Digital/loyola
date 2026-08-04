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
  // Story 38.3: alerta diário de pagamentos (Evento Presencial) no chat do
  // ClickUp. Hora local de São Paulo a partir da qual envia (default 8).
  // PAYMENT_ALERT_ENABLED=false desliga (sempre desligado em NODE_ENV=test).
  PAYMENT_ALERT_HOUR: z.coerce.number().int().min(0).max(23).optional(),
  PAYMENT_ALERT_ENABLED: z.enum(["true", "false"]).optional(),
  // API pública de vendas: idade máxima do cache antes de recalcular AO VIVO na
  // requisição (default 120s). O job noturno vira só aquecimento — quem consulta
  // nunca recebe número velho. Subir se a cota do Sheets apertar.
  SALES_PUBLIC_MAX_AGE_SEC: z.coerce.number().int().min(0).max(86400).optional(),
  // Spy de Conteúdo (área Global): scan de perfil do Instagram via Apify +
  // análise Claude. Sem APIFY_TOKEN o worker não sobe e a rota recusa o scan.
  APIFY_TOKEN: z.string().optional(),
  APIFY_ACTOR: z.string().optional(),
  INSTA_SCAN_WORKER_ENABLED: z.enum(["true", "false"]).optional(),
  /** Scans simultâneos. Cada um custa 2 runs Apify + ~70k tokens — subir com cuidado. */
  INSTA_SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(8).optional(),
  INSTA_SCAN_MODEL: z.string().optional(),
  INSTA_SCAN_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  /** Teto de scans por usuário por dia — trava de custo. */
  INSTA_SCAN_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).optional(),
  // Swipe Files: bucket S3-compatível pros arquivos que o time sobe. Sem isso a
  // biblioteca ainda aceita LINK, mas recusa upload — o disco do container é
  // efêmero, então não há fallback local.
  //
  // Serve qualquer provedor que fale S3. Formatos do endpoint:
  //   Supabase   https://<projeto>.supabase.co/storage/v1/s3
  //   R2         https://<account-id>.r2.cloudflarestorage.com
  //   MinIO      https://s3.seu-dominio.com
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  /** Base pública do bucket — o app concatena `/<chave>` nela. */
  STORAGE_PUBLIC_URL: z.string().optional(),
  /** Região real (Supabase/S3). O R2 aceita o default "auto". */
  STORAGE_REGION: z.string().optional(),
  /** "true" pra Supabase e MinIO; R2 e S3 dispensam. */
  STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
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
