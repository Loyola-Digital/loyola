-- Cria etapa "Principal" para cada funil existente, copiando a config atual
INSERT INTO funnel_stages (funnel_id, name, meta_account_id, campaigns, google_ads_account_id, google_ads_campaigns, switchy_folder_ids, switchy_linked_links, sort_order)
SELECT
  id,
  'Principal',
  meta_account_id,
  campaigns,
  google_ads_account_id,
  google_ads_campaigns,
  switchy_folder_ids,
  switchy_linked_links,
  0
FROM funnels;
