-- Migration: funnel match_code (EPIC-25 - Story 25.1)
-- Adiciona coluna match_code para detectar campanhas Meta Ads orfas pelo nome.
-- Substring case-insensitive de match_code aplicado contra campaign.name.
-- Nullable: funis sem code nao disparam alerta (feature opt-in).

ALTER TABLE funnels ADD COLUMN match_code VARCHAR(50);
