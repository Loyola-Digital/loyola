/**
 * Análise do período com IA — itens 3 e 13 da lista do Social Orgânico.
 *
 * ## Divisão de trabalho
 *
 * O CÓDIGO calcula tudo: totais, variação sobre o período anterior, médias do
 * perfil, média por formato, quanto cada post ficou acima da média. A IA
 * recebe esses números prontos e só faz a leitura: por que o melhor foi bem,
 * por que o pior foi mal, que padrão aparece. Mesma regra do Spy de Conteúdo
 * — modelo que recalcula erra conta e, pior, erra com convicção.
 *
 * ## O que a IA não vê
 *
 * Não assiste o vídeo nem olha a imagem: lê a legenda e os números. "Gancho"
 * para ela é a primeira linha da legenda somada à retenção dos 3 primeiros
 * segundos que a Meta mede — e o prompt manda dizer isso em vez de fingir que
 * viu o vídeo.
 */

import Anthropic from "@anthropic-ai/sdk";
import { porTipoDeSeguidor, total, type EntradaDeInsight } from "./instagram-mensal.js";

export interface PostParaAnalise {
  id: string;
  caption?: string | null;
  permalink?: string | null;
  timestamp: string;
  media_type?: string | null;
  media_product_type?: string | null;
  like_count?: number | null;
  comments_count?: number | null;
  reach?: number | null;
  views?: number | null;
  saved?: number | null;
  shares?: number | null;
  follows?: number | null;
  skip_rate?: number | null;
  avg_watch_time_ms?: number | null;
}

type Formato = "reels" | "carrossel" | "estatico";

/** Mesma regra do dashboard (`instagram-posts.ts` no web). */
export function formatoDoPost(p: Pick<PostParaAnalise, "media_type" | "media_product_type">): Formato {
  if (p.media_product_type === "REELS" || p.media_type === "VIDEO" || p.media_type === "REEL") return "reels";
  if (p.media_type === "CAROUSEL_ALBUM") return "carrossel";
  return "estatico";
}

const interacoes = (p: PostParaAnalise) =>
  (p.like_count ?? 0) + (p.comments_count ?? 0) + (p.saved ?? 0) + (p.shares ?? 0);

const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

const media = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const pctVs = (valor: number | null | undefined, m: number | null) =>
  valor == null || m == null || m === 0 ? null : Math.round(((valor - m) / m) * 100);

const variacao = (atual: number, anterior: number) =>
  anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null;

function naoSeguidores(insights: EntradaDeInsight[]): number | null {
  const e = insights.find((x) => x.name === "reach_follow_type");
  const res = e?.total_value?.breakdowns?.[0]?.results ?? [];
  const seg = res.find((r) => r.dimension_values?.[0] === "FOLLOWER")?.value ?? 0;
  const nao = res.find((r) => r.dimension_values?.[0] === "NON_FOLLOWER")?.value ?? 0;
  return seg + nao > 0 ? r1((nao / (seg + nao)) * 100) : null;
}

function resumoDoPerfil(insights: EntradaDeInsight[]) {
  const alcance = total(insights, "reach");
  const inter = total(insights, "total_interactions");
  const { novos, unfollows } = porTipoDeSeguidor(insights);
  return {
    alcance,
    views: total(insights, "views"),
    interacoes: inter,
    engajamento_pct: alcance > 0 ? r1((inter / alcance) * 100) : null,
    salvamentos: total(insights, "saves"),
    compartilhamentos: total(insights, "shares"),
    visitas_ao_perfil: total(insights, "profile_views"),
    // `website_clicks` e `profile_links_taps` discordam (3 vs 2.196 em
    // @odanilogato); vale a que tem número, igual à tela.
    cliques_no_link_da_bio: Math.max(
      total(insights, "website_clicks"),
      total(insights, "profile_links_taps"),
    ),
    novos_seguidores: novos,
    unfollows,
    saldo_seguidores: novos - unfollows,
    alcance_de_nao_seguidores_pct: naoSeguidores(insights),
  };
}

/**
 * O pacote que vai para a IA. Tudo número já calculado; a legenda vai
 * cortada — o começo é o gancho, e o fim costuma ser hashtag.
 */
