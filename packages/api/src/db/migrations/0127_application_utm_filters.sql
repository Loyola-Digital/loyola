-- Filtro de UTM da Etapa de Aplicação.
--
-- A planilha de venda é do FUNIL inteiro: a etapa via 18 vendas quando só
-- algumas nasceram do formulário dela. O que distingue umas das outras é a
-- UTM, e só quem montou a campanha sabe qual delas carrega essa marca — por
-- isso é configuração, não heurística.
--
-- Lista vazia (o padrão) = sem filtro, tudo entra. É o comportamento de hoje,
-- então nada muda para quem já configurou a etapa.
ALTER TABLE application_stage_configs
  ADD COLUMN IF NOT EXISTS utm_filters jsonb NOT NULL DEFAULT '[]'::jsonb;
