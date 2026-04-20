-- Epic 20: Funil Comparativo
-- Adiciona coluna compare_funnel_id na tabela funnels (auto-referencial)
ALTER TABLE funnels
  ADD COLUMN compare_funnel_id uuid REFERENCES funnels(id) ON DELETE SET NULL;
