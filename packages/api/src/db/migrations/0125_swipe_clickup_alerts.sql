-- Aviso no ClickUp quando entra referência nova no Swipe Files.
--
-- Config ÚNICA (sem project_id): o Swipe Files é acervo do time, não escopado
-- por projeto — referência boa serve qualquer cliente. A linha única é
-- garantida por um índice parcial, e não por PK fixa, para o registro poder ser
-- recriado sem colidir.

CREATE TABLE IF NOT EXISTS swipe_clickup_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  -- Canal padrão: recebe tudo que não cair numa regra específica.
  channel_id          TEXT NOT NULL,
  channel_name        TEXT,
  -- Vídeo tem canal próprio no ClickUp (`referências-videos`). Opcional: sem
  -- ele, vídeo vai para o canal padrão como o resto.
  video_channel_id    TEXT,
  video_channel_name  TEXT,
  mention_users       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma configuração só. O índice parcial sobre uma constante é o jeito de dizer
-- "no máximo uma linha" sem inventar uma chave que não significa nada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_swipe_clickup_alerts_unica
  ON swipe_clickup_alerts ((TRUE));
