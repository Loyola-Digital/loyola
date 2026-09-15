-- Epic 47 / Story 47.13 — Nome de vídeo v2 (pedido do gestor de tráfego, 15/09/2026;
-- formato combinado com o dono).
--
--   adv (7 campos):  {tipo}{NN}_{origem}_{expert}_{sigla}{NN}_{hNN}_{bNN}_{mm-aaaa}--{descricao}
--                    adv01_h_dg_pg04_h01_b01_09-2026--
--   ad · carr:       continuam com 4 campos, byte a byte iguais.
--
-- Três colunas NULLABLE em naming_ads: null nos três = ad/carr ou vídeo do
-- padrão antigo (47.10). NENHUMA linha existente muda (regra 6: nome publicado
-- no Meta não muda) — esta migration não tem UPDATE.
--
-- hook_id/body_id apontam para naming_ad_parts (47.12) com RESTRICT: hook em
-- uso não se apaga (o código também não muda — "usado em N" passa a contar).

ALTER TABLE naming_ads ADD COLUMN IF NOT EXISTS origin varchar(20);
ALTER TABLE naming_ads ADD COLUMN IF NOT EXISTS hook_id uuid REFERENCES naming_ad_parts(id) ON DELETE RESTRICT;
ALTER TABLE naming_ads ADD COLUMN IF NOT EXISTS body_id uuid REFERENCES naming_ad_parts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_naming_ads_hook ON naming_ads (hook_id);
CREATE INDEX IF NOT EXISTS idx_naming_ads_body ON naming_ads (body_id);
