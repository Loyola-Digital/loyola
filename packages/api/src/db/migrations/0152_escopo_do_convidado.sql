-- Até onde o convidado enxerga dentro da empresa: um funil, uma etapa.
--
-- O convite dava a empresa inteira. Vendedor contratado para um evento precisa
-- de um funil e uma etapa, e nada mais. NULL = sem limite, que é o convidado de
-- antes — nenhum acesso existente muda de comportamento.
--
-- ON DELETE CASCADE porque o acesso não sobrevive ao que ele aponta: funil
-- apagado deixaria o convidado com um escopo que não existe, e "escopo que não
-- existe" cairia na regra de NULL, que libera tudo.

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES funnels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES funnel_stages(id) ON DELETE CASCADE;

ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS funnel_id uuid,
  ADD COLUMN IF NOT EXISTS stage_id uuid;
