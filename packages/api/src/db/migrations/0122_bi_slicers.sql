-- Epic 45.6 — os slicers do dashboard.
--
-- A seleção do slicer é estado DO DASHBOARD, não da tela: quem abre o link
-- precisa ver o mesmo recorte que quem salvou.

ALTER TABLE bi_dashboards
  ADD COLUMN IF NOT EXISTS slicers JSONB NOT NULL DEFAULT '[]'::jsonb;
