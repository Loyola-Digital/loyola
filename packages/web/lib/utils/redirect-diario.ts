/**
 * A etapa `redirect` por dia: o que a Meta entregou contra quem entrou no grupo.
 *
 * ## Por que existe
 *
 * Na campanha de redirect ninguém se cadastra: o anúncio leva a uma página que
 * joga a pessoa no grupo de WhatsApp. Não há planilha, não há e-mail, não há
 * lead — então a única maneira de saber se o investimento virou audiência é
 * encostar quatro números do mesmo dia:
 *
 *     impressões → cliques no link (Meta) → visitas da página (pixel) → entrou no grupo (SendFlow)
 *
 * Cada um vem de uma fonte diferente, com chave de data própria, e é aí que se
 * erra: um dia que existe numa fonte e não na outra, uma divisão por zero no
 * primeiro dia, o imposto do Meta Ads esquecido. Função pura de propósito —
 * é o que dá para testar sem componente e sem rede.
 *
 * ## A união das datas, não a interseção
 *
 * Dia com anúncio e zero entrada é o resultado mais importante que esta tela
 * tem para dar (o criativo gastou e não encheu grupo nenhum). Dia com entrada e
 * zero investimento também é informação: alguém entrou por link direto,
 * indicação ou disparo. Partir de uma fonte só esconderia um dos dois.
 */

import { getActionValue, metaTaxAmount } from "./funnel-metrics";

/** Um dia de insight da Meta, como a API de `campaign-daily` devolve. */
export interface InsightDoDia {
  date_start: string;
  spend: string;
  impressions: string;
  actions?: { action_type: string; value: string }[];
}

export interface DiaDaMeta {
  date: string;
  /** Já COM o imposto do Meta Ads — é o que os cards do sistema mostram. */
  investimento: number;
  impressoes: number;
  cliquesNoLink: number;
  /** `landing_page_view`: o pixel contando quem carregou a página de redirect. */
  visitasDaPagina: number;
}

/** O lado do grupo, como `montarDiario` (sendflow-diario) já devolve. */
export interface DiaDoGrupo {
  date: string;
  entrou: number;
  saiu: number;
  cliques: number;
  disparos: number;
}

export interface DiaDoRedirect extends DiaDaMeta, Omit<DiaDoGrupo, "date"> {
  /** `entrou - saiu`. Negativo é dia de esvaziamento, e precisa aparecer. */
  saldo: number;
  /** Investimento ÷ entradas no grupo. `null` quando ninguém entrou. */
  custoPorEntrada: number | null;
  /** Visitas da página ÷ cliques no link, em %. O "connect rate" do redirect. */
  taxaCliqueParaPagina: number | null;
  /** Entradas no grupo ÷ visitas da página, em %. */
  taxaPaginaParaGrupo: number | null;
  /** Entradas no grupo ÷ cliques no link, em %. A ponta a ponta. */
  taxaCliqueParaGrupo: number | null;
}

/** `null` em vez de `Infinity`/`NaN`: a tela mostra "—" e ninguém lê zero como taxa. */
function taxa(parte: number, total: number): number | null {
  return total > 0 ? (parte / total) * 100 : null;
}

/**
 * Os insights diários das campanhas da etapa somados por DIA.
 *
 * Recebe uma lista por campanha (é o que `useCampaignDailyInsightsBulk` dá
 * quando se busca várias) e soma as campanhas que caem no mesmo dia — sem isso,
 * duas campanhas no ar fariam duas linhas para a mesma data.
 */
export function metaPorDia(porCampanha: InsightDoDia[][]): DiaDaMeta[] {
  const porDia = new Map<string, DiaDaMeta>();
  for (const insights of porCampanha) {
    for (const row of insights ?? []) {
      const date = row?.date_start;
      if (!date) continue;
      const atual =
        porDia.get(date) ??
        { date, investimento: 0, impressoes: 0, cliquesNoLink: 0, visitasDaPagina: 0 };
      const gasto = parseFloat(row.spend || "0") || 0;
      // O imposto é por LINHA porque a alíquota depende da data (ver
      // `applyMetaAdsTax`): somar primeiro e tributar depois daria outro número.
      atual.investimento += gasto + metaTaxAmount(gasto, date);
      atual.impressoes += parseFloat(row.impressions || "0") || 0;
      atual.cliquesNoLink += getActionValue(row.actions, "link_click");
      atual.visitasDaPagina += getActionValue(row.actions, "landing_page_view");
      porDia.set(date, atual);
    }
  }
  return [...porDia.values()];
}

/**
 * Uma linha por dia, do mais recente para o mais antigo — a ordem da tabela.
 */
