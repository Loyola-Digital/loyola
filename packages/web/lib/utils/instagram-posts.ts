/**
 * As contas do dashboard orgânico do Instagram — sem React, para dar teste.
 *
 * Tudo aqui parte da lista de posts que a API já enriquece com insights
 * (`getMediaList`): alcance, views, salvamentos, compartilhamentos e, só em
 * foto/carrossel, seguidores gerados. Nenhuma chamada nova à Meta.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";

export type Formato = "reels" | "carrossel" | "estatico";

export const NOME_DO_FORMATO: Record<Formato, string> = {
  reels: "Reels",
  carrossel: "Carrossel",
  estatico: "Estático",
};

/**
 * `media_product_type` REELS manda; sem ele, VIDEO conta como Reels — desde
 * 2022 todo vídeo publicado no feed vira Reels.
 */
export function formatoDoPost(p: Pick<InstagramMedia, "media_type" | "media_product_type">): Formato {
  if (p.media_product_type === "REELS" || p.media_type === "VIDEO" || p.media_type === "REEL") {
    return "reels";
  }
  if (p.media_type === "CAROUSEL_ALBUM") return "carrossel";
  return "estatico";
}

/** Interações do post — a mesma conta da API e da tabela mensal. */
export function interacoesDoPost(p: InstagramMedia): number {
  return (p.like_count ?? 0) + (p.comments_count ?? 0) + (p.saved ?? 0) + (p.shares ?? 0);
}

export type ChaveDaMetrica =
  | "views"
  | "reach"
  | "like_count"
  | "comments_count"
  | "shares"
  | "saved"
  | "follows"
  | "conversao"
  | "engagement_rate";

export interface MetricaDoPost {
  chave: ChaveDaMetrica;
  rotulo: string;
  /** O que é e como sai — vai no tooltip do cabeçalho. */
  dica: string;
  valor: (p: InstagramMedia) => number | null;
  /** Taxa em %: compara com a média em PONTOS, não em %. */
  taxa?: boolean;
}

/** Seguidores gerados ÷ views, em %. Só existe onde a Meta dá seguidores. */
export function conversaoEmSeguidor(p: InstagramMedia): number | null {
  if (p.follows == null || !p.views) return null;
  return (p.follows / p.views) * 100;
}

export const METRICAS_DO_POST: MetricaDoPost[] = [
  {
    chave: "views",
    rotulo: "Views",
    dica: "Visualizações: quantas vezes o conteúdo foi exibido, contando repetições da mesma pessoa.",
    valor: (p) => p.views ?? null,
  },
  {
    chave: "reach",
    rotulo: "Alcance",
    dica: "Contas únicas que viram o post pelo menos uma vez.",
    valor: (p) => p.reach ?? null,
  },
  {
    chave: "like_count",
    rotulo: "Curtidas",
    dica: "Curtidas no post.",
    valor: (p) => p.like_count ?? null,
  },
  {
    chave: "comments_count",
    rotulo: "Coment.",
    dica: "Comentários no post.",
    valor: (p) => p.comments_count ?? null,
  },
  {
    chave: "shares",
    rotulo: "Compart.",
    dica: "Compartilhamentos: quantas vezes o post foi enviado por direct ou repostado no story.",
    valor: (p) => p.shares ?? null,
  },
  {
    chave: "saved",
    rotulo: "Salvos",
    dica: "Quantas pessoas salvaram o post.",
    valor: (p) => p.saved ?? null,
  },
  {
    chave: "follows",
    rotulo: "Seguidores",
    dica: "Seguidores que começaram a seguir o perfil a partir deste post. A Meta só entrega esse dado para foto e carrossel — em Reels aparece \"—\".",
    valor: (p) => p.follows ?? null,
  },
  {
    chave: "conversao",
    rotulo: "Conv. seguidor",
    dica: "Conversão de visualização em seguidor = seguidores gerados ÷ views × 100. Ex.: 100 mil views e 1.200 seguidores = 1,2%. Só foto e carrossel (a Meta não dá seguidores por Reels).",
    valor: conversaoEmSeguidor,
    taxa: true,
  },
  {
    chave: "engagement_rate",
    rotulo: "Engajamento",
    dica: "Taxa de engajamento = (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance × 100. Mesma conta da tabela mensal.",
    valor: (p) => p.engagement_rate ?? null,
    taxa: true,
  },
];

/**
 * Média de cada métrica entre os posts que TÊM o dado.
 *
 * Post sem o número não entra nem como zero: um Reels sem "seguidores" (a Meta
 * não dá) puxaria a média de seguidores dos carrosséis para baixo.
 */
export function mediasDoPerfil(posts: InstagramMedia[]): Record<ChaveDaMetrica, number | null> {
  const out = {} as Record<ChaveDaMetrica, number | null>;
  for (const m of METRICAS_DO_POST) {
    const valores = posts.map(m.valor).filter((v): v is number => v != null);
    out[m.chave] = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
  }
  return out;
}

/**
 * Quanto o post ficou acima ou abaixo da média do perfil.
 *
 * Contagem: variação em %. Taxa: diferença em pontos percentuais — "+21%" de
 * 4,2% para 5,1% se confundiria com a própria taxa. Média zero ou ausente não
 * vira "+100%": vira null.
 */
export function vsMedia(valor: number | null, media: number | null, taxa = false): number | null {
  if (valor == null || media == null) return null;
  if (taxa) return valor - media;
  if (media === 0) return null;
  return ((valor - media) / media) * 100;
}

