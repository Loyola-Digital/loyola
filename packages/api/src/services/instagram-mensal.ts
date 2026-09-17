/**
 * A tabela mensal do orgânico — o consolidado que os experts acompanham.
 *
 * ## O que a API entrega, e como isso vira linha
 *
 * A Graph API do Instagram não tem "relatório do mês": ela responde a uma
 * janela `since/until`. Aqui cada mês vira uma janela, e as métricas soltas que
 * voltam viram uma linha comparável com a do mês anterior.
 *
 * ## FOLLOWER e NON_FOLLOWER
 *
 * O breakdown `follow_type` de `follows_and_unfollows` usa esses dois nomes, e
 * eles não explicam a si mesmos. Conferido ao vivo em @odanilogato numa janela
 * de 7 dias: a série diária de `follower_count` somou 3.109 — exatamente o
 * valor de `FOLLOWER`, enquanto `NON_FOLLOWER` deu 1.663.
 *
 * Portanto: **FOLLOWER = novos seguidores, NON_FOLLOWER = unfollows**, e o
 * crescimento é a diferença. Trocar os dois inverteria o sinal do mês inteiro,
 * e ninguém notaria olhando só a tela.
 *
 * ## O total de seguidores é RECONSTRUÍDO de trás para frente
 *
 * A API só devolve o total de HOJE. O total ao fim de um mês passado sai
 * subtraindo o crescimento de todos os meses posteriores — o que dá a coluna
 * "150 mil / 154 mil / 156 mil" sem precisar de snapshot histórico que ninguém
 * gravou.
 */

export interface EntradaDeInsight {
  name: string;
  period?: string;
  values?: { value: unknown; end_time?: string }[];
  total_value?: {
    /**
     * `Record` porque algumas métricas da Meta devolvem objeto aqui em vez de
     * número. `total()` já trata: só soma o que for `number`, e o resto conta
     * como zero em vez de virar `NaN` no meio da tabela.
     */
    value?: number | Record<string, unknown>;
    breakdowns?: { dimension_keys?: string[]; results?: { dimension_values: string[]; value: number }[] }[];
  };
}

export interface PostDoMes {
  id: string;
  caption?: string | null;
  permalink?: string | null;
  timestamp: string;
  mediaType?: string | null;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  saved?: number | null;
  shares?: number | null;
}

export interface LinhaMensal {
  /** `YYYY-MM`. */
  mes: string;
  seguidoresNoFim: number | null;
  novosSeguidores: number;
  unfollows: number;
  crescimento: number;
  alcance: number;
  views: number;
  interacoes: number;
  /** Interações ÷ alcance, em pontos percentuais. */
  engajamento: number | null;
  posts: number;
  melhorPost: {
    id: string;
    titulo: string;
    permalink: string | null;
    formato: string | null;
    interacoes: number;
    alcance: number;
    engajamento: number | null;
  } | null;
}

/** A variação de cada número em relação ao mês anterior. */
export interface LinhaComVariacao extends LinhaMensal {
  variacao: {
    alcance: number | null;
    views: number | null;
    interacoes: number | null;
    crescimento: number | null;
    /** Em PONTOS percentuais — engajamento já é uma taxa. */
    engajamento: number | null;
  };
}

/** As janelas dos últimos N meses, do mais antigo ao mais recente. */
export function janelasMensais(
  quantos: number,
  hoje: Date,
): { mes: string; inicio: Date; fim: Date }[] {
  const janelas: { mes: string; inicio: Date; fim: Date }[] = [];
  for (let i = quantos - 1; i >= 0; i -= 1) {
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    // O fim é o primeiro instante do mês seguinte: `until` da API é exclusivo,
    // e usar "dia 31 às 23:59" perderia o último dia em mês de 30.
    const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
    janelas.push({
      mes: `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, "0")}`,
      inicio,
      fim,
    });
  }
  return janelas;
}

/**
 * Alcance do período, sem contar a mesma pessoa duas vezes.
 *
 * `reach_total` é o valor ÚNICO que a Meta calcula para a janela; a série
 * diária, somada, infla (1.728.838 contra 1.171.564 em 30 dias de
 * @odanilogato). A soma fica só como reserva, para janela em que a Meta não
 * devolveu o único.
 */
export function alcanceDoPeriodo(insights: EntradaDeInsight[]): number {
  const unico = insights.find((x) => x.name === "reach_total");
  if (typeof unico?.total_value?.value === "number") return unico.total_value.value;
  return total(insights, "reach");
}

/**
 * Interações do período: a soma das partes.
 *
 * `total_interactions` da Meta devolve MAIS do que a soma de curtidas,
 * comentários, salvamentos, compartilhamentos e respostas — 337.700 contra
 * 264.524 nos mesmos 30 dias —, e o app do Instagram mostra a soma (272.857).
 * Ficamos com o que o time consegue conferir no celular.
 */
export function interacoesDoPeriodo(insights: EntradaDeInsight[]): number {
  return (
    total(insights, "likes") +
    total(insights, "comments") +
    total(insights, "saves") +
    total(insights, "shares") +
    total(insights, "replies")
  );
}

export function total(insights: EntradaDeInsight[], nome: string): number {
  const e = insights.find((x) => x.name === nome);
  if (typeof e?.total_value?.value === "number") return e.total_value.value;
  // `reach` vem como série diária: a soma dos dias É o alcance do período.
  if (Array.isArray(e?.values)) {
    return e.values.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
  }
  return 0;
}