export function montarRedirectDiario(
  meta: DiaDaMeta[],
  grupo: DiaDoGrupo[],
): DiaDoRedirect[] {
  const porDia = new Map<string, DiaDoRedirect>();

  const garantir = (date: string): DiaDoRedirect => {
    const atual = porDia.get(date);
    if (atual) return atual;
    const novo: DiaDoRedirect = {
      date,
      investimento: 0,
      impressoes: 0,
      cliquesNoLink: 0,
      visitasDaPagina: 0,
      entrou: 0,
      saiu: 0,
      cliques: 0,
      disparos: 0,
      saldo: 0,
      custoPorEntrada: null,
      taxaCliqueParaPagina: null,
      taxaPaginaParaGrupo: null,
      taxaCliqueParaGrupo: null,
    };
    porDia.set(date, novo);
    return novo;
  };

  for (const d of meta ?? []) {
    if (!d?.date) continue;
    const linha = garantir(d.date);
    linha.investimento += d.investimento ?? 0;
    linha.impressoes += d.impressoes ?? 0;
    linha.cliquesNoLink += d.cliquesNoLink ?? 0;
    linha.visitasDaPagina += d.visitasDaPagina ?? 0;
  }

  for (const d of grupo ?? []) {
    if (!d?.date) continue;
    const linha = garantir(d.date);
    linha.entrou += d.entrou ?? 0;
    linha.saiu += d.saiu ?? 0;
    linha.cliques += d.cliques ?? 0;
    linha.disparos += d.disparos ?? 0;
  }

  for (const linha of porDia.values()) {
    linha.saldo = linha.entrou - linha.saiu;
    linha.custoPorEntrada = linha.entrou > 0 ? linha.investimento / linha.entrou : null;
    linha.taxaCliqueParaPagina = taxa(linha.visitasDaPagina, linha.cliquesNoLink);
    linha.taxaPaginaParaGrupo = taxa(linha.entrou, linha.visitasDaPagina);
    linha.taxaCliqueParaGrupo = taxa(linha.entrou, linha.cliquesNoLink);
  }

  return [...porDia.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * O primeiro dia da janela de `dias` dias, contando HOJE — `YYYY-MM-DD`.
 *
 * Existe porque as duas fontes têm janelas diferentes: a Meta responde "últimos
 * N dias" e o SendFlow devolve a campanha INTEIRA, desde o primeiro grupo. Sem
 * recortar o lado do grupo, a tabela mostraria entradas de meses atrás ao lado
 * de uma coluna de investimento vazia.
 *
 * `dias = 1` é hoje a hoje. O corte é em UTC, o mesmo critério de
 * `janelasDeDias` na API — e o mesmo lugar onde o backfill da Meta já errou um
 * dia, por isso a função é separada e testada.
 */
export function desdeIso(dias: number, agora: Date = new Date()): string {
  const d = Math.max(1, Math.floor(dias));
  return new Date(agora.getTime() - (d - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface TotaisDoRedirect {
  investimento: number;
  impressoes: number;
  cliquesNoLink: number;
  visitasDaPagina: number;
  entrou: number;
  saiu: number;
  saldo: number;
  custoPorEntrada: number | null;
  taxaCliqueParaPagina: number | null;
  taxaPaginaParaGrupo: number | null;
  taxaCliqueParaGrupo: number | null;
}

/**
 * Os totais da janela.
 *
 * ⚠️ As taxas são recalculadas sobre as somas, nunca a média das taxas diárias:
 * a média de porcentagens dá peso igual a um dia de 3 cliques e a um de 3.000.
 */
export function totaisDoRedirect(linhas: DiaDoRedirect[]): TotaisDoRedirect {
  const t = { investimento: 0, impressoes: 0, cliquesNoLink: 0, visitasDaPagina: 0, entrou: 0, saiu: 0 };
  for (const l of linhas ?? []) {
    t.investimento += l.investimento;
    t.impressoes += l.impressoes;
    t.cliquesNoLink += l.cliquesNoLink;
    t.visitasDaPagina += l.visitasDaPagina;
    t.entrou += l.entrou;
    t.saiu += l.saiu;
  }
  return {
    ...t,
    saldo: t.entrou - t.saiu,
    custoPorEntrada: t.entrou > 0 ? t.investimento / t.entrou : null,
    taxaCliqueParaPagina: taxa(t.visitasDaPagina, t.cliquesNoLink),
    taxaPaginaParaGrupo: taxa(t.entrou, t.visitasDaPagina),
    taxaCliqueParaGrupo: taxa(t.entrou, t.cliquesNoLink),
  };
}
