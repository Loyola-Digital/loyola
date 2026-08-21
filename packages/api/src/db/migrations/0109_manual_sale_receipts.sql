-- Comprovante (print ou PDF) da venda manual, para conferir dentro do app.
--
-- Tabela à parte, e não coluna em manual_sales: aquela tabela é lida com
-- SELECT inteiro em várias telas, e carregar o binário junto seria pago por
-- todas elas — inclusive as que nem mostram comprovante.
--
-- O arquivo mora no Postgres porque não há storage de objetos neste ambiente e
-- o volume não pede um (dezenas de vendas manuais). Virando milhares, o caminho
-- é mover o conteúdo para um bucket e deixar esta linha como ponteiro.
CREATE TABLE IF NOT EXISTS manual_sale_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_sale_id UUID NOT NULL REFERENCES manual_sales(id) ON DELETE CASCADE,
  mime_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255),
  byte_size INTEGER NOT NULL,
  conteudo BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um comprovante por venda: reenviar substitui, em vez de acumular versões que
-- ninguém saberia qual é a boa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_sale_receipt
  ON manual_sale_receipts(manual_sale_id);
