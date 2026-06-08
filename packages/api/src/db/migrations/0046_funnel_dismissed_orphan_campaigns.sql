-- Epic 25: botão "Ocultar" no banner de campanhas órfãs.
-- Persiste no funil os IDs de campanhas que o usuário dispensou — vale pra
-- todos os usuários do projeto. Campanhas novas que casem o matchCode ainda
-- aparecem (filtro é por ID específico).
ALTER TABLE funnels
  ADD COLUMN IF NOT EXISTS dismissed_orphan_campaigns jsonb NOT NULL DEFAULT '[]'::jsonb;
