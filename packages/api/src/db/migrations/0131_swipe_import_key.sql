-- Idempotência da importação do canal de referências do ClickUp.
--
-- São ~390 itens e 831 MB por rodada: ela VAI cair no meio alguma vez — rede,
-- deploy, timeout do proxy. Sem uma chave estável, retomar significa importar
-- de novo o que já entrou, e a biblioteca ganha uma cópia de tudo.
--
-- A chave é a URL do anexo no ClickUp (única por upload) ou `msg:{id}:{url}`
-- para os itens que são só link.
ALTER TABLE swipe_files ADD COLUMN IF NOT EXISTS import_key text;

-- Índice PARCIAL: quase toda referência é subida à mão e não tem chave de
-- importação. Um índice único comum trataria os vários NULL como distintos e
-- ainda assim carregaria todas as linhas — o parcial só indexa o que veio de
-- importação, que é o que precisa ser único.
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipe_files_import_key
  ON swipe_files (import_key)
  WHERE import_key IS NOT NULL;
