-- Story 19.4: Add stage_type to funnel_stages
ALTER TABLE funnel_stages ADD COLUMN stage_type varchar(10) NOT NULL DEFAULT 'free';
