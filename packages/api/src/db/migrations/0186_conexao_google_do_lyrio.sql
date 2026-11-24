-- A conexão Google Ads do Lyrio, legível pelo painel do Lyrio.
--
-- ## Por que existe
--
-- O painel do Lyrio é outro app, com banco próprio, e recebia o refresh token do
-- Google Ads por variável de ambiente. Quando esse token é revogado — e ele é,
-- em 7 dias, se o cliente OAuth estiver em modo "Testing" no Google Cloud — o
-- card de Investimento passa a dizer "Google não respondeu, o total está
-- incompleto" até alguém reconectar NO LOYOLA X e copiar o token na mão para o
-- Coolify do Lyrio. Aconteceu em 24/11/2026.
--
-- Com esta view, o Lyrio lê a conexão que o Loyola X mantém: reconectar no X
-- passa a bastar, e o token deixa de viver duplicado em dois lugares.
--
-- ## Por que uma VIEW, e não GRANT na tabela
--
-- `google_ads_accounts` guarda o refresh token de TODAS as contas Google do X
-- (hoje a do Lyrio e a do Netão). O papel do espelho não tem por que ver a conta
-- de outro projeto: a view expõe uma linha só, a do customer do Lyrio.
--
-- Trocar a conta de anúncios do Lyrio exige editar o customer_id aqui — de
-- propósito: é uma decisão, não configuração de ambiente.
--
-- A view NÃO expõe nada em claro: o refresh token sai cifrado, e só quem tem a
-- `ENCRYPTION_KEY` do Loyola X decifra (o Lyrio a recebe como
-- `LOYOLA_ENCRYPTION_KEY`).

CREATE OR REPLACE VIEW "google_ads_conexao_lyrio" AS
  SELECT
    customer_id,
    refresh_token_encrypted,
    refresh_token_iv,
    developer_token_encrypted,
    developer_token_iv,
    created_at
  FROM "google_ads_accounts"
  WHERE customer_id = '4386529178';

-- `lyrio_espelho` é o papel só-leitura que o painel do Lyrio já usa para ler
-- este banco (ver lib/espelho.ts lá).
GRANT SELECT ON "google_ads_conexao_lyrio" TO "lyrio_espelho";
