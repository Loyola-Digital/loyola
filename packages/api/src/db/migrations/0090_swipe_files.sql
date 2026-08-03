-- Swipe Files (área Global): biblioteca de referências de anúncios.
--
-- O time sobe imagem/vídeo/print OU cola um link (post, Biblioteca de Anúncios
-- do Meta, LP) e o sistema busca o preview. É acervo compartilhado: referência
-- boa serve pra qualquer cliente, então não é escopada por projeto — o recorte
-- vem dos filtros (marca, nicho, plataforma, formato, tag).
--
-- Binário NÃO vive no Postgres nem no disco do container (Coolify recria a cada
-- deploy): vai pro bucket, e aqui fica só a URL + a chave (pra poder apagar).
--
-- Idempotente — prod não roda drizzle migrate.
CREATE TABLE IF NOT EXISTS "swipe_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(200) NOT NULL,
  "notes" text,

  -- image | video | link. Define o que renderizar no card e no lightbox.
  "asset_kind" varchar(10) NOT NULL,

  -- Arquivo no bucket (asset_kind image/video). `file_key` é o caminho no
  -- bucket — guardado separado da URL pra conseguir deletar o objeto depois.
  "file_url" text,
  "file_key" text,
  "file_mime" varchar(100),
  "file_size_bytes" integer,
  -- Dimensões da imagem/vídeo, quando conhecidas: evita salto de layout no
  -- grid (o card reserva a proporção antes de carregar).
  "width" integer,
  "height" integer,

  -- Link de origem. Vale pros três tipos: um upload também pode apontar pro
  -- anúncio original ("de onde eu tirei esse print").
  "source_url" text,

  -- Preview do link (Open Graph), buscado no servidor. Cacheado aqui pra não
  -- refazer fetch a cada render — e pra referência sobreviver se a página sair
  -- do ar.
  "og_title" text,
  "og_description" text,
  "og_image" text,
  "og_site_name" varchar(120),
  "og_fetched_at" timestamp with time zone,

  -- Taxonomia. Texto livre em vez de enum: o time descobre categoria nova toda
  -- semana, e ALTER TYPE em enum no Postgres trava deploy.
  "brand" varchar(120),
  "niche" varchar(120),
  "platform" varchar(40),
  "format" varchar(40),
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Curadoria: o que o time marcou como referência forte.
  "is_favorite" boolean NOT NULL DEFAULT false,

  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Listagem padrão: mais recente primeiro.
CREATE INDEX IF NOT EXISTS "idx_swipe_files_created" ON "swipe_files" ("created_at" DESC);
--> statement-breakpoint
-- Filtros da barra superior.
CREATE INDEX IF NOT EXISTS "idx_swipe_files_facets" ON "swipe_files" ("platform", "format", "niche");
--> statement-breakpoint
-- Busca por tag: GIN no jsonb permite "tem esta tag?" sem varrer a tabela.
CREATE INDEX IF NOT EXISTS "idx_swipe_files_tags" ON "swipe_files" USING GIN ("tags");
