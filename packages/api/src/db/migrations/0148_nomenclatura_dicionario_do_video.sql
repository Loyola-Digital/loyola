-- Epic 47 / Story 47.12 — Dicionário do vídeo (pedido do gestor de tráfego, 15/09/2026).
--
-- Dois cadastros que o nome de vídeo v2 (47.13) vai ler:
--   adv01_h_dg_pg04_h01_b01_09-2026--
--          ^ origem            ^ hook ^ body
--
-- ## Origem do vídeo em Valores fixos
--
-- `ia` (feito por inteligência artificial) · `h` (feito por humano) entram em
-- naming_dictionary_values com um `type` novo — reaproveita CRUD, imutabilidade
-- e changelog. ADD VALUE IF NOT EXISTS é idempotente; o seed roda à parte.
-- Enum do Postgres não tem DROP VALUE: o nome nasce certo ou fica para sempre.
--
-- ## naming_ad_parts
--
-- Hooks e bodies POR EXPERT (h01 é o 1º hook do DG; o h01 do BBE é outro),
-- descrição obrigatória, código único por (expert, tipo) com inativos inclusos
-- (regra 4: código não se reaproveita). Mesmo desenho de naming_vsl_variables.
-- Esta migration NÃO muda naming_ads nem nome nenhum — isso é a 47.13.

ALTER TYPE naming_dictionary_type ADD VALUE IF NOT EXISTS 'creative_origin';

DO $$ BEGIN
  CREATE TYPE naming_ad_part_type AS ENUM ('hook', 'body');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS naming_ad_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES naming_experts(id) ON DELETE RESTRICT,
  type naming_ad_part_type NOT NULL,
  code varchar(20) NOT NULL,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_naming_ad_parts_expert_type_code ON naming_ad_parts (expert_id, type, code);
CREATE INDEX IF NOT EXISTS idx_naming_ad_parts_expert ON naming_ad_parts (expert_id);
