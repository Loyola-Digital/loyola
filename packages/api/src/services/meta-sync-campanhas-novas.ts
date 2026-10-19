import type { Database } from "../db/client.js";
import { triggerBackgroundSyncForNewCampaignsEmContas } from "./meta-insights-cache.js";
import { getAllMetaAccountsForProject } from "./traffic-analytics.js";

/**
 * Epic 30 Story 30.2 — sync histórico (365d) das campanhas recém-vinculadas a
 * um funil ou etapa. Fire-and-forget.
 *
 * Story 29.83: as duas cópias que existiam (funnels.ts e funnel-stages.ts)
 * mandavam `funnels.meta_account_id` / `funnel_stages.meta_account_id` como o
 * id da conta na Graph API — e essa coluna é o UUID de `meta_ads_accounts`,
 * não o número `act_`. A chamada falhava sempre, calada (o erro só ia para o
 * log). O token era o da "primeira" conta do `.limit(1)`.
 *
 * Agora é UMA chamada com todas as contas do expert: a rebusca pede a cada
 * conta com o número e o token DELA. Uma chamada por conta, em paralelo,
 * colidia no `singleFlight` e só a 1ª conta era consultada (QA 29.83 REL-001).
 *
 * Devolve quantas contas entram no pedido (0 = expert sem conta Meta).
 */
export async function sincronizarHistoricoDasCampanhasNovas(
  db: Database,
  projectId: string,
  newCampaignIds: string[],
): Promise<number> {
  if (newCampaignIds.length === 0) return 0;
  const contas = await getAllMetaAccountsForProject(db, projectId);
  if (contas.length === 0) return 0;
  triggerBackgroundSyncForNewCampaignsEmContas(db, projectId, contas, newCampaignIds);
  return contas.length;
}
