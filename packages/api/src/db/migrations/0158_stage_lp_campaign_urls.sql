-- Story 18.83 (AC5) — correção manual da tabela "Desempenho de Testes de LPs",
-- por CAMPANHA.
--
-- A tabela do lançamento passou a identificar a página pela URL de destino do
-- anúncio (padrão do perpétuo, Story 29.40). O que o cache de criativos não
-- resolve cai em "Sem link resolvido", e o Danilo decidiu (7.9, 2026-09-23)
-- que a correção manual é por campanha: escolhe-se a campanha com gasto nessa
-- linha e informa-se a URL. Tudo o que dessa campanha estava sem link passa
-- para a linha da URL informada; anúncio com URL resolvida não muda.
--
-- Chave = campaign_id da Meta; valor = URL http(s). Por etapa, como o
-- `lp_links` da 18.56 — que deixa de ser editável na tela e NÃO é apagado.
--
-- ⚠️ ORDEM DE APLICAÇÃO: a API nova seleciona esta coluna em toda leitura de
-- `funnel_stages` (select de todas as colunas). Aplicar em produção ANTES do
-- merge e conferir no information_schema:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'funnel_stages' AND column_name = 'lp_campaign_urls';
--
-- Idempotente (IF NOT EXISTS) e aditiva: a API antiga ignora a coluna.

ALTER TABLE "funnel_stages"
  ADD COLUMN IF NOT EXISTS "lp_campaign_urls" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Rollback (só depois de reverter a API):
-- ALTER TABLE "funnel_stages" DROP COLUMN IF EXISTS "lp_campaign_urls";
