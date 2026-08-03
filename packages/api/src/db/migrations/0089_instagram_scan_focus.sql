-- Spy de Conteúdo: o que a pessoa quer saber daquele perfil.
--
-- O scan padrão devolve o diagnóstico completo (nicho, pilares, estratégia,
-- insights). Quando alguém tem uma pergunta específica ("como ele estrutura os
-- ganchos?", "o que ele vende e como?"), esse texto entra no prompt e a análise
-- responde aquilo em primeiro plano — sem deixar de entregar o resto.
--
-- NULL = análise padrão. Aditivo e idempotente.
ALTER TABLE "instagram_scans" ADD COLUMN IF NOT EXISTS "focus" text;
