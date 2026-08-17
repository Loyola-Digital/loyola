-- PDI (Plano de Desenvolvimento Individual): documento HTML autocontido escrito
-- fora do app, atribuído a uma pessoa por um admin.
--
-- O HTML inteiro fica na tabela (não um caminho de arquivo) porque o PDI é um
-- SNAPSHOT: tem que continuar exibindo o que foi combinado naquele momento,
-- mesmo que o arquivo original suma ou seja editado depois.
--
-- Sem UNIQUE em user_id de propósito: cada atribuição é uma versão. A pessoa vê
-- a mais recente; o histórico serve pra comparar com o ciclo anterior.
CREATE TABLE IF NOT EXISTS pdi_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  html TEXT NOT NULL,
  -- RESTRICT: apagar o admin que atribuiu não pode levar o PDI junto.
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A consulta quente é "o PDI mais recente desta pessoa", feita em todo boot do app.
CREATE INDEX IF NOT EXISTS idx_pdi_documents_user_created
  ON pdi_documents(user_id, created_at);
