-- Comentários no mapa de funil.
--
-- ## Por que tabela, e não dentro do JSONB do mapa
--
-- O desenho inteiro é gravado de uma vez a cada save. Comentário guardado ali
-- seria reescrito junto — duas pessoas comentando ao mesmo tempo perderiam uma
-- a outra, e quem só arrasta um bloco apagaria o comentário que alguém acabou
-- de deixar.
--
-- Separado, cada comentário é uma linha própria: nasce sem tocar no desenho e
-- sobrevive a qualquer edição dele.
--
-- ## Ancorado no ponto E, quando houver, no bloco
--
-- `x`/`y` dizem onde o alfinete cai na aba. `box_id` é opcional: comentário
-- feito sobre um bloco acompanha o bloco quando ele é arrastado, e por isso a
-- posição vira relativa a ele. Comentário solto no fundo fica onde foi posto.

CREATE TABLE IF NOT EXISTS funnel_map_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES funnel_maps(id) ON DELETE CASCADE,
  /* Qual aba do mapa. É texto porque o id da aba vive no JSONB, não numa tabela. */
  tab_id varchar(64) NOT NULL,
  /* Resposta dentro de uma conversa. NULL = comentário que abre a conversa. */
  parent_id uuid REFERENCES funnel_map_comments(id) ON DELETE CASCADE,
  /* Bloco a que se refere, quando se refere a um. */
  box_id varchar(64),
  x integer NOT NULL DEFAULT 0,
  y integer NOT NULL DEFAULT 0,
  texto text NOT NULL,
  resolvido boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A tela carrega todos os comentários de um mapa de uma vez e agrupa por aba
-- na memória: são poucos por mapa, e uma consulta por aba faria uma ida ao
-- banco a cada troca de aba.
CREATE INDEX IF NOT EXISTS idx_funnel_map_comments_mapa
  ON funnel_map_comments (map_id, created_at);

-- Buscar as respostas de uma conversa.
CREATE INDEX IF NOT EXISTS idx_funnel_map_comments_thread
  ON funnel_map_comments (parent_id)
  WHERE parent_id IS NOT NULL;
