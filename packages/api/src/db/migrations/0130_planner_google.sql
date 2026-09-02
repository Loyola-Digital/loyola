-- A fase lembra de qual evento do Google ela veio.
--
-- Sem isso, reimportar a agenda duplicaria tudo: não há como saber que
-- "FZL3 - Prod. Captação" já existe como a mesma coisa, e não como uma fase
-- nova de mesmo nome.
--
-- Com o id guardado, a reimportação ATUALIZA o que veio do Google e não toca
-- no que foi criado à mão — que é a divisão certa: o Google manda nas fases
-- dele, o Planner manda nas próprias.
--
-- Fica dentro do JSONB de `phases` (campo `googleEventId`), então não há coluna
-- nova. Esta migration existe só para registrar a decisão e criar a tabela das
-- agendas conhecidas — a service account não enxerga `calendarList` (não tem
-- caixa de entrada para aceitar o convite), então os ids precisam ser
-- guardados por quem configura.
CREATE TABLE IF NOT EXISTS planner_google_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id text NOT NULL UNIQUE,
  label varchar(200) NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_imported_at timestamptz
);
