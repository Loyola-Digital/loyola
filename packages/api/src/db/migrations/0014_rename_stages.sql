-- EPIC-19: Renomear etapa padrão "Principal" para "Captação Gratuita"
UPDATE funnel_stages SET name = 'Captação Gratuita' WHERE name = 'Principal';
