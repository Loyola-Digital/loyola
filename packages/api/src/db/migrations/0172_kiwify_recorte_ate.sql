-- A etapa fecha a janela: "até quando" contar vendas da Kiwify.
--
-- ## Por que a oferta não basta
--
-- O recorte da etapa já tem produto + oferta, e a oferta separa bem: medido na
-- conta DG & CPDF em 13/10/2026, nenhum `offer_id` real aparece em mais de um
-- produto — "Lote 1", "Lote 2", "Lote Promocional" são de um lançamento só.
--
-- Mas 8 produtos vendem SEM oferta nenhuma, e são justamente os reaproveitados
-- em mais de um funil:
--
--   Churrasco com Netão            216 vendas em  92 dias
--   Supervisão Online | Team D.r   138 vendas em 381 dias
--   A Trilha                        93 vendas em 373 dias
--
-- Nesses, `offer_id` é NULL e não discrimina nada. Com só "a partir de", a
-- janela fica aberta até hoje e a etapa de um lançamento encerrado continua
-- recebendo a venda que o perpétuo fez depois — faturamento de um funil
-- entrando no número do outro, em silêncio.
--
-- Nulo = aberta (tudo que a sincronização tem para frente), como era antes.

ALTER TABLE "kiwify_stage_configs"
  ADD COLUMN IF NOT EXISTS "end_date" varchar(10);

-- Rollback:
-- ALTER TABLE "kiwify_stage_configs" DROP COLUMN IF EXISTS "end_date";
