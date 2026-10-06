-- A venda manual passa a caber CNPJ.
--
-- `customer_cpf` nasceu `varchar(11)` (0065), de quando só havia CPF. A Story
-- 19.15 passou a aceitar CNPJ — a validação (`isValidCpfOrCnpj`) e o corpo da
-- rota (`max(14)`) — mas ninguém alargou a coluna.
--
-- Resultado: toda venda de pessoa jurídica morria com 500 e
-- `value too long for type character varying(11)`. Como o erro vinha do banco,
-- quem preenchia o formulário não recebia explicação nenhuma — só "Internal
-- Server Error". Reproduzido em 06/10/2026 com um CNPJ de 14 dígitos na etapa
-- Evento do BBE-PR2.
--
-- Sem risco: alargar varchar não reescreve a tabela nem toca nas 16 linhas
-- existentes (todas com 11 dígitos).

ALTER TABLE "manual_sales" ALTER COLUMN "customer_cpf" TYPE varchar(14);

-- Rollback (só funciona enquanto não houver CNPJ gravado):
-- ALTER TABLE "manual_sales" ALTER COLUMN "customer_cpf" TYPE varchar(11);
