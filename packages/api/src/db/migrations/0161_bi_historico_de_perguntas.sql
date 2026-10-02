-- Histórico das perguntas feitas à IA do BI.
--
-- Pedido do Lucas (02/10/2026): "seria legal ficar um histórico dos prompts
-- pedidos, hoje ele some". Some mesmo — a pergunta vivia só no estado da tela,
-- então quem montou um widget bom não conseguia lembrar o que tinha digitado, e
-- quem abria o dashboard depois não sabia o que já havia sido tentado.
--
-- No documento do dashboard, e não em tabela própria: a tela já carrega esse
-- documento inteiro para desenhar o canvas, então o histórico chega sem query
-- nova. São dezenas de perguntas por dashboard, com teto de 50 no código.
--
-- Idempotente e sem risco: coluna nova com default, nada é reescrito.

ALTER TABLE "bi_dashboards"
  ADD COLUMN IF NOT EXISTS "perguntas" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Rollback:
-- ALTER TABLE "bi_dashboards" DROP COLUMN IF EXISTS "perguntas";
