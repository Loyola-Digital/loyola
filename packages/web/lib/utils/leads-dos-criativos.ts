/**
 * Story 18.89 — a coluna Leads do Desempenho de Criativos pela MESMA conta do
 * Top Criativos.
 *
 * O defeito: `ad04-fz-l4-bf26--melhores-amigos` (4 anúncios) aparecia com 38
 * leads no Top Criativos e 5 na tabela. A tabela contava as linhas de UM
 * anúncio só — o `adId` de cada linha da rota é o representante do grupo, não
 * a lista — sempre que a aba de leads não tinha a coluna "Ad Name" (15 de 20
 * etapas medidas em 19/10/2026). O hook preferia esse número ao da API.
 *
 * Esta função não tem regra própria: escolhe a planilha como o Top Criativos
 * (`escolherPlanilhaDeLeads`), recorta pela mesma janela
 * (`filterSheetRowsByDays`) e conta com a mesma função
 * (`countLeadsByOriginForAds(...).leadsPagos`) — pagos, cada e-mail uma vez,
 * somando TODOS os anúncios do criativo. Se as duas telas divergirem de novo,
 * é porque uma delas deixou de passar por aqui.
 */

import type {
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
} from "@/lib/types/funnel-spreadsheet";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import { countLeadsByOriginForAds } from "@/lib/utils/top-creatives";

/**
 * A planilha de onde saem os leads de uma etapa: a vinculada como `leads`; sem
 * ela, a primeira vinculada (as etapas de perpétuo só têm a de vendas).
 * Mesma escolha nas duas telas — é o que faz os números baterem.
 */
export function escolherPlanilhaDeLeads(
  planilhas: FunnelSpreadsheet[] | null | undefined,
): FunnelSpreadsheet | null {
  if (!planilhas || planilhas.length === 0) return null;
  return planilhas.find((p) => p.type === "leads") ?? planilhas[0] ?? null;
}

/** O que esta função precisa de cada linha da tabela. */
export interface CriativoComLeads {
  adId: string;
  adName: string;
  leads: number;
  /** Todos os ad_ids do criativo. Ausente quando a API é anterior ao contrato 53. */
  adIds?: string[];
}

const normalizarNome = (s: string) => s.trim().toLowerCase();

/**
 * Os ad_ids de um criativo.
 *
 * - API do contrato 53 em diante: a lista vem pronta (`adIds`).
 * - API anterior (web publicado antes da API): a linha só traz o
 *   representante. Reconstrói o grupo pelos nomes já resolvidos
 *   (`adNameByContent` — coluna "Ad Name" da planilha ou nome da Meta). Sem o
 *   nome do próprio representante não há como saber o grupo, e devolve `null`:
 *   o chamador fica com o número da API, nunca com a contagem de um anúncio só
 *   (AC4).
 */
export function adIdsDoCriativo(
  criativo: Pick<CriativoComLeads, "adId" | "adName" | "adIds">,
  adNameByContent: Record<string, string>,
): string[] | null {
  if (criativo.adIds && criativo.adIds.length > 0) return criativo.adIds;
  if (!adNameByContent[criativo.adId]) return null;
  const alvo = normalizarNome(criativo.adName);
  const ids = new Set<string>([criativo.adId]);
  for (const [adId, nome] of Object.entries(adNameByContent)) {
    if (normalizarNome(nome) === alvo) ids.add(adId);
  }
  return [...ids];
}

/**
 * Substitui o `leads` de cada criativo pela contagem do Top Criativos.
 *
 * Sem planilha carregada, ou sem como saber os ad_ids do criativo, o `leads`
 * que veio da API fica — desde o contrato 53 ele já segue a mesma regra.
 * Devolve uma lista nova; não muta a de entrada.
 */
export function aplicarLeadsDaPlanilha<T extends CriativoComLeads>(
  criativos: T[],
  planilha: FunnelSpreadsheetData | undefined,
  days: number,
  adNameByContent: Record<string, string>,
): T[] {
  if (!planilha) return criativos;
  const linhas = filterSheetRowsByDays(planilha, days);
  const utmContentMapped = !!planilha.mapping.utm_content;
  const utmSourceMapped = !!planilha.mapping.utm_source;
  return criativos.map((criativo) => {
    const adIds = adIdsDoCriativo(criativo, adNameByContent);
    if (!adIds) return criativo;
    const { leadsPagos } = countLeadsByOriginForAds(
      linhas,
      adIds,
      utmContentMapped,
      utmSourceMapped,
    );
    return { ...criativo, leads: leadsPagos };
  });
}
