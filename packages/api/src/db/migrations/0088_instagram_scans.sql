-- Instagram Scanner (área Global): fila + resultado do scan de um perfil.
--
-- O scan leva ~5min (2 runs Apify + análise Claude), então a requisição HTTP só
-- enfileira; um worker in-process consome a fila e grava o resultado aqui. O
-- front faz polling do status — a pessoa não fica presa na página.
--
-- `metrics` e `analysis` guardam o JSON estruturado (não HTML): a visualização é
-- React nativa, e o JSON permite re-renderizar e comparar perfis depois sem
-- re-scrapar (cada scan custa crédito Apify + ~70k tokens).
--
-- Idempotente — prod não roda drizzle migrate.
CREATE TABLE IF NOT EXISTS "instagram_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(30) NOT NULL,
  -- queued | running | done | failed. Sem enum: status de job muda com o tempo
  -- e ALTER TYPE em enum no Postgres é mais chato que um CHECK.
  "status" varchar(12) NOT NULL DEFAULT 'queued',
  -- Parâmetros do scan (limit/since/tz) — guardados pra reprodutibilidade e pra
  -- o worker não depender do request original.
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "profile" jsonb,
  "metrics" jsonb,
  "analysis" jsonb,
  -- Tokens gastos + modelo, pra dar visibilidade de custo por scan.
  "usage" jsonb,
  "error" text,
  -- Quem pediu. RESTRICT: histórico de scan não some junto com o usuário.
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  -- Lease do worker: quem pegou e quando. Permite re-claim de job órfão
  -- (processo morreu no meio) sem travar a fila pra sempre.
  "claimed_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Fila: o worker busca queued mais antigo primeiro (FIFO) com SKIP LOCKED.
CREATE INDEX IF NOT EXISTS "idx_insta_scans_queue" ON "instagram_scans" ("status", "created_at");
--> statement-breakpoint
-- Listagem do front (mais recente primeiro) e busca por perfil.
CREATE INDEX IF NOT EXISTS "idx_insta_scans_username" ON "instagram_scans" ("username", "created_at" DESC);
