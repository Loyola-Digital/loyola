-- Migration: marcador de virada de lote por funil
-- Motivo: anotar manualmente datas onde houve subida de preço, fim de bônus ou outra
-- mudança de oferta durante um lançamento, pra exibir alertinha visual na tabela "Dados diários".

CREATE TABLE IF NOT EXISTS funnel_batch_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  label VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_batch_turns_funnel_date UNIQUE (funnel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_batch_turns_funnel
  ON funnel_batch_turns(funnel_id);
