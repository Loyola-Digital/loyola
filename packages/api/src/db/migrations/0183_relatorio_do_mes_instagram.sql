-- As três frases e o plano do mês, na mesma linha das metas.
--
-- É a parte do relatório que nenhum dado produz sozinho: onde estamos, o que
-- aprendemos e qual é a prioridade seguinte. Hoje isso é escrito à mão num
-- documento à parte a cada mês, e some.
--
-- O plano fica em JSONB (`[{ oQue, responsavel, prazo, status }]`) porque são
-- no máximo três itens, só são lidos juntos e nunca são consultados por campo.
ALTER TABLE instagram_monthly_goals
  ADD COLUMN IF NOT EXISTS resumo_onde_estamos text,
  ADD COLUMN IF NOT EXISTS resumo_aprendizado  text,
  ADD COLUMN IF NOT EXISTS resumo_prioridade   text,
  ADD COLUMN IF NOT EXISTS plano               jsonb;
