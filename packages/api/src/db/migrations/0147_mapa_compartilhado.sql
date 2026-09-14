-- Link público de um mapa de funil: quem tem o link vê o mapa, ao vivo, sem login.
--
-- ## Um token, e não o id do mapa
--
-- O id é um UUID que circula em URL interna, log e print de tela. Publicar o
-- mapa pelo id tornaria público todo mapa cujo id alguém já viu — e não haveria
-- como desfazer. O token é um segredo à parte: 32 bytes aleatórios, gerado só
-- quando alguém clica em compartilhar, e revogável.
--
-- NULL = o mapa não está compartilhado. Revogar é voltar a NULL; o link antigo
-- para de funcionar na hora, e compartilhar de novo gera outro token — o
-- anterior nunca volta a valer.
ALTER TABLE funnel_maps
  ADD COLUMN IF NOT EXISTS share_token varchar(64);

-- A leitura pública busca POR TOKEN. Único porque dois mapas com o mesmo token
-- seriam um vazamento; parcial porque quase todo mapa tem NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_funnel_maps_share_token
  ON funnel_maps (share_token)
  WHERE share_token IS NOT NULL;
