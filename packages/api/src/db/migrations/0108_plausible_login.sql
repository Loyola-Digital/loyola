-- Login opcional da instância Plausible — só para LISTAR os sites.
--
-- A Sites API documentada (/api/v1/sites) não existe no Community Edition: a
-- rota devolve 404 HTML, não 401, porque o Plausible a restringiu à Enterprise.
-- O endpoint que o próprio painel usa (/api/sites) existe, mas só aceita sessão
-- de login — testamos a chave como Bearer, Token, X-API-KEY, query param e
-- cookie, e todas dão 401.
--
-- Daí estas colunas: com elas, o seletor de site do projeto lista os domínios
-- existentes em vez de exigir que alguém digite o domínio à mão. São OPCIONAIS
-- e não participam de nenhuma leitura de métrica — as estatísticas continuam
-- saindo da API key.
ALTER TABLE plausible_config
  ADD COLUMN IF NOT EXISTS login_email TEXT,
  ADD COLUMN IF NOT EXISTS login_password_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS login_password_iv TEXT;
