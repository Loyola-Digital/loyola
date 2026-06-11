-- Switchy: coluna `domain` no histórico de shortlinks + backfill da short URL.
-- Bug: o short_url era salvo com a URL longa de destino (parse pegava link.url).
-- A short real é `https://{domain}/{switchy_link_id}`. Links antigos foram
-- criados no domínio default `hi.switchy.io` (gerador não pedia domínio).
-- Idempotente.

ALTER TABLE "switchy_shortened_links"
  ADD COLUMN IF NOT EXISTS "domain" varchar(255);
--> statement-breakpoint
-- Backfill: registros com link criado no Switchy (tem switchy_link_id) cujo
-- short_url ficou igual à full_url (sintoma do bug). Reconstrói pra hi.switchy.io.
UPDATE "switchy_shortened_links"
SET "domain" = 'hi.switchy.io',
    "short_url" = 'https://hi.switchy.io/' || "switchy_link_id"
WHERE "switchy_link_id" IS NOT NULL
  AND ("short_url" IS NULL OR "short_url" = "full_url");
