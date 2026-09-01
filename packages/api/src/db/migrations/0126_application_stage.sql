-- Etapa de Aplicação: quais planilhas de venda do funil contam como "vendeu".
--
-- A etapa nasce de um funil onde a página tem formulário de aplicação: o
-- tráfego traz a pessoa, ela se aplica, e a venda acontece depois — registrada
-- numa planilha que JÁ está conectada em outra etapa do mesmo funil.
--
-- Por que a escolha é explícita, e não "todas as planilhas do funil": no
-- dg-pg04 há três planilhas de venda na mesma etapa (produto principal, TMB e
-- captação). Somar as três contaria vendas de naturezas diferentes como se
-- fossem a mesma, e o número ficaria errado sem ninguém perceber.
CREATE TABLE IF NOT EXISTS application_stage_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL UNIQUE REFERENCES funnel_stages(id) ON DELETE CASCADE,
  -- Ids de `stage_sales_spreadsheets`, de QUALQUER etapa do mesmo funil.
  -- Vazio = nenhuma escolhida ainda: a etapa mostra aplicações e tráfego, e
  -- diz que falta escolher a fonte de venda, em vez de exibir zero vendas.
  sales_spreadsheet_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_stage_configs_stage_idx
  ON application_stage_configs (stage_id);
