import { Pool } from "pg";

// Story 35.6 (Epic 35 fase 2) — Webhooks de assinatura Kiwify.
// Runner idempotente e AUTOSSUFICIENTE (Pool próprio — não depende do plugin
// Fastify). Aplica src/db/migrations/0056_kiwify_subscriptions.sql. Rodar com
// DATABASE_URL no ambiente:
//   pnpm --filter @loyola-x/api exec tsx migrate-0056.ts
//
// Idempotente: reexecutar é seguro (IF NOT EXISTS / guards via information_schema).

const STATEMENTS: string[] = [
  // 1) webhook_token por projeto em kiwify_connections (+ unique).
  `ALTER TABLE "kiwify_connections" ADD COLUMN IF NOT EXISTS "webhook_token" text;`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'kiwify_connections_webhook_token_unique'
         AND table_name = 'kiwify_connections'
         AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "kiwify_connections"
         ADD CONSTRAINT "kiwify_connections_webhook_token_unique" UNIQUE ("webhook_token");
     END IF;
   END $$;`,

  // 2) kiwify_webhook_events (log bruto + idempotência).
  `CREATE TABLE IF NOT EXISTS "kiwify_webhook_events" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "project_id" uuid NOT NULL,
     "event_type" text,
     "order_id" text,
     "subscription_id" text,
     "dedup_key" text NOT NULL,
     "payload" jsonb NOT NULL,
     "received_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "kiwify_webhook_events_project_dedup_unique" UNIQUE ("project_id", "dedup_key")
   );`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'kiwify_webhook_events_project_id_projects_id_fk'
         AND table_name = 'kiwify_webhook_events'
         AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "kiwify_webhook_events"
         ADD CONSTRAINT "kiwify_webhook_events_project_id_projects_id_fk"
         FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
     END IF;
   END $$;`,
  `CREATE INDEX IF NOT EXISTS "idx_kiwify_webhook_events_project"
     ON "kiwify_webhook_events" USING btree ("project_id");`,
  `CREATE INDEX IF NOT EXISTS "idx_kiwify_webhook_events_subscription"
     ON "kiwify_webhook_events" USING btree ("project_id","subscription_id");`,

  // 3) kiwify_subscriptions (estado normalizado atual).
  `CREATE TABLE IF NOT EXISTS "kiwify_subscriptions" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "project_id" uuid NOT NULL,
     "subscription_id" text NOT NULL,
     "product_id" text,
     "product_name" text,
     "plan_name" text,
     "customer_email" text,
     "customer_name" text,
     "status" text NOT NULL,
     "order_id" text,
     "amount" integer,
     "currency" text,
     "started_at" timestamp with time zone,
     "next_charge_at" timestamp with time zone,
     "canceled_at" timestamp with time zone,
     "last_event_type" text,
     "last_event_at" timestamp with time zone,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
     CONSTRAINT "kiwify_subscriptions_project_sub_unique" UNIQUE ("project_id", "subscription_id")
   );`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'kiwify_subscriptions_project_id_projects_id_fk'
         AND table_name = 'kiwify_subscriptions'
         AND constraint_schema = 'public'
     ) THEN
       ALTER TABLE "kiwify_subscriptions"
         ADD CONSTRAINT "kiwify_subscriptions_project_id_projects_id_fk"
         FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
     END IF;
   END $$;`,
  `CREATE INDEX IF NOT EXISTS "idx_kiwify_subscriptions_project_status"
     ON "kiwify_subscriptions" USING btree ("project_id","status");`,
];

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida — abortando migration 0056.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("Applying migration 0056 (kiwify subscriptions webhooks)...");
    for (const stmt of STATEMENTS) {
      await pool.query(stmt);
    }
    console.log("Migration 0056 applied successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
