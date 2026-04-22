-- Migration: backfill permissions legacy (project_members + project_invitations)
-- Motivo: usuários convidados antes da expansão do schema (instagram/conversations/mind)
-- ficaram com o JSONB só com 3 campos. Frontend faz spread{...permissions, [key]:val}
-- e envia object incompleto pro PATCH → Zod rejeita. Preenche os 3 novos campos
-- (traffic, youtubeAds, youtubeOrganic) com false em linhas legacy.

UPDATE project_members SET permissions = jsonb_build_object(
  'instagram',      COALESCE((permissions->>'instagram')::boolean, true),
  'traffic',        COALESCE((permissions->>'traffic')::boolean, false),
  'youtubeAds',     COALESCE((permissions->>'youtubeAds')::boolean, false),
  'youtubeOrganic', COALESCE((permissions->>'youtubeOrganic')::boolean, false),
  'conversations',  COALESCE((permissions->>'conversations')::boolean, true),
  'mind',           COALESCE((permissions->>'mind')::boolean, true)
)
WHERE NOT (
  permissions ? 'traffic'
  AND permissions ? 'youtubeAds'
  AND permissions ? 'youtubeOrganic'
);

UPDATE project_invitations SET permissions = jsonb_build_object(
  'instagram',      COALESCE((permissions->>'instagram')::boolean, true),
  'traffic',        COALESCE((permissions->>'traffic')::boolean, false),
  'youtubeAds',     COALESCE((permissions->>'youtubeAds')::boolean, false),
  'youtubeOrganic', COALESCE((permissions->>'youtubeOrganic')::boolean, false),
  'conversations',  COALESCE((permissions->>'conversations')::boolean, true),
  'mind',           COALESCE((permissions->>'mind')::boolean, true)
)
WHERE NOT (
  permissions ? 'traffic'
  AND permissions ? 'youtubeAds'
  AND permissions ? 'youtubeOrganic'
);
