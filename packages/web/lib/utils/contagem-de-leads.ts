/**
 * A contagem de leads da planilha de uma etapa — o laço que vivia no `useMemo`
 * de `useCrossReferenceLeads`.
 *
 * Saiu do hook porque o vitest do web só coleta `lib/utils` (e afins): dentro do
 * hook, um teste provaria uma CÓPIA da regra, e o hook poderia divergir dela sem
 * derrubar nada. O hook chama esta função; o teste chama esta função.
 *
 * Story 18.83 (AC4): acrescenta `leadsPagosPorAnuncio` — o lead pago contado por
 * `ad_id` (`utm_content`), para a tabela de LPs do lançamento somá-lo na linha
 * da URL do anúncio. O `leadsByLp` (letra no texto) continua, para o web ver o
 * que via antes quando a API ainda não manda a URL.
 */

import { utmContentEfetivo } from "@/lib/utils/normalize-answer";

/** Leads pagos com a temperatura que o TEXTO do lead declara (AC7/PO-07). */
export interface LeadsPorTemperatura {
  hot: number;
  cold: number;
  total: number;
}

export interface ContagemDeLeads {
  /** `ad_id → leads` (todas as linhas com `utm_content`, pagas ou não). */
  leads: Record<string, number>;
  /** Story 18.47: leads por Ad Name (soma todos os ad_ids do criativo). */
  leadsByAdName: Record<string, number>;
  /** `ad_id → "hot" | "cold"` (primeiro termo que declara). */
  terms: Record<string, string>;
  /** `ad_id → utm_term` completo (Story 18.44). */
  termsMapping: Record<string, string>;
  /**
   * Story 18.46: leads PAGOS por letra de LP no texto (`lpa`), com temperatura.
   * Regra do rótulo — usada só quando a API não manda a URL do anúncio.
   */
  leadsByLp: Record<string, LeadsPorTemperatura>;
  /**
   * Story 18.83 (AC4): leads PAGOS por `ad_id` (`utm_content`), com a mesma
   * temperatura do texto que o `leadsByLp` usa. A tabela de LPs soma por URL.
   */
  leadsPagosPorAnuncio: Record<string, LeadsPorTemperatura>;
  totalLeads: number;
}

type Planilha = { headers?: string[]; rows?: string[][] } | null | undefined;

const PAID_SOURCES = new Set(["meta", "google"]);

export function contarLeadsDaPlanilha(planilha: Planilha): ContagemDeLeads {
  const leads: Record<string, number> = {};
  const leadsByAdName: Record<string, number> = {};
  const terms: Record<string, string> = {};
  const termsMapping: Record<string, string> = {};
  const leadsByLp: Record<string, LeadsPorTemperatura> = {};
  const leadsPagosPorAnuncio: Record<string, LeadsPorTemperatura> = {};
  let totalLeads = 0;

  const rows = planilha?.rows;
  if (!rows || rows.length === 0) {
    return { leads, leadsByAdName, terms, termsMapping, leadsByLp, leadsPagosPorAnuncio, totalLeads };
  }

  const headers = planilha?.headers ?? [];
  // Story 18.47: localiza colunas por CABEÇALHO (robusto entre abas de etapas
  // diferentes); cai pras posições legadas (5/7) quando o header não existe.
  const findCol = (names: string[], fallback: number): number => {
    const idx = headers.findIndex((h) => names.includes((h ?? "").trim().toLowerCase()));
    return idx >= 0 ? idx : fallback;
  };
  const CONTENT_INDEX = findCol(["content", "utm_content", "co="], 5); // utm_content = adId
  const TERM_INDEX = findCol(["utm_term", "term", "t="], 7); // utm_term (lpX/hot/cold)

  // Story 18.46: localiza a coluna `source` (utm_source) pelo cabeçalho.
  // Lead pago = source ∈ {meta, google}; o resto (ig, etc.) é orgânico.
  const SOURCE_INDEX = headers.findIndex((h) => {
    const n = (h ?? "").trim().toLowerCase();
    return n === "source" || n === "utm_source";
  });
  // Story 18.47: coluna "Ad Name" da planilha — agrupar leads por nome do
  // criativo (soma todos os ad_ids). Localiza por cabeçalho (robusto).
  const AD_NAME_INDEX = headers.findIndex((h) => {
    const n = (h ?? "").trim().toLowerCase();
    return n === "ad name" || n === "ad_name" || n === "adname" || n === "nome do anúncio" || n === "nome do anuncio";
  });
  const isPaidRow = (row: string[]): boolean => {
    if (SOURCE_INDEX < 0) return true; // sem coluna source → não filtra (fallback)
    const src = (row[SOURCE_INDEX] ?? "").trim().toLowerCase();
    return PAID_SOURCES.has(src);
  };
  const somar = (alvo: Record<string, LeadsPorTemperatura>, chave: string, haystack: string) => {
    if (!alvo[chave]) alvo[chave] = { hot: 0, cold: 0, total: 0 };
    alvo[chave].total += 1;
    if (haystack.includes("hot")) alvo[chave].hot += 1;
    else if (haystack.includes("cold")) alvo[chave].cold += 1;
  };

  for (const row of rows) {
    const termString = (row[TERM_INDEX]?.trim() ?? "").toLowerCase();
    const utmContentRaw = (row[CONTENT_INDEX]?.trim() ?? "").toLowerCase();

    // Story 18.47: conta leads por Ad Name (TODAS as linhas daquele criativo,
    // somando os vários ad_ids). Corrige a contagem que antes usava 1 só ad_id.
    if (AD_NAME_INDEX >= 0) {
      const adName = (row[AD_NAME_INDEX] ?? "").trim();
      if (adName) leadsByAdName[adName] = (leadsByAdName[adName] ?? 0) + 1;
    }

    // Story 18.46 (AC6): identificar a LP e a temperatura do lead.
    // Os dados reais mostram que lpX/hot/cold vivem no utm_term (col 7), mas
    // procuramos em ambas as colunas (5 e 7) para robustez.
    // Conta APENAS leads pagos (source = meta/google) — Tx Conv usa esse número.
    const haystack = `${utmContentRaw} ${termString}`;
    const pago = isPaidRow(row);
    const lpMatch = haystack.match(/lp([a-z])/);
    if (lpMatch && pago) somar(leadsByLp, `lp${lpMatch[1]}`, haystack);

    const utmContent = row[CONTENT_INDEX]?.trim() ?? "";
    if (!utmContent) continue;

    const adId = utmContentEfetivo(utmContent);

    // Story 18.83 (AC4): o lead pago vai para o anúncio dele — a URL sai do
    // anúncio, não da letra do texto. Mesma temperatura do texto (PO-07).
    if (pago && adId) somar(leadsPagosPorAnuncio, adId, haystack);

    leads[adId] = (leads[adId] ?? 0) + 1;

    // Store full utm_term for LP identification (Story 18.44)
    if (!termsMapping[adId]) {
      termsMapping[adId] = termString;
    }

    // Extract hot/cold from the term string (Story 18.43)
    if (!terms[adId]) {
      if (termString.includes("hot")) {
        terms[adId] = "hot";
      } else if (termString.includes("cold")) {
        terms[adId] = "cold";
      }
    }

    totalLeads += 1;
  }

  return { leads, leadsByAdName, terms, termsMapping, leadsByLp, leadsPagosPorAnuncio, totalLeads };
}
