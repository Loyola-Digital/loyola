-- Story 42.4 — percentuais da Margem de Contribuição, por etapa Lyrio.
--
-- A margem do app desconta, sobre o faturamento BRUTO: comissão da loja
-- (Apple/Google), imposto sobre a receita e outros custos. Os três variam por
-- app e por contrato — a comissão da loja, por exemplo, é 30% no primeiro ano
-- de assinatura e 15% depois, e muda com o Small Business Program.
--
-- Ficam configuráveis por etapa (decisão do gestor, 2026-08-12) em vez de
-- constantes no código: mudança de alíquota vira edição no painel, não deploy.
--
-- Defaults 15/5/1 são os valores do memorial que o gestor especificou, e valem
-- para as linhas que já existem — etapas configuradas antes desta migration
-- passam a calcular a margem sem intervenção manual.
--
-- numeric(5,2) comporta 0,00 a 999,99; a validação de faixa (0-100) e da soma
-- (<= 100) vive na API e no formulário, onde dá pra devolver mensagem útil.

ALTER TABLE revenuecat_stage_config
  ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS tax_pct          NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS other_costs_pct  NUMERIC(5,2) NOT NULL DEFAULT 1.00;
