-- Switch links: descrição livre por lote ("do que se trata o link").
-- O gerador cria 1 lote (1 URL base → N canais) e o usuário descreve o
-- destino (ex: "Checkout produto X", "Página de captura"). Persistimos aqui
-- pra exibir no histórico; o mesmo valor também é gravado como `note` no
-- Switchy (alimenta a coluna "Nota" da aba de links da etapa do funil).
-- Idempotente (ADD COLUMN IF NOT EXISTS). Aditiva e nullable — não trava tabela.

ALTER TABLE "switchy_shortened_links"
  ADD COLUMN IF NOT EXISTS "note" varchar(500);
