-- Recorte da Kiwify que cada etapa deve conferir.
--
-- A conexão (credenciais) é do PROJETO; por etapa muda só o recorte: quais
-- produtos entram na conta e a partir de que dia. Sem isso a comparação não
-- teria sentido — a conta da Kiwify tem todos os produtos do expert, e a
-- planilha da etapa tem só o lançamento dela.
CREATE TABLE IF NOT EXISTS kiwify_stage_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL UNIQUE REFERENCES funnel_stages(id) ON DELETE CASCADE,
  product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- aaaa-mm-dd: a data é do time, não derivada do funil. Quem opera sabe
  -- quando a contagem daquele lançamento começa a valer.
  start_date VARCHAR(10) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiwify_stage_configs_stage
  ON kiwify_stage_configs(stage_id);
