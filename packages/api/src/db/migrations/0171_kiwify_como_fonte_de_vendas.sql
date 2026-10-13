-- A Kiwify como FONTE DE VENDAS da etapa, no lugar da planilha.
--
-- ## Por que a API ganha da planilha
--
-- A planilha é uma cópia do que a Kiwify já sabe: atrasa, perde coluna e
-- depende de alguém arrastar fórmula. Medido na conta DG & CPDF em 13/10/2026:
-- das 574 vendas de 30 dias, **92,3% já chegam com `utm_source`** da própria
-- Kiwify — sem ninguém colar nada em aba nenhuma.
--
-- ## Por que cache, e não consulta ao vivo
--
-- `/v1/sales` exige `start_date`+`end_date` e tem **teto de 90 dias** por
-- consulta. Um perpétuo com dois anos de histórico são ~8 chamadas paginadas,
-- e fazer isso a cada abertura de tela é lento e estoura o rate limit. Então o
-- padrão é o mesmo que o Meta já usa aqui: a sincronização é a única que fala
-- com a API, e a tela lê o banco.
--
-- ## A chave é (projeto, venda)
--
-- `sale_id` é único na Kiwify, e o upsert por ele deixa a sincronização
-- repetível: rodar de novo a mesma janela corrige valor e status (a venda muda
-- de `waiting_payment` para `paid`, e depois pode ser reembolsada) sem
-- duplicar nada.

CREATE TABLE IF NOT EXISTS "kiwify_sales" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "sale_id" varchar(64) NOT NULL,

  "product_id" varchar(64),
  "product_name" text,
  -- A OFERTA ("Lote 1", "Lote Promocional", "OrderBump - DGPG05"). A venda
  -- traz, mas `/v1/products` NÃO lista as ofertas de um produto — então a
  -- lista para escolher sai daqui, das vendas que existem.
  -- Nulo é um caso REAL: 91 das 574 vendas medidas não tinham oferta.
  "offer_id" varchar(64),
  "offer_name" text,

  "status" varchar(24),
  "payment_method" varchar(24),
  -- Centavos, como a API manda. `bruto` = payment.charge_amount (o que o
  -- cliente pagou); `liquido` = net_amount (o que sobra para o produtor).
  -- ⚠️ liquido ≠ bruto − taxa: numa venda real, 4490 bruto, 473 de taxa e 2008
  -- de líquido — o resto é divisão com co-produtor/afiliado.
  "bruto_centavos" integer,
  "liquido_centavos" integer,
  "taxa_centavos" integer,
  "currency" varchar(8),
  "installments" integer,
  -- Vazio em venda nova, preenchido em renovação.
  "parent_order_id" varchar(64),

  "criada_em" timestamp with time zone,
  "aprovada_em" timestamp with time zone,
  "reembolsada_em" timestamp with time zone,

  -- PII do comprador. Fica aqui porque o casamento da etapa é por e-mail, o
  -- mesmo que a planilha fazia. Nunca sai em log.
  "customer_email" text,
  "customer_name" text,

  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_content" text,
  "utm_term" text,
  "sck" text,

  "sincronizada_em" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("project_id", "sale_id")
);

-- O recorte que a etapa faz: produto + oferta + data.
CREATE INDEX IF NOT EXISTS "idx_kiwify_sales_recorte"
  ON "kiwify_sales" ("project_id", "product_id", "criada_em");
-- O casamento por e-mail com os leads da etapa.
CREATE INDEX IF NOT EXISTS "idx_kiwify_sales_email"
  ON "kiwify_sales" ("project_id", "customer_email");

-- Até onde a sincronização já foi, por projeto. Fica na conexão em vez de uma
-- tabela nova: é 1:1 com ela e morre junto.
ALTER TABLE "kiwify_connections"
  ADD COLUMN IF NOT EXISTS "vendas_sync_de" varchar(10),
  ADD COLUMN IF NOT EXISTS "vendas_sync_ate" varchar(10),
  ADD COLUMN IF NOT EXISTS "vendas_sync_em" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "vendas_sync_total" integer;

-- O recorte por etapa. `kiwify_stage_configs` já guardava produto + data de
-- início (a conferência de ingressos do evento usa) — a oferta e a escolha da
-- fonte entram no mesmo lugar, que é o mesmo conceito: qual pedaço da Kiwify
-- esta etapa olha.
ALTER TABLE "kiwify_stage_configs"
  -- 'planilha' (padrão, tudo como antes) | 'kiwify' (lê o cache acima).
  ADD COLUMN IF NOT EXISTS "fonte_de_vendas" varchar(10) NOT NULL DEFAULT 'planilha',
  -- Ofertas escolhidas. Vazio = TODAS as ofertas dos produtos escolhidos —
  -- diferente de "nenhuma", senão ligar a fonte sem escolher oferta zeraria a
  -- etapa. A string 'sem-oferta' representa a venda sem oferta nenhuma, que
  -- precisa ser escolhível para não desaparecer do recorte em silêncio.
  ADD COLUMN IF NOT EXISTS "offer_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- `start_date` era NOT NULL porque só a conferência de ingressos usava a
-- tabela, e ali a data é obrigatória. Como fonte de vendas ela é opcional
-- (etapa sem corte pega tudo que a sincronização tem), e exigi-la impediria
-- gravar o recorte antes de alguém decidir a data.
ALTER TABLE "kiwify_stage_configs" ALTER COLUMN "start_date" DROP NOT NULL;

-- Rollback:
-- DROP TABLE IF EXISTS "kiwify_sales";
-- ALTER TABLE "kiwify_connections"
--   DROP COLUMN IF EXISTS "vendas_sync_de", DROP COLUMN IF EXISTS "vendas_sync_ate",
--   DROP COLUMN IF EXISTS "vendas_sync_em", DROP COLUMN IF EXISTS "vendas_sync_total";
-- ALTER TABLE "kiwify_stage_configs"
--   DROP COLUMN IF EXISTS "fonte_de_vendas", DROP COLUMN IF EXISTS "offer_ids";
