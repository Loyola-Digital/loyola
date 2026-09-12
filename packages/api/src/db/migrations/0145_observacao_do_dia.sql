-- Observação de texto livre por dia, na tabela diária do funil.
--
-- ## Por que aqui e não numa tabela nova
--
-- `funnel_batch_turns` JÁ é "uma anotação num dia deste funil": tem
-- (funnel_id, date) único, CRUD pronto e o clique direito da tabela. Uma
-- tabela nova duplicaria os três por um campo de texto.
--
-- As duas coisas convivem na mesma linha: `label` é a virada de lote (aparece
-- como marco na tabela) e `nota` é a observação. Uma linha pode ter só uma das
-- duas — `label` vazio significa "este dia tem observação, mas não é virada".
--
-- ## Quem apaga a linha
--
-- A rota, quando `label` E `nota` ficam vazios. Sem isso, remover a observação
-- deixaria uma linha fantasma que a tabela desenha como marco sem texto.

ALTER TABLE funnel_batch_turns
  ADD COLUMN IF NOT EXISTS nota text;

-- Antes o label era sempre uma virada de lote de verdade, então nunca era
-- vazio. Agora pode ser, e o CHECK garante que a linha tenha ao menos UMA das
-- duas informações — linha com os dois vazios não significa nada.
ALTER TABLE funnel_batch_turns
  DROP CONSTRAINT IF EXISTS funnel_batch_turns_tem_conteudo;
ALTER TABLE funnel_batch_turns
  ADD CONSTRAINT funnel_batch_turns_tem_conteudo
    CHECK (length(coalesce(label, '')) > 0 OR length(coalesce(nota, '')) > 0);

-- Teto de tamanho: observação é recado de um dia, não documento. `text` sem
-- limite já virou problema em outras tabelas — um paste acidental passa sem
-- reclamar e depois estoura a tabela na tela.
ALTER TABLE funnel_batch_turns
  DROP CONSTRAINT IF EXISTS funnel_batch_turns_nota_tamanho;
ALTER TABLE funnel_batch_turns
  ADD CONSTRAINT funnel_batch_turns_nota_tamanho
    CHECK (nota IS NULL OR length(nota) <= 2000);
