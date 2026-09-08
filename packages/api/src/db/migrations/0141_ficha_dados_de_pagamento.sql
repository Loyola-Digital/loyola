-- Dados de pagamento na ficha: CPF, CNPJ, chave PIX e endereço.
--
-- Quem presta serviço precisa ser pago, e hoje esses números vivem em conversa
-- de WhatsApp e planilha solta. Na ficha, cada pessoa preenche os próprios —
-- quem sabe o CNPJ certo é o dono dele, não o RH transcrevendo de um print.
--
-- ## Guardamos só os dígitos
--
-- "123.456.789-09" e "12345678909" são o mesmo CPF. Aceitar os dois deixaria
-- ambos conviverem na tabela e qualquer comparação futura falharia calada. A
-- máscara é assunto da tela; o CHECK abaixo garante o resto.
--
-- ## Quem vê
--
-- A própria pessoa e admin. O diretório do time (`/api/pessoal/time`) tem
-- query própria com colunas nomeadas — estes campos não entram lá, e é por
-- isso que o recorte é no servidor e não na tela.

ALTER TABLE people_records
  ADD COLUMN IF NOT EXISTS cpf varchar(11),
  ADD COLUMN IF NOT EXISTS cnpj varchar(14),
  -- 77 é o teto do Banco Central para chave PIX (e-mail é o formato mais
  -- longo); 140 dá folga sem virar campo de texto livre.
  ADD COLUMN IF NOT EXISTS chave_pix varchar(140),
  ADD COLUMN IF NOT EXISTS endereco text;

-- Só dígitos, ou nada. Sem isto, a primeira tela que esquecer de normalizar
-- grava "123.456.789-09" e o CHECK deixa de valer para todo mundo.
ALTER TABLE people_records
  DROP CONSTRAINT IF EXISTS people_records_cpf_digitos;
ALTER TABLE people_records
  ADD CONSTRAINT people_records_cpf_digitos
    CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

ALTER TABLE people_records
  DROP CONSTRAINT IF EXISTS people_records_cnpj_digitos;
ALTER TABLE people_records
  ADD CONSTRAINT people_records_cnpj_digitos
    CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

-- Endereço tem teto porque `text` sem limite já virou problema em outras
-- tabelas: um paste acidental de documento inteiro passa sem reclamar.
ALTER TABLE people_records
  DROP CONSTRAINT IF EXISTS people_records_endereco_tamanho;
ALTER TABLE people_records
  ADD CONSTRAINT people_records_endereco_tamanho
    CHECK (endereco IS NULL OR length(endereco) <= 500);
