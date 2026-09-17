/**
 * A leitura da IA sobre UM post.
 *
 * ## Diferente da análise do período
 *
 * A do período (`instagram-analise-ia.ts`) responde "como foi o mês". Esta
 * responde "por que ESTE post foi bem ou mal" — e a pergunta só faz sentido
 * contra a régua do próprio perfil: 60 mil de alcance é ótimo num perfil de 20
 * mil seguidores e fraco num de 900 mil. Por isso o pacote leva sempre o post
 * E a média dos posts recentes da conta.
 *
 * ## O que a IA não vê
 *
 * O vídeo e a imagem, de novo: ela lê legenda e números. "Gancho" aqui é a
 * primeira frase da legenda somada à retenção dos 3 primeiros segundos que a
 * Meta mede (`reels_skip_rate`). O prompt proíbe descrever cena.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface PostParaLeitura {
  id: string;
  caption?: string | null;
  postedAt: Date;
  mediaType?: string | null;
  mediaProductType?: string | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  reach?: number | null;
  views?: number | null;
  saved?: number | null;
  shares?: number | null;
  follows?: number | null;
  followsManual?: number | null;
  skipRate?: number | null;
  avgWatchTimeMs?: number | null;
}

const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

const media = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const pct = (valor: number | null | undefined, m: number | null) =>
  valor == null || m == null || m === 0 ? null : Math.round(((valor - m) / m) * 100);

const interacoes = (p: PostParaLeitura) =>
  (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.saved ?? 0) + (p.shares ?? 0);

const engajamento = (p: PostParaLeitura) =>
  p.reach && p.reach > 0 ? r1((interacoes(p) / p.reach) * 100) : null;

const gancho = (p: PostParaLeitura) => (p.skipRate == null ? null : r1(100 - Number(p.skipRate)));

const seguidores = (p: PostParaLeitura) => p.follows ?? p.followsManual ?? null;

function formato(p: PostParaLeitura): "reels" | "carrossel" | "estatico" {
  if (p.mediaProductType === "REELS" || p.mediaType === "VIDEO" || p.mediaType === "REEL") return "reels";
  if (p.mediaType === "CAROUSEL_ALBUM") return "carrossel";
  return "estatico";
}

/**
 * O pacote que vai para a IA: o post, a régua do perfil e a distância entre os
 * dois — tudo já calculado aqui.
 *
 * `referencia` são os posts recentes da conta (o mesmo que a tela usa como
 * média). Os do MESMO formato entram numa segunda régua: comparar um carrossel
 * com a média dos Reels diria mais sobre o formato do que sobre o post.
 */
