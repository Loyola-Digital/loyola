import type { Database } from "../db/client.js";
import { triggerBackgroundSyncForNewCampaigns } from "./meta-insights-cache.js";
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
 * Agora pede a cada conta do expert, com o número e o token DELA. Uma campanha
 * pertence a uma conta só; nas outras o filtro `campaign.id IN` não casa nada.
 *
 * Devolve quantas contas receberam o pedido (0 = expert sem conta Meta).
 */
export async function sincronizarHistoricoDasCampanhasNovas(
  db: Database,
  projectId: string,
  newCampaignIds: string[],
): Promise<number> {
  if (newCampaignIds.length === 0) return 0;
  const contas = await getAllMetaAccountsForProject(db, projectId);
  for (const conta of contas) {
    triggerBackgroundSyncForNewCampaigns(
      db,
      projectId,
      conta.metaAccountId,
      conta.accessToken,
      newCampaignIds,
    );
  }
  return contas.length;
}
