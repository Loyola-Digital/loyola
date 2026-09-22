-- Story 48.10 — Telegram vira Manychat nos canais orgânicos do simulador.
--
-- Decisão do Danilo em 2026-09-22, na validação visual: "substitui o Telegram
-- por Manychat, hoje faz mais sentido". O dado do sistema concorda — o
-- classificador de canais (`packages/api/src/utils/lead-origin.ts`,
-- `classifyCanal`) tem ManyChat como balde nomeado e **não tem Telegram**; a
-- Análise de origem (Story 18.77) já mede ManyChat (51,42 % de conversão no
-- `dg-pg04` em 04/09, contra 88,71 % do E-mail). O simulador falava de um
-- canal que os dados não conhecem.
--
-- ⚠️ ORDEM DE APLICAÇÃO: esta migration renomeia colunas que a API LÊ. Aplicar
-- **junto com o deploy da API** (antes de subir a versão nova, ou na mesma
-- janela) — a API antiga seleciona `pct_org_telegram` e passaria a dar erro.
-- Risco material hoje é zero: as seis tabelas `plan_*` estão vazias (conferido
-- em 2026-09-22), nenhum funil preencheu o painel ainda.
--
-- Idempotente: cada passo só roda se ainda houver o nome antigo.

DO $$
BEGIN
  -- 1. Inputs Financeiros (aba 1): % da meta e tamanho da base do canal.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_simulators' AND column_name='pct_org_telegram') THEN
    ALTER TABLE "plan_simulators" RENAME COLUMN "pct_org_telegram" TO "pct_org_manychat";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_simulators' AND column_name='base_telegram') THEN
    ALTER TABLE "plan_simulators" RENAME COLUMN "base_telegram" TO "base_manychat";
  END IF;

  -- 2. Combinações orgânicas (aba 2): cenário escolhido por canal.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plan_organic_combinations' AND column_name='sel_telegram') THEN
    ALTER TABLE "plan_organic_combinations" RENAME COLUMN "sel_telegram" TO "sel_manychat";
  END IF;
END $$;

-- 3. Blocos orgânicos (aba 2): o canal é VALOR, não coluna — e o CHECK precisa
--    aceitar o novo domínio. Linhas existentes (se algum dia houver) migram.
UPDATE "plan_organic_blocks" SET "canal" = 'manychat' WHERE "canal" = 'telegram';

ALTER TABLE "plan_organic_blocks" DROP CONSTRAINT IF EXISTS "ck_plan_organic_blocks_canal";
ALTER TABLE "plan_organic_blocks" ADD CONSTRAINT "ck_plan_organic_blocks_canal" CHECK (
  canal IN ('whatsapp', 'email', 'instagram', 'manychat', 'youtube', 'area_membros')
);

-- 4. Os CHECKs que citam as colunas renomeadas foram reescritos pelo Postgres
--    junto com o RENAME (ele reescreve a expressão), então `ck_plan_simulators_*`
--    e `ck_plan_organic_combinations_valores` não precisam de recriação. Este
--    bloco só CONFERE — se a expressão ainda falar de telegram, a migration
--    falha alto em vez de deixar passar.
DO $$
DECLARE conflitante text;
BEGIN
  SELECT string_agg(conname, ', ') INTO conflitante
  FROM pg_constraint
  WHERE contype = 'c'
    AND conrelid::regclass::text LIKE 'plan_%'
    AND pg_get_constraintdef(oid) ILIKE '%telegram%';
  IF conflitante IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK ainda menciona telegram: %', conflitante;
  END IF;
END $$;

-- Rollback (só faz sentido antes de qualquer linha nova):
-- ALTER TABLE "plan_simulators" RENAME COLUMN "pct_org_manychat" TO "pct_org_telegram";
-- ALTER TABLE "plan_simulators" RENAME COLUMN "base_manychat" TO "base_telegram";
-- ALTER TABLE "plan_organic_combinations" RENAME COLUMN "sel_manychat" TO "sel_telegram";
-- UPDATE "plan_organic_blocks" SET "canal" = 'telegram' WHERE "canal" = 'manychat';
-- (e recriar o CHECK com 'telegram')
