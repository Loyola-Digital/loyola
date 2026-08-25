-- Mapa do funil: blocos, conectores e abas desenhados pelo time.
--
-- Pertence a uma ETAPA do tipo `mapa` — assim ele aparece na lista de etapas
-- como qualquer outra, com nome próprio, e um funil pode ter mais de um desenho
-- sem que um sobrescreva o outro.
--
-- O desenho fica em JSONB porque é um documento: lido e salvo inteiro, por uma
-- etapa só, sem consulta relacional em cima. Normalizar traria junção e
-- migração a cada campo novo do canvas, sem ganho nenhum.
DROP TABLE IF EXISTS funnel_maps;

CREATE TABLE funnel_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL UNIQUE REFERENCES funnel_stages(id) ON DELETE CASCADE,
  -- [{ id, name, boxes: [...], connectors: [...] }]
  tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
