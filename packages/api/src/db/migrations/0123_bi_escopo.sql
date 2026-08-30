-- Epic 45.10 — o escopo do dashboard.
--
-- `projeto` (padrão) = só o projeto onde o dashboard mora.
-- `todos` = todos os projetos que QUEM ESTÁ OLHANDO enxerga — a lista sai da
-- sessão, nunca do documento, senão o dashboard viraria uma forma de ver projeto
-- alheio.

ALTER TABLE bi_dashboards
  ADD COLUMN IF NOT EXISTS escopo VARCHAR(20) NOT NULL DEFAULT 'projeto';
