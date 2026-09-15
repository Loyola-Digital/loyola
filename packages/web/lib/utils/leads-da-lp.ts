/**
 * De onde vêm os leads de uma LP: a planilha do formulário ou o pixel.
 *
 * A LPA do FZM3 tem formulário e manda os leads para a planilha. A LPB não tem
 * formulário nenhum — a pessoa vai direto para o grupo — então a planilha fica
 * zerada para ela, e o `Lead` do pixel da Meta é o único rastro.
 *
 * A regra é a própria definição: **LP sem nenhum lead na planilha usa o
 * pixel**. Quem tem formulário continua exatamente como era. Se a LPB ganhar
 * formulário, ela passa a ter lead na planilha e volta sozinha para ela.
 *
 * "Nenhum lead" olha o TOTAL da planilha, não o recorte Hot/Cold: filtrar por
 * público não pode trocar a fonte da linha — senão Hot mostraria pixel e
 * Todos mostraria planilha para a mesma página.
 */

export type FonteDeLeads = "planilha" | "pixel";

export function leadsDaLp(
  planilha: { total: number; hot: number; cold: number } | undefined,
  pixelNoFiltro: number,
  filtro: "hot" | "cold" | "todos",
): { leads: number; fonte: FonteDeLeads } {
  if (!planilha || planilha.total === 0) {
    return { leads: pixelNoFiltro, fonte: "pixel" };
  }
  const leads =
    filtro === "hot" ? planilha.hot : filtro === "cold" ? planilha.cold : planilha.total;
  return { leads, fonte: "planilha" };
}

// ---- Dados diários ------------------------------------------------------

/** Rótulo do pixel no detalhamento por medium do Total de Leads. */
export const MEDIUM_DO_PIXEL = "pixel · LP sem formulário";

/**
 * LPs que aparecem nos UTMs da planilha ("lpa", "lpb").
 *
 * Regex FROUXA de propósito: aqui errar para mais é o lado seguro. Uma LP
 * reconhecida na planilha nunca soma pixel; uma LP com formulário que passasse
 * despercebida teria os leads contados duas vezes (planilha + pixel).
 */
export function lpsDaPlanilha(
  rows: { named: { utm_content?: string; utm_term?: string } }[],
): Set<string> {
  const lps = new Set<string>();
  for (const r of rows) {
    const m = `${r.named.utm_content ?? ""} ${r.named.utm_term ?? ""}`
      .toLowerCase()
      .match(/lp([a-z])/);
    if (m) lps.add(`lp${m[1]}`);
  }
  return lps;
}

/**
 * Campanhas cuja LP não tem formulário: `lpX` no nome e LP ausente da planilha.
 *
 * Regex ESTRITA no nome da campanha (`-lpb`, `lpb_hot`), pelo mesmo motivo ao
 * contrário: "alpha" ou "help" não podem virar LPH e somar pixel em cima de
 * leads que já estão na planilha.
 *
 * Planilha sem NENHUMA LP marcada → nenhuma campanha: o funil não identifica
 * a LP nos UTMs, então não há como saber quem não tem formulário, e somar o
 * pixel duplicaria os leads.
 */
export function campanhasSemFormulario(
  campanhas: { id: string; name: string }[],
  lpsNaPlanilha: Set<string>,
): string[] {
  if (lpsNaPlanilha.size === 0) return [];
  return campanhas
    .filter((c) => {
      const m = c.name.toLowerCase().match(/(?:^|[^a-z])lp([a-z])(?![a-z])/);
      return !!m && !lpsNaPlanilha.has(`lp${m[1]}`);
    })
    .map((c) => c.id);
}

type DiaDaPlanilha = {
  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  faturamento: number;
  leadsByMedium: Record<string, number>;
};

/**
 * Soma os leads do pixel como leads PAGOS do dia (vieram de anúncio), e no
 * detalhamento por medium, para o balão do Total fechar com o número da
 * célula. Devolve um mapa novo; o original fica intacto.
 */
export function somarPixelNaPlanilha(
  planilha: Map<string, DiaDaPlanilha>,
  pixelPorDia: Map<string, number>,
): Map<string, DiaDaPlanilha> {
  const out = new Map(planilha);
  for (const [dia, n] of pixelPorDia) {
    if (n <= 0) continue;
    const atual = out.get(dia) ?? {
      leadsPagos: 0,
      leadsOrg: 0,
      leadsSemTrack: 0,
      faturamento: 0,
      leadsByMedium: {},
    };
    out.set(dia, {
      ...atual,
      leadsPagos: atual.leadsPagos + n,
      leadsByMedium: {
        ...atual.leadsByMedium,
        [MEDIUM_DO_PIXEL]: (atual.leadsByMedium[MEDIUM_DO_PIXEL] ?? 0) + n,
      },
    });
  }
  return out;
}
