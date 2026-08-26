-- De onde veio o snapshot de grupo.
--
-- Ate agora so havia uma origem (a planilha exportada a mao do SendFlow), entao
-- o default 'planilha' classifica corretamente todo o historico existente.
-- O que o MCP grava daqui pra frente vem marcado como 'sendflow', e o dashboard
-- usa isso pra dar PRIORIDADE ao MCP quando as duas origens tem dado do mesmo
-- dia — sem descartar o historico dos dias em que so a planilha tinha.
ALTER TABLE "funnel_group_snapshots"
  ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'planilha' NOT NULL;
