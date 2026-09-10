-- Epic 47 / Story 47.9 (follow-up 4, pedido do dono em 2026-09-10) — link da VSL.
--
-- "Seria legal se a VSL salvasse o link da VSL também, que vem do Drive, pedir
-- durante a criação." Coluna opcional; o formulário pede na criação e a
-- listagem mostra como link.

ALTER TABLE naming_vsls ADD COLUMN IF NOT EXISTS url text;
