-- O que cada chave de API gravou no Planner.
--
-- A escrita pela API pública não tem usuário: quem grava é uma chave (a da
-- Ágatha, por exemplo, usada pelo Claude dela). Sem este registro, uma célula
-- trocada pela IA seria indistinguível de uma editada na tela — e a primeira
-- pergunta depois de um erro é "quem mudou isso?".
--
-- `detalhe` guarda o diff (antes → depois) da operação: é o que permite
-- desfazer à mão o que uma chamada errada fez.

CREATE TABLE IF NOT EXISTS planner_api_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  acao varchar(60) NOT NULL,
  project_id uuid,
  detalhe jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_api_audit_criado ON planner_api_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planner_api_audit_chave ON planner_api_audit (api_key_id);
