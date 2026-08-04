-- Planilha de APLICAÇÃO na Captação Paga.
--
-- Todo lançamento pago tem um comercial depois: quem se candidata preenche um
-- formulário de aplicação. O time quer ver o volume dia a dia e comparar com o
-- lançamento anterior — por isso a planilha entra como tipo próprio em vez de
-- virar mais uma "custom" (que não teria como ser encontrada pelo gráfico).
--
-- Aditivo. `ADD VALUE IF NOT EXISTS` é idempotente e não reescreve a tabela.
ALTER TYPE "funnel_spreadsheet_type" ADD VALUE IF NOT EXISTS 'applications';
