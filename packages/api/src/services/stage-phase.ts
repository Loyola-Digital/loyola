import type { FunnelType, StageType } from "@loyola-x/shared";
import { fetchCampaigns } from "./meta-ads.js";

/**
 * Resolve o "sufixo de fase" a casar no nome de campanhas Meta pra uma etapa
 * específica. Combinado com o `matchCode` do funil (ex: `dg-pg02`), permite
 * que cada etapa receba apenas as campanhas que pertencem à sua fase.
 *
 * Heurística baseada em convenção atual do Loyola:
 * - launch + free + "captação/captura/leads" → `leads`
 * - launch + paid + "captação/captura" → `vendas-captacao`
 * - launch + qualquer + "principal/vendas/produto" → `vendas-principal`
 * - launch + sales → `vendas-principal`
 * - launch + cpl → null
 * - launch + event → null (Evento Presencial não tem campanha Meta por fase)
 * - perpetual + qualquer → null
 * - nome ambíguo → null
 *
 * `null` significa "não aplicar filtro extra" — o caller mantém comportamento
 * legacy de só filtrar por `matchCode`.
 */
export function resolveStagePhaseSuffix(
  funnelType: FunnelType,
  stageType: StageType,
  stageName: string,
): string | null {
  if (funnelType === "perpetual") return null;
  if (stageType === "cpl") return null;
  // Story 19.10: Evento Presencial não casa campanha Meta por fase.
  if (stageType === "event") return null;

  const lower = stageName.toLowerCase();
  const isCapture = /capta[cç][aã]o|captura|leads/.test(lower);
  const isMainProduct = /principal|vendas|produto/.test(lower);

  if (stageType === "free" && isCapture) return "leads";
  if (stageType === "paid" && isCapture) return "vendas-captacao";
  if (isMainProduct) return "vendas-principal";
  if (stageType === "sales") return "vendas-principal";

  return null;
}

/**
 * Busca campanhas Meta da conta vinculada que casam com `matchCode` E
 * `phaseSuffix` no nome (case-insensitive). Quando `phaseSuffix` é null,
 * retorna `[]` — auto-popular só executa quando a heurística é confiante.
 *
 * Filtra campanhas DELETED. Retorna `{ id, name }` no formato esperado por
 * `funnel_stages.campaigns`.
 */
export async function findMatchingCampaignsForStage(
  metaAccountId: string,
  accessToken: string,
  matchCode: string | null,
  phaseSuffix: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!matchCode || !phaseSuffix) return [];

  const all = await fetchCampaigns(metaAccountId, accessToken);
  const codeLower = matchCode.toLowerCase();
  const suffixLower = phaseSuffix.toLowerCase();

  return all
    .filter((c) => c.status !== "DELETED")
    .filter((c) => {
      const name = c.name.toLowerCase();
      return name.includes(codeLower) && name.includes(suffixLower);
    })
    .map((c) => ({ id: c.id, name: c.name }));
}