export interface LinhaDoFormato {
  formato: Formato;
  posts: number;
  viewsMedia: number | null;
  alcanceMedio: number | null;
  /** Soma das interações ÷ soma do alcance — não a média das taxas. */
  engajamento: number | null;
  compartMedio: number | null;
  salvosMedio: number | null;
  /** Soma dos seguidores gerados; null quando nenhum post do formato tem o dado. */
  seguidores: number | null;
  /** Salvamentos por mil contas alcançadas — compara formatos de alcance diferente. */
  salvosPorMil: number | null;
}

const media = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function performancePorFormato(posts: InstagramMedia[]): LinhaDoFormato[] {
  const ordem: Formato[] = ["reels", "carrossel", "estatico"];
  return ordem
    .map((formato) => {
      const doFormato = posts.filter((p) => formatoDoPost(p) === formato);
      const comAlcance = doFormato.filter((p) => (p.reach ?? 0) > 0);
      const alcanceTotal = comAlcance.reduce((a, p) => a + (p.reach ?? 0), 0);
      const interacoes = comAlcance.reduce((a, p) => a + interacoesDoPost(p), 0);
      const salvos = comAlcance.reduce((a, p) => a + (p.saved ?? 0), 0);
      const comSeguidores = doFormato.filter((p) => p.follows != null);
      return {
        formato,
        posts: doFormato.length,
        viewsMedia: media(doFormato.map((p) => p.views)),
        alcanceMedio: media(doFormato.map((p) => p.reach)),
        engajamento: alcanceTotal > 0 ? (interacoes / alcanceTotal) * 100 : null,
        compartMedio: media(doFormato.map((p) => p.shares)),
        salvosMedio: media(doFormato.map((p) => p.saved)),
        seguidores: comSeguidores.length
          ? comSeguidores.reduce((a, p) => a + (p.follows ?? 0), 0)
          : null,
        salvosPorMil: alcanceTotal > 0 ? (salvos / alcanceTotal) * 1000 : null,
      };
    })
    .filter((l) => l.posts > 0);
}

/**
 * As frases que resumem a comparação — "carrosséis engajaram mais, Reels
 * alcançaram mais". Só compara quando há pelo menos dois formatos com dado:
 * "o único formato foi o melhor" não diz nada.
 */
export function conclusoesDosFormatos(linhas: LinhaDoFormato[]): string[] {
  const frases: string[] = [];
  const lider = (campo: keyof LinhaDoFormato) => {
    const comDado = linhas.filter((l) => typeof l[campo] === "number");
    if (comDado.length < 2) return null;
    return [...comDado].sort((a, b) => (b[campo] as number) - (a[campo] as number));
  };
  const nome = (l: LinhaDoFormato) => NOME_DO_FORMATO[l.formato];
  const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

  const eng = lider("engajamento");
  if (eng) frases.push(`${nome(eng[0]!)} teve o maior engajamento (${pct(eng[0]!.engajamento!)}).`);

  const alc = lider("alcanceMedio");
  if (alc) {
    const x = alc[1]!.alcanceMedio! > 0 ? alc[0]!.alcanceMedio! / alc[1]!.alcanceMedio! : null;
    frases.push(
      `${nome(alc[0]!)} teve o maior alcance médio${x && x >= 1.1 ? ` (${x.toFixed(1).replace(".", ",")}x ${nome(alc[1]!)})` : ""}.`,
    );
  }

  const sal = lider("salvosPorMil");
  if (sal && sal[0]!.formato !== eng?.[0]?.formato) {
    frases.push(`${nome(sal[0]!)} foi o mais salvo proporcionalmente ao alcance.`);
  }

  const seg = lider("seguidores");
  if (seg && seg[0]!.seguidores! > 0) {
    frases.push(`${nome(seg[0]!)} trouxe mais seguidores (Reels não entram: a Meta não informa).`);
  }
  return frases;
}

/**
 * Os posts que podem ter puxado um ponto do gráfico de alcance diário.
 *
 * O alcance do perfil não diz de qual post veio. O melhor palpite são os posts
 * publicados nas 72h que terminam naquele ponto — um Reels continua sendo
 * entregue nos dias seguintes à publicação — ordenados pelo alcance de cada um.
 *
 * `fimDoDia` é o `end_time` da Meta, que marca o FIM da janela do dia.
 */
export function postsDoPico(posts: InstagramMedia[], fimDoDia: string, horas = 72): InstagramMedia[] {
  const fim = new Date(fimDoDia).getTime();
  if (isNaN(fim)) return [];
  const inicio = fim - horas * 3_600_000;
  return posts
    .filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return t >= inicio && t < fim;
    })
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
}

/** Os N dias de maior alcance — marcados no gráfico como picos. */
export function diasDePico(pontos: { reach: number }[], n = 3): Set<number> {
  return new Set(
    pontos
      .map((p, i) => ({ i, r: p.reach }))
      .filter((x) => x.r > 0)
      .sort((a, b) => b.r - a.r)
      .slice(0, n)
      .map((x) => x.i),
  );
}

/** Variação % sobre o período anterior. Base zero ou ausente → null, nunca +100%. */
export function variacao(atual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function postsNoPeriodo(posts: InstagramMedia[], since: number, until: number): InstagramMedia[] {
  return posts.filter((p) => {
    const ts = Math.floor(new Date(p.timestamp).getTime() / 1000);
    return ts >= since && ts <= until;
  });
}
