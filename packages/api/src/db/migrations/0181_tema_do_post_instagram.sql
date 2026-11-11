-- Tema do conteúdo em cada post do Instagram.
--
-- "Que assunto rende?" é a pergunta que a tela não respondia: dava para ver
-- que o carrossel vai melhor que o Reels, mas não que o assunto X se espalha
-- e o assunto Y não. A etiqueta fica na própria linha do post.
--
-- Sem tabela de temas de propósito: a lista de uma conta é o `distinct` desta
-- coluna. Uma tabela exigiria cadastrar antes de etiquetar, e o vocabulário de
-- cada perfil só aparece depois de ver os posts.
--
-- `tema_fonte` separa o que a IA sugeriu do que uma pessoa decidiu — é o que
-- permite mostrar "sugerido, revise" na tela e nunca sobrescrever revisão.
ALTER TABLE instagram_post_metrics
  ADD COLUMN IF NOT EXISTS tema       varchar(60),
  ADD COLUMN IF NOT EXISTS tema_fonte varchar(10),
  ADD COLUMN IF NOT EXISTS tema_por   uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tema_em    timestamptz;
