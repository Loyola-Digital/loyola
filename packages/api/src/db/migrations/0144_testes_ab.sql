-- Testes A/B de página: variações, visitas e conversões por URL.
--
-- ## Uma tabela, variações em JSONB
--
-- Uma variação não existe sem o teste, nunca é consultada sozinha e nunca passa
-- de meia dúzia. Tabela filha daria join em toda leitura para ordenar duas
-- linhas — o mesmo motivo pelo qual `funnel_stages.phases` já é JSONB aqui.
--
-- ## O que NÃO fica aqui
--
-- Visitas e conversões. Elas vêm do Plausible na hora da leitura, por URL e
-- período. Guardar contador seria um segundo lugar onde o número mora, e os
-- dois divergiriam no primeiro reprocessamento do analytics.

CREATE TABLE IF NOT EXISTS ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nome text NOT NULL,

  -- rascunho → ativo → encerrado. Encerrado congela a janela de leitura no
  -- `encerrado_em`: sem isso o "vencedor" de um teste antigo continuaria
  -- mudando conforme a página segue recebendo visita.
  status varchar(12) NOT NULL DEFAULT 'rascunho',

  -- O goal do Plausible que conta como conversão. NULL = qualquer evento de
  -- conversão configurado no site.
  meta_conversao text,

  /*
   * [{ id, nome, url }]
   *
   * `url` é o que casa com `event:page` no Plausible — caminho, não domínio.
   * Sem `trafficSplit`: a distribuição de tráfego é outro assunto (e outro
   * serviço). Aqui só se MEDE o que já está distribuído.
   */
  variacoes jsonb NOT NULL DEFAULT '[]'::jsonb,

  iniciado_em timestamptz,
  encerrado_em timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A listagem é sempre "os testes deste projeto, mais recentes primeiro".
CREATE INDEX IF NOT EXISTS idx_ab_tests_projeto ON ab_tests (project_id, created_at DESC);

ALTER TABLE ab_tests DROP CONSTRAINT IF EXISTS ab_tests_status_valido;
ALTER TABLE ab_tests
  ADD CONSTRAINT ab_tests_status_valido
    CHECK (status IN ('rascunho', 'ativo', 'encerrado'));

-- Variações precisam ser lista. Um objeto solto aqui quebraria a leitura em
-- runtime, longe de onde o dado entrou.
ALTER TABLE ab_tests DROP CONSTRAINT IF EXISTS ab_tests_variacoes_lista;
ALTER TABLE ab_tests
  ADD CONSTRAINT ab_tests_variacoes_lista
    CHECK (jsonb_typeof(variacoes) = 'array');
