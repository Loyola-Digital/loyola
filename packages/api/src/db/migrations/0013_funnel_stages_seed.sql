-- EPIC-19: Seed existing funnels with a default "Principal" stage
INSERT INTO funnel_stages (
  funnel_id, name, meta_account_id, campaigns,
  google_ads_account_id, google_ads_campaigns,
  switchy_folder_ids, switchy_linked_links, sort_order
)
SELECT
  id,
  'Captação Gratuita',
  meta_account_id,
  campaigns,
  google_ads_account_id,
  google_ads_campaigns,
  switchy_folder_ids,
  switchy_linked_links,
  0
FROM funnels
WHERE id NOT IN (SELECT DISTINCT funnel_id FROM funnel_stages);
