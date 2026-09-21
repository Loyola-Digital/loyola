/**
 * As séries que o gráfico do perfil sabe desenhar.
 *
 * ## Por que só duas métricas no diário
 *
 * Medido na Graph API (17/09/2026, @odanilogato): das nove métricas testadas,
 * só `reach` e `follower_count` devolvem série diária. `views`,
 * `profile_views`, `website_clicks`, `total_interactions` e `likes` voltam
 * VAZIAS quando pedidas como série — a Meta só as entrega como total do
 * período. Oferecer um botão que desenha uma linha reta em zero seria pior que
 * não oferecer.
 *
 * O mensal não tem essa limitação: ele vem da tabela mensal, onde cada mês já
 * é um total.
 */

export interface PontoDaSerie {
  /** Rótulo do eixo — "12/09" no diário, "Set/26" no mensal. */
  rotulo: string;
  valor: number;
  /** `end_time` da Meta (fim da janela do dia). Só no diário. */
  fim?: string;
}

export interface MetricaDoGrafico {
  chave: string;
  rotulo: string;
  dica: string;
  cor: string;
  /** Barra para contagem por mês; linha para o dia a dia. */
  barra?: boolean;
}

export const METRICAS_DIARIAS: MetricaDoGrafico[] = [
  {
    chave: "reach",
    rotulo: "Alcance",
    dica: "Contas únicas alcançadas no dia.",
    cor: "#d4a843",
  },
  {
    chave: "follower_count",
    rotulo: "Novos seguidores",
    dica: "Contas que começaram a seguir naquele dia. É o número BRUTO: quem deixou de seguir não é descontado (a Meta não dá unfollow por dia).",
    cor: "#22c55e",
  },
];

export const METRICAS_MENSAIS: MetricaDoGrafico[] = [
  { chave: "alcance", rotulo: "Alcance", dica: "Contas únicas alcançadas no mês.", cor: "#d4a843", barra: true },
  { chave: "views", rotulo: "Views", dica: "Visualizações do conteúdo no mês, contando repetições.", cor: "#60a5fa", barra: true },
  { chave: "interacoes", rotulo: "Interações", dica: "Curtidas, comentários, salvamentos e compartilhamentos do mês.", cor: "#f472b6", barra: true },
  { chave: "novosSeguidores", rotulo: "Novos seguidores", dica: "Contas que começaram a seguir no mês.", cor: "#22c55e", barra: true },
  { chave: "unfollows", rotulo: "Unfollows", dica: "Contas que deixaram de seguir no mês.", cor: "#ef4444", barra: true },
  { chave: "crescimento", rotulo: "Saldo", dica: "Novos seguidores menos unfollows. Barra abaixo do zero é mês em que o perfil encolheu.", cor: "#a855f7", barra: true },
  { chave: "seguidoresNoFim", rotulo: "Seguidores", dica: "Total de seguidores no fim de cada mês — a curva de crescimento do perfil.", cor: "#38bdf8" },
  { chave: "posts", rotulo: "Publicações", dica: "Quantos posts saíram no mês.", cor: "#94a3b8", barra: true },
];

interface EntradaDeInsight {
  name: string;
  values?: { value: unknown; end_time?: string }[];
}

/** A série diária de uma métrica, pronta para o gráfico. */
export function serieDiaria(
  entries: EntradaDeInsight[] | undefined,
  chave: string,
): PontoDaSerie[] {
  const e = entries?.find((x) => x.name === chave && Array.isArray(x.values) && x.values.length > 0);
  if (!e?.values) return [];
  return e.values.map((v) => {
    const fim = v.end_time ?? "";
    // "2026-09-12T07:00:00+0000" → "12/09". Fatiar a string evita o fuso do
    // navegador empurrar o ponto para o dia anterior.
    const rotulo = fim ? `${fim.slice(8, 10)}/${fim.slice(5, 7)}` : "";
    return { rotulo, fim, valor: typeof v.value === "number" ? v.value : 0 };
  });
}

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** A série mensal, do mês mais antigo para o mais novo (o tempo anda para a direita). */
export function serieMensal(
  meses: Record<string, unknown>[] | undefined,
  chave: string,
): PontoDaSerie[] {
  return (meses ?? [])
    // Mês sem dado (ou métrica que a Meta ainda não tinha) fica FORA do
    // gráfico: desenhado como zero, parecia um mês em que o perfil morreu.
    .filter((m) => !m.semDados && typeof m[chave] === "number")
    .map((m) => {
      const mes = String(m.mes ?? "");
      const [ano, n] = mes.split("-");
      const v = m[chave];
      return {
        rotulo: `${MESES_CURTOS[Number(n) - 1] ?? mes}/${String(ano).slice(2)}`,
        valor: typeof v === "number" ? v : 0,
      };
    })
    .filter((p) => p.rotulo !== "");
}