export function porTipoDeSeguidor(insights: EntradaDeInsight[]): { novos: number; unfollows: number } {
  const e = insights.find((x) => x.name === "follows_and_unfollows");
  const resultados = e?.total_value?.breakdowns?.[0]?.results ?? [];
  const achar = (chave: string) =>
    resultados.find((r) => r.dimension_values?.[0]?.toUpperCase() === chave)?.value ?? 0;
  return { novos: achar("FOLLOWER"), unfollows: achar("NON_FOLLOWER") };
}

/** Primeira linha da legenda de um post — o resto é hashtag e não identifica. */
export function tituloDoPost(caption: string | null | undefined): string {
  const primeira = (caption ?? "").split("\n").find((l) => l.trim().length > 0) ?? "";
  const limpo = primeira.replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, 90) : "Post sem legenda";
}

function interacoesDoPost(p: PostDoMes): number {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.saved ?? 0) + (p.shares ?? 0);
}

/**
 * O melhor post do mês é o de maior ENGAJAMENTO, não o de maior alcance.
 *
 * Alcance mede quanto o Instagram entregou; engajamento mede o que o conteúdo
 * fez com quem viu. Um post entregue a meio milhão e ignorado não é o melhor do
 * mês — é o mais distribuído. Sem alcance para dividir, cai nas interações
 * absolutas, que é o melhor palpite disponível.
 */
export function melhorPostDoMes(posts: PostDoMes[]): LinhaMensal["melhorPost"] {
  if (posts.length === 0) return null;
  const comTaxa = posts.map((p) => {
    const inter = interacoesDoPost(p);
    const alcance = p.reach ?? 0;
    return { p, inter, alcance, taxa: alcance > 0 ? inter / alcance : null };
  });
  const melhor = [...comTaxa].sort((a, b) => {
    if (a.taxa !== null && b.taxa !== null) return b.taxa - a.taxa;
    if (a.taxa !== null) return -1;
    if (b.taxa !== null) return 1;
    return b.inter - a.inter;
  })[0]!;

  return {
    id: melhor.p.id,
    titulo: tituloDoPost(melhor.p.caption),
    permalink: melhor.p.permalink ?? null,
    formato: melhor.p.mediaType ?? null,
    interacoes: melhor.inter,
    alcance: melhor.alcance,
    engajamento: melhor.taxa === null ? null : Math.round(melhor.taxa * 1000) / 10,
  };
}

export function montarLinha(
  mes: string,
  insights: EntradaDeInsight[],
  posts: PostDoMes[],
): LinhaMensal {
  const { novos, unfollows } = porTipoDeSeguidor(insights);
  const alcance = alcanceDoPeriodo(insights);
  const interacoes = interacoesDoPeriodo(insights);

  return {
    mes,
    // Preenchido depois, por `reconstruirSeguidores` — depende dos meses
    // seguintes, que esta função não conhece.
    seguidoresNoFim: null,
    novosSeguidores: novos,
    unfollows,
    crescimento: novos - unfollows,
    alcance,
    views: total(insights, "views"),
    interacoes,
    // Sobre ALCANCE, não sobre seguidores: é o que o time compara entre meses,
    // e um perfil que cresce diluiria a taxa se o divisor fosse a base.
    engajamento: alcance > 0 ? Math.round((interacoes / alcance) * 1000) / 10 : null,
    posts: posts.length,
    melhorPost: melhorPostDoMes(posts),
  };
}

/**
 * O total de seguidores ao fim de cada mês, a partir do total de hoje.
 *
 * Anda de trás para frente: o fim do último mês é o total atual; cada mês
 * anterior é o seguinte menos o crescimento dele. É o que permite a coluna
 * "seguidores" sem snapshot histórico — que ninguém gravou e não dá para
 * inventar depois.
 */
export function reconstruirSeguidores(linhas: LinhaMensal[], totalHoje: number): LinhaMensal[] {
  const saida = [...linhas];
  let acumulado = totalHoje;
  for (let i = saida.length - 1; i >= 0; i -= 1) {
    saida[i] = { ...saida[i]!, seguidoresNoFim: acumulado };
    acumulado -= saida[i]!.crescimento;
  }
  return saida;
}

function variacao(atual: number, anterior: number): number | null {
  // Sem base de comparação não existe "cresceu X%": qualquer número aqui seria
  // inventado, e um "+100%" a partir do zero engana mais que um traço.
  if (!anterior) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export function comVariacao(linhas: LinhaMensal[]): LinhaComVariacao[] {
  return linhas.map((l, i) => {
    const ant = i > 0 ? linhas[i - 1] : null;
    return {
      ...l,
      variacao: {
        alcance: ant ? variacao(l.alcance, ant.alcance) : null,
        views: ant ? variacao(l.views, ant.views) : null,
        interacoes: ant ? variacao(l.interacoes, ant.interacoes) : null,
        crescimento: ant ? variacao(l.crescimento, ant.crescimento) : null,
        // Engajamento já é taxa: a diferença vai em PONTOS percentuais, porque
        // "subiu 20%" de 4,2% para 5,0% confunde com "subiu para 20%".
        engajamento:
          ant && ant.engajamento !== null && l.engajamento !== null
            ? Math.round((l.engajamento - ant.engajamento) * 10) / 10
            : null,
      },
    };
  });
}