export function montarDadosDaAnalise(input: {
  posts: PostParaAnalise[];
  atual: EntradaDeInsight[];
  anterior: EntradaDeInsight[];
  periodo: { de: string; ate: string };
}) {
  const { posts, atual, anterior, periodo } = input;
  const perfil = resumoDoPerfil(atual);
  const perfilAnterior = resumoDoPerfil(anterior);

  const linhas = posts.map((p) => {
    const alcance = p.reach ?? null;
    return {
      id: p.id,
      formato: formatoDoPost(p),
      data: p.timestamp.slice(0, 10),
      legenda: (p.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
      views: p.views ?? null,
      alcance,
      curtidas: p.like_count ?? null,
      comentarios: p.comments_count ?? null,
      compartilhamentos: p.shares ?? null,
      salvamentos: p.saved ?? null,
      seguidores_gerados: p.follows ?? null,
      engajamento_pct: alcance ? r1((interacoes(p) / alcance) * 100) : null,
      gancho_3s_pct: p.skip_rate == null ? null : r1(100 - p.skip_rate),
      tempo_medio_assistido_s: p.avg_watch_time_ms == null ? null : r1(p.avg_watch_time_ms / 1000),
      conversao_view_em_seguidor_pct:
        p.follows != null && p.views ? Math.round((p.follows / p.views) * 10000) / 100 : null,
    };
  });

  const medias = {
    views: media(linhas.map((l) => l.views)),
    alcance: media(linhas.map((l) => l.alcance)),
    compartilhamentos: media(linhas.map((l) => l.compartilhamentos)),
    salvamentos: media(linhas.map((l) => l.salvamentos)),
    engajamento_pct: media(linhas.map((l) => l.engajamento_pct)),
    gancho_3s_pct: media(linhas.map((l) => l.gancho_3s_pct)),
  };

  const comparados = linhas.map((l) => ({
    ...l,
    vs_media_do_perfil: {
      alcance_pct: pctVs(l.alcance, medias.alcance),
      views_pct: pctVs(l.views, medias.views),
      compartilhamentos_pct: pctVs(l.compartilhamentos, medias.compartilhamentos),
      salvamentos_pct: pctVs(l.salvamentos, medias.salvamentos),
      engajamento_pp:
        l.engajamento_pct == null || medias.engajamento_pct == null
          ? null
          : r1(l.engajamento_pct - medias.engajamento_pct),
    },
  }));

  const formatos: Formato[] = ["reels", "carrossel", "estatico"];
  const porFormato = formatos
    .map((f) => {
      const xs = linhas.filter((l) => l.formato === f);
      const alc = xs.reduce((a, l) => a + (l.alcance ?? 0), 0);
      const doFormato = posts.filter((p) => formatoDoPost(p) === f && (p.reach ?? 0) > 0);
      return {
        formato: f,
        posts: xs.length,
        alcance_medio: r1(media(xs.map((l) => l.alcance))),
        views_media: r1(media(xs.map((l) => l.views))),
        engajamento_pct: alc > 0 ? r1((doFormato.reduce((a, p) => a + interacoes(p), 0) / alc) * 100) : null,
        compartilhamentos_medio: r1(media(xs.map((l) => l.compartilhamentos))),
        salvamentos_por_mil_alcancados:
          alc > 0 ? r1((xs.reduce((a, l) => a + (l.salvamentos ?? 0), 0) / alc) * 1000) : null,
        gancho_3s_medio_pct: r1(media(xs.map((l) => l.gancho_3s_pct))),
        seguidores_gerados: xs.some((l) => l.seguidores_gerados != null)
          ? xs.reduce((a, l) => a + (l.seguidores_gerados ?? 0), 0)
          : null,
      };
    })
    .filter((f) => f.posts > 0);

  const ids = (arr: typeof linhas, campo: keyof (typeof linhas)[number], n: number, asc = false) =>
    arr
      .filter((l) => typeof l[campo] === "number")
      .sort((a, b) => (asc ? 1 : -1) * ((a[campo] as number) - (b[campo] as number)))
      .slice(0, n)
      .map((l) => l.id);

  return {
    periodo,
    perfil,
    variacao_vs_periodo_anterior_pct: {
      alcance: variacao(perfil.alcance, perfilAnterior.alcance),
      views: variacao(perfil.views, perfilAnterior.views),
      interacoes: variacao(perfil.interacoes, perfilAnterior.interacoes),
      engajamento_pp:
        perfil.engajamento_pct == null || perfilAnterior.engajamento_pct == null
          ? null
          : r1(perfil.engajamento_pct - perfilAnterior.engajamento_pct),
      saldo_seguidores_anterior: perfilAnterior.saldo_seguidores,
    },
    medias_do_perfil_por_post: Object.fromEntries(Object.entries(medias).map(([k, v]) => [k, r1(v)])),
    por_formato: porFormato,
    rankings: {
      maior_engajamento: ids(linhas, "engajamento_pct", 5),
      menor_engajamento: ids(linhas, "engajamento_pct", 5, true),
      maior_alcance: ids(linhas, "alcance", 3),
      mais_compartilhados: ids(linhas, "compartilhamentos", 3),
      mais_seguidores: ids(linhas, "seguidores_gerados", 3),
    },
    posts: comparados,
  };
}

export type DadosDaAnalise = ReturnType<typeof montarDadosDaAnalise>;

export interface AnaliseDoPeriodo {
  insights: { titulo: string; explicacao: string }[];
  melhores: { post_id: string; por_que: string; fatores: string[] }[];
  piores: { post_id: string; por_que: string; fatores: string[] }[];
  padroes: string[];
}

const DESTAQUE = {
  type: "object",
  additionalProperties: false,
  required: ["post_id", "por_que", "fatores"],
  properties: {
    post_id: { type: "string", description: "O `id` exato de um post da lista recebida." },
    por_que: {
      type: "string",
      description: "Duas ou três frases: o motivo provável do resultado, citando os números do post.",
    },
    fatores: {
      type: "array",
      items: { type: "string" },
      description: "De 1 a 4 fatores curtos, ex.: gancho, tema, formato, retenção, CTA, compartilhamentos.",
    },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insights", "melhores", "piores", "padroes"],
  properties: {
    insights: {
      type: "array",
      description: "De 3 a 5 conclusões que cruzam os dados e mudam decisão.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "explicacao"],
        properties: {
          titulo: { type: "string", description: "Uma frase com o número que sustenta a conclusão." },
          explicacao: { type: "string", description: "Uma ou duas frases: o que isso significa e o que fazer." },
        },
      },
    },
    melhores: { type: "array", items: DESTAQUE, description: "Até 3 posts de melhor performance." },
    piores: { type: "array", items: DESTAQUE, description: "Até 3 posts de pior performance." },
    padroes: {
      type: "array",
      items: { type: "string" },
      description: "Até 5 padrões do tipo \"vídeos sobre X tiveram performance acima da média\".",
    },
  },
} as const;

const SISTEMA = `Você é analista de conteúdo orgânico de Instagram de uma agência de marketing digital brasileira.

Recebe os números de um perfil num período — já calculados. Sua tarefa é a LEITURA deles.

Regras:
- Nunca calcule nem invente número. Cite apenas números presentes nos dados (inclusive os de "vs_media_do_perfil" e "variacao_vs_periodo_anterior_pct").
- Você não viu os vídeos nem as imagens: só a legenda e as métricas. Quando falar de gancho, baseie-se na primeira frase da legenda e no "gancho_3s_pct" (quanto das visualizações passou dos 3 primeiros segundos). Não descreva cena, fala ou edição.
- "seguidores_gerados" só existe para foto e carrossel; null em Reels não é zero.
- Um insight bom cruza duas coisas (ex.: alcance subiu mas conversão em seguidor caiu; carrossel alcança menos mas é mais salvo). Evite obviedades como "posts com mais alcance tiveram mais views".
- Melhores e piores: use os rankings como ponto de partida, mas escolha pelo desempenho geral; se houver menos de 4 posts, pode deixar "piores" vazio.
- Nos textos (insights, por_que, padroes) NUNCA escreva o id numérico de um post: quem lê não sabe o que é. Refira-se ao post pelo tema ou pela primeira frase da legenda (ex.: "o post do dilema do trem"). O id vai só no campo post_id.
- Português do Brasil, direto, sem jargão.`;

export async function analisarComIa(apiKey: string, dados: DadosDaAnalise): Promise<AnaliseDoPeriodo> {
  const client = new Anthropic({ apiKey });
  // Stream porque, com raciocínio, a resposta pode passar do timeout HTTP do SDK.
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SISTEMA,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: `Dados do período (JSON):\n\n${JSON.stringify(dados)}`,
      },
    ],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("A análise foi recusada pelo modelo.");
  if (msg.stop_reason === "max_tokens") throw new Error("A resposta do modelo foi cortada.");
  const texto = msg.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("O modelo não devolveu texto.");
  return limparAnalise(JSON.parse(texto.text) as AnaliseDoPeriodo, new Set(dados.posts.map((p) => p.id)));
}

/**
 * Descarta destaque que aponta para post que não existe na lista — um id
 * inventado viraria um card sem thumb nem link na tela.
 */
export function limparAnalise(a: AnaliseDoPeriodo, ids: Set<string>): AnaliseDoPeriodo {
  const valido = (d: { post_id: string }) => ids.has(d.post_id);
  return {
    insights: (a.insights ?? []).slice(0, 5),
    melhores: (a.melhores ?? []).filter(valido).slice(0, 3),
    piores: (a.piores ?? []).filter(valido).slice(0, 3),
    padroes: (a.padroes ?? []).slice(0, 5),
  };
}
