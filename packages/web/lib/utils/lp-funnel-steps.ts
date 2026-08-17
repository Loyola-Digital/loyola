/**
 * Quais etapas compõem o mini-funil de uma LP, e em que ordem.
 *
 * Vive fora do componente porque isto é regra de domínio, não apresentação: o
 * funil muda de FORMA conforme a etapa, e a primeira versão do card errou
 * justamente aqui — montou uma cadeia fixa (lead → aplicação → pesquisa →
 * compra) que não corresponde a nenhuma das duas etapas reais.
 *
 * Captação Paga:
 *   - a planilha de leads é o POPUP (o dash chama de "Leads Popup" em todo lugar);
 *   - a compra é o ingresso;
 *   - a pesquisa é respondida por quem JÁ comprou o ingresso, então FECHA a
 *     cadeia — colocá-la antes da compra inverte a ordem dos fatos;
 *   - não existe "aplicaram": o formulário de aplicação é do comercial, que roda
 *     depois, em outra etapa.
 *
 * Captação Gratuita:
 *   - a pesquisa é respondida pelo lead, então vem antes da compra;
 *   - o formulário de aplicação, quando conectado, fica entre lead e compra.
 *
 * Etapa sem planilha conectada sai da cadeia em vez de aparecer zerada: uma
 * linha "Aplicaram 0" afirma que ninguém aplicou, o que é diferente de não haver
 * o quê medir.
 */

export interface EtapaFunilLp {
  label: string;
  valor: number;
  /** Texto do tooltip — de onde o número saiu, com o nome real da planilha. */
  fonte: string;
}

/** Só o que a montagem precisa — evita acoplar `lib/utils` aos hooks. */
export interface ContagensLpFunnel {
  leads: number;
  aplicacoes: number;
  pesquisas: number;
  compras: number;
}

export interface MontarEtapasParams {
  stageType: "paid" | "free";
  /** Da API do Meta (via tabela de LPs). */
  lpViews: number;
  /** `null` = LP sem nenhuma linha de planilha atribuída. */
  funil: ContagensLpFunnel | null;
  temFonte: { aplicacao: boolean; pesquisa: boolean };
  fontesPorEtapa?: { captacao: string[]; aplicacao: string[]; pesquisa: string[] };
}

/** Anexa os rótulos reais das planilhas ao texto base do tooltip. */
function comFontes(texto: string, labels?: string[]): string {
  return labels?.length ? `${texto} — ${labels.join(", ")}` : texto;
}

export function montarEtapasLpFunnel({
  stageType,
  lpViews,
  funil,
  temFonte,
  fontesPorEtapa,
}: MontarEtapasParams): EtapaFunilLp[] {
  const isPaid = stageType === "paid";

  const lpView: EtapaFunilLp = {
    label: "LP View",
    valor: lpViews,
    fonte: "Landing Page Views da API do Meta, somados por LP",
  };

  const leads: EtapaFunilLp = {
    label: isPaid ? "Leads Popup" : "Leads",
    valor: funil?.leads ?? 0,
    fonte: comFontes(
      isPaid
        ? "Quem preencheu o popup, dedup por contato"
        : "Planilha de captação, dedup por contato",
      fontesPorEtapa?.captacao,
    ),
  };

  const aplicacoes: EtapaFunilLp = {
    label: "Aplicaram",
    valor: funil?.aplicacoes ?? 0,
    fonte: comFontes("Formulário de aplicação do comercial", fontesPorEtapa?.aplicacao),
  };

  const pesquisas: EtapaFunilLp = {
    label: "Responderam pesquisa",
    valor: funil?.pesquisas ?? 0,
    fonte: comFontes(
      isPaid
        ? "Pesquisa da etapa — na Paga quem responde é quem já comprou o ingresso"
        : "Pesquisa da etapa, dedup por contato",
      fontesPorEtapa?.pesquisa,
    ),
  };

  const compras: EtapaFunilLp = {
    label: isPaid ? "Compraram ingresso" : "Compraram",
    valor: funil?.compras ?? 0,
    fonte: "Compradores únicos (e-mail) das planilhas de venda desta etapa",
  };

  if (isPaid) {
    return [lpView, leads, compras, ...(temFonte.pesquisa ? [pesquisas] : [])];
  }
  return [
    lpView,
    leads,
    ...(temFonte.aplicacao ? [aplicacoes] : []),
    ...(temFonte.pesquisa ? [pesquisas] : []),
    compras,
  ];
}

/**
 * Base dos percentuais: a primeira etapa com volume.
 *
 * Não é sempre o LP View — sem Meta conectada ele vem 0, e ancorar em zero
 * apagaria todas as barras de um funil que existe.
 */
export function baseDoFunil(etapas: EtapaFunilLp[]): number {
  return etapas.find((e) => e.valor > 0)?.valor ?? 0;
}
