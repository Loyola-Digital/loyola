-- O Planner passa a escrever de volta na agenda do Google.
--
-- Até aqui a integração era de mão única: o Google mandava, o Planner lia. Para
-- escrever é preciso saber EM QUAL agenda — são seis conectadas, e um evento
-- criado na errada é pior que evento nenhum: aparece para o time errado.
--
-- Fica na campanha e não na fase porque a agenda é uma propriedade do que está
-- sendo planejado ("FZ — BLACK" é da agenda da FZ), não de cada etapa. Uma
-- campanha cujas fases fossem para agendas diferentes seria duas campanhas.
ALTER TABLE planner_campaigns ADD COLUMN IF NOT EXISTS google_calendar_id text;

-- Sem backfill em SQL de propósito.
--
-- A fase guarda `googleEventId`, mas não de qual agenda ele veio — a informação
-- simplesmente não está no banco. Descobrir exige perguntar ao Google de quem é
-- cada id, e é o que faz `backfill-planner-agenda.ts`. Um UPDATE que escolhesse
-- uma agenda por desempate arbitrário mandaria eventos para o time errado, que
-- é justamente o erro que esta coluna existe para impedir.
