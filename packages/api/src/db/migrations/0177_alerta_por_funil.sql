-- O alerta passa a julgar cada FUNIL, não a média do projeto.
--
-- Um projeto como "DG & CPDF" tem sete funis dentro, e a média empacotava o que
-- o alerta existe para achar: em 17/10/2026, `dg-pg05` a 1,13× e `dg-bf26` com
-- R$ 269 investidos e nenhuma venda viraram um "ROAS em 0,67" que não aponta
-- para lugar nenhum.
--
-- A regra continua cadastrada por projeto (ou para todos); o que muda é o grão
-- do "já avisei hoje". Sem a coluna nova, o primeiro funil a estourar calaria
-- todos os outros do mesmo projeto até o dia seguinte.
--
-- `text` e não `uuid`: a string vazia é o item "sem funil" — o gasto que nenhuma
-- etapa reivindica, que também é julgado — e chave primária não aceita nulo.
ALTER TABLE alert_rule_state
  ADD COLUMN IF NOT EXISTS funnel_id text NOT NULL DEFAULT '';

-- As linhas que já existem ficam com '' e representam o último aviso do projeto
-- inteiro. O efeito prático é apenas que o aviso por funil do dia de hoje não
-- herda esse silêncio — o que é o certo: é outra pergunta.
ALTER TABLE alert_rule_state DROP CONSTRAINT IF EXISTS alert_rule_state_pkey;
ALTER TABLE alert_rule_state
  ADD CONSTRAINT alert_rule_state_pkey PRIMARY KEY (rule_id, project_id, funnel_id);
