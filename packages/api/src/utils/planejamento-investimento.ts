// ============================================================
// Story 48.11 — o investimento Meta REALIZADO de um lançamento.
//
// Função pura, separada do repositório de propósito: o que pode dar errado aqui
// não é a consulta, é a consolidação — a mesma campanha vinculada ao funil E a
// uma etapa dele sendo contada duas vezes, e o gasto sem temperatura no nome
// entrando no denominador do "% quente". As duas coisas se provam sem banco.
//
// Medido em produção (2026-09-22), nos 11 lançamentos reais:
//
//   - em 9 deles `funnels.campaigns` está VAZIO e o vínculo mora no STAGE;
//   - 869 nomes de campanha trazem `hot`/`cold`/`quente`/`frio`, com ZERO
//     falsos positivos (nenhum "hotmart", "photo", "shot");
//   - `bbe-pr2-ago-26` tem R$ 472,02 em campanha sem temperatura no nome —
//     é o caso que separa "fora do denominador" de "somado como frio".
// ============================================================

import { temperaturaDoNome } from "./temperatura-de-publico.js";

/** Um vínculo campanha↔funil, venha do funil ou de uma etapa dele. */
export interface CampanhaVinculada {
  id: string;
  name: string;
}

/** O gasto agregado de uma campanha, como sai do `group by` da tabela diária. */
export interface GastoDaCampanha {
  campaignId: string;
  /** `numeric` do Postgres chega como string. */
  spend: string | number | null;
  de?: string | null;
  ate?: string | null;
}

export interface InvestimentoRealizado {
  total: number;
  quente: number;
  frio: number;
  /** Campanha cujo nome não diz a temperatura — fica de fora do % quente. */
  indefinido: number;
  /** `quente ÷ (quente + frio)`; `null` quando nenhuma campanha tem temperatura no nome. */
  pctQuente: number | null;
  campanhasVinculadas: number;
  campanhasComSpend: number;
  /** Primeiro e último dia COM gasto (`YYYY-MM-DD`); `null` quando não há gasto. */
  janela: { de: string | null; ate: string | null };
}

/**
 * As campanhas do lançamento, sem repetir a que está vinculada nos dois lugares.
 *
 * O funil vem primeiro porque, quando os dois têm a mesma campanha com nomes
 * diferentes (renomeada na Meta depois do vínculo), o do funil é o mais recente.
 */
export function campanhasDoLancamento(
  doFunil: readonly CampanhaVinculada[] | null | undefined,
  dasEtapas: readonly (readonly CampanhaVinculada[] | null | undefined)[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of doFunil ?? []) out.set(c.id, c.name);
  for (const etapa of dasEtapas) for (const c of etapa ?? []) if (!out.has(c.id)) out.set(c.id, c.name);
  return out;
}

/** Consolida o gasto por temperatura. Campanha sem gasto não entra em `campanhasComSpend`. */
export function consolidarInvestimento(
  campanhas: Map<string, string>,
  gasto: readonly GastoDaCampanha[],
): InvestimentoRealizado {
  const out: InvestimentoRealizado = {
    total: 0,
    quente: 0,
    frio: 0,
    indefinido: 0,
    pctQuente: null,
    campanhasVinculadas: campanhas.size,
    campanhasComSpend: 0,
    janela: { de: null, ate: null },
  };

  for (const g of gasto) {
    const valor = Number(g.spend ?? 0);
    if (!Number.isFinite(valor) || valor === 0) continue;
    // Linha de gasto de campanha que não é deste lançamento não entra: a
    // consulta já filtra, e aqui a garantia é a mesma sem depender dela.
    if (!campanhas.has(g.campaignId)) continue;

    out.campanhasComSpend += 1;
    out.total += valor;

    const t = temperaturaDoNome(campanhas.get(g.campaignId));
    if (t === "quente") out.quente += valor;
    else if (t === "frio") out.frio += valor;
    else out.indefinido += valor;

    if (g.de && (out.janela.de === null || g.de < out.janela.de)) out.janela.de = g.de;
    if (g.ate && (out.janela.ate === null || g.ate > out.janela.ate)) out.janela.ate = g.ate;
  }

  // O denominador é `quente + frio`, NÃO o total: quem não declara a
  // temperatura no nome não vira frio por omissão. Com `total` no lugar,
  // `bbe-pr2-ago-26` cairia de 45,1 % para 44,0 % sem nada na tela indicando
  // que a diferença é gasto não classificado.
  const comTemperatura = out.quente + out.frio;
  out.pctQuente = comTemperatura > 0 ? out.quente / comTemperatura : null;
  return out;
}