export function montarDadosDoPost(post: PostParaLeitura, referencia: PostParaLeitura[]) {
  const doFormato = referencia.filter((p) => formato(p) === formato(post));
  const regua = (xs: PostParaLeitura[]) => ({
    posts: xs.length,
    views: r1(media(xs.map((p) => p.views))),
    alcance: r1(media(xs.map((p) => p.reach))),
    compartilhamentos: r1(media(xs.map((p) => p.shares))),
    salvamentos: r1(media(xs.map((p) => p.saved))),
    engajamento_pct: r1(media(xs.map(engajamento))),
    gancho_3s_pct: r1(media(xs.map(gancho))),
    seguidores: r1(media(xs.map(seguidores))),
  });
  const perfil = regua(referencia);
  const mesmoFormato = regua(doFormato);

  return {
    post: {
      id: post.id,
      formato: formato(post),
      data: post.postedAt.toISOString().slice(0, 10),
      legenda: (post.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
      views: post.views ?? null,
      alcance: post.reach ?? null,
      curtidas: post.likeCount ?? null,
      comentarios: post.commentsCount ?? null,
      compartilhamentos: post.shares ?? null,
      salvamentos: post.saved ?? null,
      seguidores_gerados: seguidores(post),
      engajamento_pct: engajamento(post),
      gancho_3s_pct: gancho(post),
      tempo_medio_assistido_s: post.avgWatchTimeMs == null ? null : r1(post.avgWatchTimeMs / 1000),
    },
    media_do_perfil: perfil,
    media_do_mesmo_formato: mesmoFormato,
    vs_media_do_perfil_pct: {
      views: pct(post.views, perfil.views),
      alcance: pct(post.reach, perfil.alcance),
      compartilhamentos: pct(post.shares, perfil.compartilhamentos),
      salvamentos: pct(post.saved, perfil.salvamentos),
      seguidores: pct(seguidores(post), perfil.seguidores),
      engajamento_pp:
        engajamento(post) == null || perfil.engajamento_pct == null
          ? null
          : r1(engajamento(post)! - perfil.engajamento_pct),
      gancho_pp:
        gancho(post) == null || perfil.gancho_3s_pct == null
          ? null
          : r1(gancho(post)! - perfil.gancho_3s_pct),
    },
  };
}

export type DadosDoPost = ReturnType<typeof montarDadosDoPost>;

export interface AnaliseDoPost {
  veredito: "bom" | "mediano" | "ruim";
  por_que: string;
  fatores: { nome: string; leitura: string }[];
  recomendacoes: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["veredito", "por_que", "fatores", "recomendacoes"],
  properties: {
    veredito: {
      type: "string",
      enum: ["bom", "mediano", "ruim"],
      description: "Comparado com a média do próprio perfil, não com o mercado.",
    },
    por_que: {
      type: "string",
      description: "Duas a quatro frases explicando o resultado, citando os números recebidos.",
    },
    fatores: {
      type: "array",
      description: "De 2 a 5 fatores que explicam o resultado.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "leitura"],
        properties: {
          nome: { type: "string", description: "Curto: gancho, tema, formato, retenção, CTA, compartilhamento." },
          leitura: { type: "string", description: "Uma frase sobre o que esse fator fez neste post." },
        },
      },
    },
    recomendacoes: {
      type: "array",
      items: { type: "string" },
      description: "De 1 a 3 ações concretas para o próximo post, tiradas deste caso.",
    },
  },
} as const;

const SISTEMA = `Você é analista de conteúdo orgânico de Instagram de uma agência brasileira.

Recebe UM post com os números já calculados e a média do perfil (geral e do mesmo formato). Sua tarefa é explicar por que ele foi bem ou mal.

Regras:
- Nunca calcule nem invente número. Use só os que estão no pacote, inclusive os campos "vs_media_do_perfil_pct".
- Bom/mediano/ruim é contra a régua do PRÓPRIO perfil. Um post com 60 mil de alcance pode ser ótimo ou fraco dependendo da média.
- Você não viu o vídeo nem a imagem: só a legenda e as métricas. Ao falar de gancho, use a primeira frase da legenda e o "gancho_3s_pct" (quanto das visualizações passou dos 3 primeiros segundos). Não descreva cena, fala, corte ou trilha.
- "seguidores_gerados" null não é zero: a Meta não entrega esse número em Reels.
- Separe distribuição (alcance, views) de reação (engajamento, compartilhamento, salvamento). Um post pode ir mal por não ter sido entregue e outro por ter sido entregue e ignorado — e a ação é diferente.
- Português do Brasil, direto, sem jargão. Nada de "engajar a audiência" ou "conteúdo de valor".`;

export async function analisarPostComIa(apiKey: string, dados: DadosDoPost): Promise<AnaliseDoPost> {
  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SISTEMA,
    thinking: { type: "adaptive" },
    output_config: {
      // Um post é bem menos material que o período inteiro: "low" responde em
      // poucos segundos e a leitura não perde nada.
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: `Post (JSON):\n\n${JSON.stringify(dados)}` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("A análise foi recusada pelo modelo.");
  if (msg.stop_reason === "max_tokens") throw new Error("A resposta do modelo foi cortada.");
  const texto = msg.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("O modelo não devolveu texto.");
  const a = JSON.parse(texto.text) as AnaliseDoPost;
  return {
    veredito: a.veredito,
    por_que: a.por_que,
    fatores: (a.fatores ?? []).slice(0, 5),
    recomendacoes: (a.recomendacoes ?? []).slice(0, 3),
  };
}
