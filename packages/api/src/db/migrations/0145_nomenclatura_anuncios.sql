-- Epic 47 / Story 47.10 — Nome de anúncio.
--
-- `{tipo}{NN}_{expert}_{sigla}{NN}_{mm-aaaa}--{descricao}`
-- adv03_dg_pg02_09-2026--gancho-demissao
--
-- ## Dois tipos novos de valor fixo
--
-- Tipo de criativo (ad · adv · carr) e sigla de lançamento (pg · l · m · pr)
-- entram em naming_dictionary_values com dois `type` novos — reaproveita o
-- CRUD, a imutabilidade e o changelog que já existem. ADD VALUE com IF NOT
-- EXISTS é idempotente; fora de transação em Postgres antigos, em transação
-- no 12+ (o valor novo só é usado depois do commit — o seed roda à parte).
--
-- ## naming_ads
--
-- O NN do criativo é uma sequência ÚNICA por expert (resposta do dono): o 7º
-- criativo do DG é 07, seja ad, adv ou carr. O UNIQUE (expert_id,
-- creative_seq) é a garantia contra corrida — o servidor recalcula na
-- gravação e responde 409 se o número acabou de ser ocupado. `structure`
-- (até o `--`) é o que o designer recebe; `name` é estrutura + descrição.

ALTER TYPE naming_dictionary_type ADD VALUE IF NOT EXISTS 'creative_type';
ALTER TYPE naming_dictionary_type ADD VALUE IF NOT EXISTS 'launch_type';

CREATE TABLE IF NOT EXISTS naming_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  creative_type varchar(20) NOT NULL,
  creative_seq integer NOT NULL,
  launch_type varchar(20) NOT NULL,
  launch_seq integer NOT NULL,
  ad_date date NOT NULL,
  description text,
  structure varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_ads_expert_seq ON naming_ads (expert_id, creative_seq);
CREATE INDEX IF NOT EXISTS idx_naming_ads_expert ON naming_ads (expert_id);
