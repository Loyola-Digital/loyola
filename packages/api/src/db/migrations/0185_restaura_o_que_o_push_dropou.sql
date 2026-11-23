-- Restaura as 41 garantias que o `drizzle-kit push --force` apagou em
-- 23/11/2026, no primeiro deploy em que ele voltou a aplicar schema.
--
-- ## O que aconteceu
--
-- O push do boot vivia travado num diálogo interativo e não aplicava nada (ver
-- #1080→#1083). Destravado, ele comparou o schema.ts com o banco e removeu tudo
-- o que o banco tinha e o schema não declarava: 26 CHECKs, 2 UNIQUEs e 13
-- índices, todos criados por migrations SQL ao longo do ano. Nenhuma coluna,
-- tabela ou linha foi afetada — PKs e FKs seguem de pé.
--
-- Cada definição aqui é a ORIGINAL, copiada da migration que a criou; a
-- migration de origem está no comentário. Onde uma migration posterior mudou a
-- expressão, vale a última (subtype com 'tmb' do 0045; os canais com 'manychat'
-- do 0156, conferidos contra as colunas e os valores em uso no banco).
--
-- Idempotente: só cria o que não existe.
--
-- Isto é metade do conserto. A outra é declarar essas garantias no schema.ts
-- (`check()` e índices parciais), senão o próximo deploy apaga de novo.

-- ============================================================
-- CHECKs
-- ============================================================

DO $$
BEGIN
  -- 0045_stage_sales_tmb_subtype.sql (a versão com 'tmb', que substituiu a 0030)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_sales_spreadsheets_subtype_check') THEN
    ALTER TABLE "stage_sales_spreadsheets" ADD CONSTRAINT "stage_sales_spreadsheets_subtype_check"
      CHECK (subtype IN ('capture', 'main_product', 'sales', 'tmb'));
  END IF;

  -- 0145_observacao_do_dia.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnel_batch_turns_nota_tamanho') THEN
    ALTER TABLE "funnel_batch_turns" ADD CONSTRAINT "funnel_batch_turns_nota_tamanho"
      CHECK (nota IS NULL OR length(nota) <= 2000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnel_batch_turns_tem_conteudo') THEN
    ALTER TABLE "funnel_batch_turns" ADD CONSTRAINT "funnel_batch_turns_tem_conteudo"
      CHECK (length(coalesce(label, '')) > 0 OR length(coalesce(nota, '')) > 0);
  END IF;

  -- 0044_manual_sales_product_invoice.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_sales_invoice_status_check') THEN
    ALTER TABLE "manual_sales" ADD CONSTRAINT "manual_sales_invoice_status_check"
      CHECK ("invoice_status" IS NULL OR "invoice_status" IN ('emitida', 'pendente'));
  END IF;

  -- 0119_pessoal.sql — período invertido é erro de digitação, não dado
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_people_absences_periodo') THEN
    ALTER TABLE "people_absences" ADD CONSTRAINT "ck_people_absences_periodo"
      CHECK ("fim" >= "inicio");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_people_records_foto') THEN
    ALTER TABLE "people_records" ADD CONSTRAINT "ck_people_records_foto"
      CHECK ("foto" IS NULL OR length("foto") <= 800000);
  END IF;

  -- 0133_planner_anual.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planner_annual_cells_mes_check') THEN
    ALTER TABLE "planner_annual_cells" ADD CONSTRAINT "planner_annual_cells_mes_check"
      CHECK (mes BETWEEN 1 AND 12);
  END IF;

  -- 0141_ficha_dados_de_pagamento.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_records_cpf_digitos') THEN
    ALTER TABLE "people_records" ADD CONSTRAINT "people_records_cpf_digitos"
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_records_cnpj_digitos') THEN
    ALTER TABLE "people_records" ADD CONSTRAINT "people_records_cnpj_digitos"
      CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_records_endereco_tamanho') THEN
    ALTER TABLE "people_records" ADD CONSTRAINT "people_records_endereco_tamanho"
      CHECK (endereco IS NULL OR length(endereco) <= 500);
  END IF;

  -- 0144_testes_ab.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_tests_status_valido') THEN
    ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_status_valido"
      CHECK (status IN ('rascunho', 'ativo', 'encerrado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_tests_variacoes_lista') THEN
    ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_variacoes_lista"
      CHECK (jsonb_typeof(variacoes) = 'array');
  END IF;

  -- 0175_notification_prefs.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_prefs_hora_check') THEN
    ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_hora_check"
      CHECK (hora_do_resumo BETWEEN 0 AND 23);
  END IF;

  -- 0174_alertas_de_funil.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_rules_metrica_check') THEN
    ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_metrica_check"
      CHECK (metrica IN ('connect_rate', 'roas', 'investiu_sem_vender'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_rules_comparador_check') THEN
    ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_comparador_check"
      CHECK (comparador IN ('menor', 'maior'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_rules_janela_check') THEN
    ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_janela_check"
      CHECK (janela_dias BETWEEN 1 AND 30);
  END IF;

  -- 0034_meta_entity_names_cache.sql
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_meta_entity_type') THEN
    ALTER TABLE "meta_entity_names_cache" ADD CONSTRAINT "chk_meta_entity_type"
      CHECK (entity_type IN ('ad', 'adset', 'campaign'));
  END IF;
END $$;

-- 0152_plan_simulators.sql — frações em [0,1]; moeda >= 0; ticket > 0.
-- As colunas de telegram viraram manychat no 0156, e o Postgres reescreveu a
-- expressão junto com o RENAME: aqui já vai com os nomes de hoje.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_simulators_fracoes') THEN
    ALTER TABLE "plan_simulators" ADD CONSTRAINT "ck_plan_simulators_fracoes" CHECK (
      (pct_reembolso IS NULL OR pct_reembolso BETWEEN 0 AND 1) AND
      (pct_marketplace IS NULL OR pct_marketplace BETWEEN 0 AND 1) AND
      (pct_imposto IS NULL OR pct_imposto BETWEEN 0 AND 1) AND
      (pct_custo_produto IS NULL OR pct_custo_produto BETWEEN 0 AND 1) AND
      (pct_comissoes IS NULL OR pct_comissoes BETWEEN 0 AND 1) AND
      (pct_outros_custos IS NULL OR pct_outros_custos BETWEEN 0 AND 1) AND
      (pct_margem_pagos IS NULL OR pct_margem_pagos BETWEEN 0 AND 1) AND
      (mc_alvo_pagos IS NULL OR (mc_alvo_pagos > 0 AND mc_alvo_pagos <= 1)) AND
      (pct_invest_meta IS NULL OR pct_invest_meta BETWEEN 0 AND 1) AND
      (pct_meta_quente IS NULL OR pct_meta_quente BETWEEN 0 AND 1) AND
      (pct_google_quente IS NULL OR pct_google_quente BETWEEN 0 AND 1) AND
      (pct_org_whatsapp IS NULL OR pct_org_whatsapp BETWEEN 0 AND 1) AND
      (pct_org_email IS NULL OR pct_org_email BETWEEN 0 AND 1) AND
      (pct_org_instagram IS NULL OR pct_org_instagram BETWEEN 0 AND 1) AND
      (pct_org_manychat IS NULL OR pct_org_manychat BETWEEN 0 AND 1) AND
      (pct_org_youtube IS NULL OR pct_org_youtube BETWEEN 0 AND 1) AND
      (pct_org_area_membros IS NULL OR pct_org_area_membros BETWEEN 0 AND 1)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_simulators_valores') THEN
    ALTER TABLE "plan_simulators" ADD CONSTRAINT "ck_plan_simulators_valores" CHECK (
      (meta_margem_total IS NULL OR meta_margem_total >= 0) AND
      (ticket_medio IS NULL OR ticket_medio > 0) AND
      (investimento_anuncios IS NULL OR investimento_anuncios >= 0) AND
      (base_whatsapp IS NULL OR base_whatsapp >= 0) AND
      (base_email IS NULL OR base_email >= 0) AND
      (base_instagram IS NULL OR base_instagram >= 0) AND
      (base_manychat IS NULL OR base_manychat >= 0) AND
      (base_youtube IS NULL OR base_youtube >= 0) AND
      (base_area_membros IS NULL OR base_area_membros >= 0)
    );
  END IF;
END $$;

-- 0153_plan_organic.sql + 0156_plan_manychat.sql (canais com 'manychat')
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_blocks_canal') THEN
    ALTER TABLE "plan_organic_blocks" ADD CONSTRAINT "ck_plan_organic_blocks_canal" CHECK (
      canal IN ('whatsapp', 'email', 'instagram', 'manychat', 'youtube', 'area_membros')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_blocks_valores') THEN
    ALTER TABLE "plan_organic_blocks" ADD CONSTRAINT "ck_plan_organic_blocks_valores" CHECK (
      (conversao_media IS NULL OR conversao_media BETWEEN 0 AND 1) AND
      (variacao_conversao IS NULL OR variacao_conversao BETWEEN 0 AND 1) AND
      (variacao_receita IS NULL OR variacao_receita BETWEEN 0 AND 1) AND
      (taxa_captacao IS NULL OR taxa_captacao BETWEEN 0 AND 1) AND
      (faixa_variacao IS NULL OR faixa_variacao BETWEEN 0 AND 1) AND
      (fracao_cenario_1 IS NULL OR fracao_cenario_1 BETWEEN 0 AND 1) AND
      (nivel_assumido IS NULL OR nivel_assumido BETWEEN 1 AND 8)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_organic_combinations_valores') THEN
    ALTER TABLE "plan_organic_combinations" ADD CONSTRAINT "ck_plan_organic_combinations_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (sel_whatsapp IS NULL OR sel_whatsapp BETWEEN 1 AND 10) AND
      (sel_email IS NULL OR sel_email BETWEEN 1 AND 10) AND
      (sel_instagram IS NULL OR sel_instagram BETWEEN 1 AND 10) AND
      (sel_manychat IS NULL OR sel_manychat BETWEEN 1 AND 10) AND
      (sel_youtube IS NULL OR sel_youtube BETWEEN 1 AND 10) AND
      (sel_area_membros IS NULL OR sel_area_membros BETWEEN 1 AND 10)
    );
  END IF;
END $$;

-- 0154_plan_paid.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_blocks_fonte') THEN
    ALTER TABLE "plan_paid_blocks" ADD CONSTRAINT "ck_plan_paid_blocks_fonte" CHECK (
      fonte IN ('meta_quente', 'meta_frio', 'google_quente', 'google_frio')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_blocks_valores') THEN
    ALTER TABLE "plan_paid_blocks" ADD CONSTRAINT "ck_plan_paid_blocks_valores" CHECK (
      (pct_captacao IS NULL OR pct_captacao BETWEEN 0 AND 1) AND
      (conversao_media IS NULL OR conversao_media BETWEEN 0 AND 1) AND
      (variacao_conversao IS NULL OR variacao_conversao BETWEEN 0 AND 1) AND
      (variacao_receita IS NULL OR variacao_receita BETWEEN 0 AND 1) AND
      (cpl_medio_historico IS NULL OR cpl_medio_historico >= 0) AND
      (faixa_variacao IS NULL OR faixa_variacao BETWEEN 0 AND 1) AND
      (fracao_cenario_1 IS NULL OR fracao_cenario_1 BETWEEN 0 AND 1) AND
      (nivel_assumido IS NULL OR nivel_assumido BETWEEN 1 AND 10)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_paid_combinations_valores') THEN
    ALTER TABLE "plan_paid_combinations" ADD CONSTRAINT "ck_plan_paid_combinations_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (sel_meta_quente IS NULL OR sel_meta_quente BETWEEN 1 AND 10) AND
      (sel_meta_frio IS NULL OR sel_meta_frio BETWEEN 1 AND 10) AND
      (sel_google_quente IS NULL OR sel_google_quente BETWEEN 1 AND 10) AND
      (sel_google_frio IS NULL OR sel_google_frio BETWEEN 1 AND 10)
    );
  END IF;
END $$;

-- 0155_plan_final_scenarios.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_final_scenarios_valores') THEN
    ALTER TABLE "plan_final_scenarios" ADD CONSTRAINT "ck_plan_final_scenarios_valores" CHECK (
      (indice BETWEEN 1 AND 5) AND
      (rotulo IS NULL OR rotulo IN ('META PISO', 'META BOA', 'META SUPER'))
    );
  END IF;
END $$;

-- ============================================================
-- UNIQUEs
-- ============================================================

-- `sprint_dashboard_config_singleton_uniq` NÃO entra aqui: o push a dropou como
-- constraint e recriou como ÍNDICE único do mesmo nome, porque é assim que o
-- schema.ts a declara (`uniqueIndex`). A garantia "uma linha só" está de pé, e
-- criar a constraint por cima falharia — o nome já está tomado pelo índice.
-- Por isso também fica fora `idx_sprint_dashboard_config_singleton`: era um
-- índice comum sobre a mesma coluna, e o único já atende as consultas.
DO $$
BEGIN
  -- 0116_sendflow.sql — uma conexão por projeto. O 0117 tornou project_id
  -- nulável para a conexão GLOBAL, e vários NULL convivem num UNIQUE; quem
  -- garante "no máximo uma global" é o índice uq_sendflow_global, abaixo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sendflow_connections_project_id_key') THEN
    ALTER TABLE "sendflow_connections" ADD CONSTRAINT "sendflow_connections_project_id_key"
      UNIQUE ("project_id");
  END IF;
END $$;

-- ============================================================
-- ÍNDICES (os parciais são regra de negócio, não só velocidade)
-- ============================================================

-- 0045: 'tmb', 'capture' e 'main_product' são 1-por-etapa; 'sales' é N.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_sales_spreadsheets_single_slot
  ON stage_sales_spreadsheets (stage_id, subtype)
  WHERE subtype IN ('capture', 'main_product', 'tmb');

-- 0117: no máximo UMA conexão global do SendFlow.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sendflow_global"
  ON "sendflow_connections" ((1)) WHERE "project_id" IS NULL;

-- 0147: dois mapas com o mesmo token de compartilhamento seriam vazamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_maps_share_token
  ON funnel_maps (share_token)
  WHERE share_token IS NOT NULL;

-- 0125: uma configuração só de alerta do ClickUp.
CREATE UNIQUE INDEX IF NOT EXISTS uq_swipe_clickup_alerts_unica
  ON swipe_clickup_alerts ((TRUE));

-- 0131: só o que veio de importação precisa de chave única.
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipe_files_import_key
  ON swipe_files (import_key)
  WHERE import_key IS NOT NULL;

-- 0043: o GET default lê só funil ativo.
CREATE INDEX IF NOT EXISTS "idx_funnels_active"
  ON "funnels" ("project_id") WHERE "archived_at" IS NULL;

-- 0079
CREATE INDEX IF NOT EXISTS "stage_operational_costs_stage_idx"
  ON "stage_operational_costs" ("stage_id");

-- 0081
CREATE INDEX IF NOT EXISTS "sprint_reports_created_idx"
  ON "sprint_reports" ("created_at");

-- 0090: busca por tag sem varrer a tabela.
CREATE INDEX IF NOT EXISTS "idx_swipe_files_tags"
  ON "swipe_files" USING GIN ("tags");

-- 0134: os mapas sem etapa não entram no join da lista global.
CREATE INDEX IF NOT EXISTS idx_funnel_maps_soltos
  ON funnel_maps (project_id)
  WHERE stage_id IS NULL;

-- 0128: as regras globais são lidas em toda consulta.
CREATE INDEX IF NOT EXISTS project_source_rules_globais_idx
  ON project_source_rules (ordem) WHERE project_id IS NULL;

-- 0135: as respostas de uma conversa.
CREATE INDEX IF NOT EXISTS idx_funnel_map_comments_thread
  ON funnel_map_comments (parent_id)
  WHERE parent_id IS NOT NULL;
