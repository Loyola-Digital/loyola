-- "Aparece nas listas": controle manual de quem entra nos seletores de pessoa
-- (atribuir PDI, escolher vendedor, etc).
--
-- Nem toda linha de `users` é gente do time — sobra conta de teste, de ambiente
-- local e a provisionada com `<clerkId>@placeholder.dev` quando o Clerk não
-- devolve o e-mail. Várias dessas não podem ser apagadas (viram donas de dados
-- reais: uma delas tem 1.749 entradas de log de campanha), mas também não
-- deveriam poluir um seletor. Daí a flag em vez de exclusão.
--
-- Default TRUE: ninguém some da lista por causa da migration.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "listed" boolean NOT NULL DEFAULT true;

-- As contas que hoje sujam os seletores já entram desmarcadas: e-mail
-- placeholder é sempre conta fantasma, e o ambiente local não é pessoa.
UPDATE "users"
SET "listed" = false
WHERE "email" LIKE '%@placeholder.dev'
   OR "email" LIKE '%+localdev@%';
