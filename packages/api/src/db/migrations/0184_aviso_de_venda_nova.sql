-- Aviso de venda nova: a marca d'água de qual venda já virou push.
--
-- A planilha não tem gatilho, então o ciclo relê a aba inteira a cada rodada e
-- é esta tabela que separa venda nova de venda já vista. A chave é a MESMA do
-- dedup do dashboard (txId|produto), com recuo para email|data|valor quando a
-- planilha não tem coluna de transação.
--
-- avisado_em nulo = conhecida mas nunca avisada: é como a etapa estreia (o
-- histórico entra marcado de uma vez, sem disparar nada) e como ficam as vendas
-- que passaram do teto do dia.
CREATE TABLE IF NOT EXISTS "sale_push_sent" (
  "stage_id" uuid NOT NULL REFERENCES "funnel_stages"("id") ON DELETE CASCADE,
  "chave" text NOT NULL,
  "avisado_em" timestamp with time zone,
  "visto_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sale_push_sent_pkey" PRIMARY KEY ("stage_id", "chave")
);

CREATE INDEX IF NOT EXISTS "idx_sale_push_sent_avisado" ON "sale_push_sent" ("avisado_em");
