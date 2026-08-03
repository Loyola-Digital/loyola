/**
 * Spy de Conteúdo — diagnóstico qualitativo do perfil via Claude.
 *
 * O modelo recebe as MÉTRICAS JÁ CALCULADAS (metrics.ts) e só faz a leitura
 * qualitativa em cima delas — não recalcula nem inventa número. Structured
 * output garante o shape de volta. Portado de `src/analyzer.js` do CLI.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ScanAnalysis, ScanMetrics, ScanPost, ScanProfile, ScanUsage } from "./types.js";

const MAX_CAPTION_CHARS = 700;
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_EFFORT = "high";

/**
 * Schema do JSON que a Claude precisa devolver. Structured outputs exige
 * `additionalProperties: false` e `required` completo em TODO objeto.
 */
const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "resumo_executivo",
    "nicho",
    "publico_alvo",
    "posicionamento",
    "pilares_conteudo",
    "estrategia",
    "insights_conteudo",
    "teses_centrais",
    "pontos_fortes",
    "oportunidades",
    "playbook",
    "resposta_ao_foco",
  ],
  properties: {
    resumo_executivo: {
      type: "string",
      description: "Dois ou três parágrafos: quem é esse perfil, o que faz e como joga.",
    },
    nicho: {
      type: "object",
      additionalProperties: false,
      required: ["principal", "subnichos", "justificativa"],
      properties: {
        principal: { type: "string", description: "O nicho em uma frase curta." },
        subnichos: { type: "array", items: { type: "string" } },
        justificativa: {
          type: "string",
          description: "Evidências concretas dos posts que sustentam essa classificação.",
        },
      },
    },
    publico_alvo: {
      type: "object",
      additionalProperties: false,
      required: ["descricao", "dores", "desejos"],
      properties: {
        descricao: { type: "string" },
        dores: { type: "array", items: { type: "string" } },
        desejos: { type: "array", items: { type: "string" } },
      },
    },
    posicionamento: {
      type: "string",
      description: "Como o perfil se diferencia de outros no mesmo nicho.",
    },
    pilares_conteudo: {
      type: "array",
      description: "Os 3 a 6 temas recorrentes que estruturam o conteúdo.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "descricao", "peso_estimado", "exemplos"],
        properties: {
          nome: { type: "string" },
          descricao: { type: "string" },
          peso_estimado: {
            type: "integer",
            description: "Percentual estimado do conteúdo (0-100). A soma dos pilares deve dar ~100.",
          },
          exemplos: {
            type: "array",
            description: "URLs de posts desta lista que exemplificam o pilar.",
            items: { type: "string" },
          },
        },
      },
    },
    estrategia: {
      type: "object",
      additionalProperties: false,
      required: [
        "formato_dominante",
        "padroes_de_gancho",
        "estrutura_narrativa",
        "cta_predominante",
        "tom_de_voz",
        "uso_de_hashtags",
        "cadencia",
      ],
      properties: {
        formato_dominante: { type: "string" },
        padroes_de_gancho: {
          type: "array",
          description: "Padrões concretos de abertura observados nas legendas.",
          items: { type: "string" },
        },
        estrutura_narrativa: { type: "string" },
        cta_predominante: { type: "string" },
        tom_de_voz: { type: "string" },
        uso_de_hashtags: { type: "string" },
        cadencia: { type: "string" },
      },
    },
    insights_conteudo: {
      type: "array",
      description:
        "Os principais insights que a pessoa entrega nos vídeos/posts. Um item por post relevante, priorizando Reels e os posts de maior engajamento.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_url", "formato", "tema", "insight", "gancho", "por_que_performou"],
        properties: {
          post_url: { type: "string" },
          formato: { type: "string" },
          tema: { type: "string" },
          insight: {
            type: "string",
            description: "A ideia central que o conteúdo entrega, em 1-2 frases diretas.",
          },
          gancho: { type: "string", description: "Como o conteúdo abre / prende atenção." },
          por_que_performou: {
            type: "string",
            description: "Hipótese ancorada nos números reais desse post frente à média do perfil.",
          },
        },
      },
    },
    teses_centrais: {
      type: "array",
      description: "As crenças/ideias que a pessoa defende de forma recorrente.",
      items: { type: "string" },
    },
    pontos_fortes: { type: "array", items: { type: "string" } },
    oportunidades: {
      type: "array",
      description: "Lacunas e oportunidades observadas, com base nos dados.",
      items: { type: "string" },
    },
    playbook: {
      type: "array",
      description: "O que é replicável dessa estratégia, de forma acionável.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "como_aplicar"],
        properties: {
          titulo: { type: "string" },
          como_aplicar: { type: "string" },
        },
      },
    },
    resposta_ao_foco: {
      type: ["string", "null"],
      description:
        "Quando o usuário fez uma pergunta específica sobre o perfil, a resposta direta a ela, ancorada nos dados. null quando não houve pergunta.",
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é um estrategista de conteúdo sênior especializado em Instagram. Recebe o dump completo de um perfil (bio, métricas já calculadas e as legendas de cada publicação) e produz um diagnóstico de nicho, posicionamento e estratégia.

Regras:
- Escreva em português do Brasil, direto e sem enrolação. Nada de linguagem de consultoria genérica ("engajar a audiência", "criar conexão") — seja específico ao que os dados mostram.
- Toda afirmação precisa estar ancorada em evidência: cite números reais, trechos de legenda ou URLs de posts que estão nos dados. Se algo não dá para afirmar com os dados disponíveis, diga que não dá.
- As métricas numéricas já vêm calculadas no bloco METRICAS. Use-as como estão; não recalcule nem invente números.
- Em "insights_conteudo", o objetivo é: alguém lê essa seção e sabe exatamente o que a pessoa ensina nos vídeos, sem assistir a nenhum. Extraia a ideia central de cada conteúdo, não uma descrição do que aparece na tela.
- Só use URLs de posts que existem na lista fornecida.
- Você só tem acesso ao texto das legendas, não ao áudio ou ao vídeo. Quando o insight for inferido da legenda e não do conteúdo em si, deixe isso explícito.`;

function compactPosts(posts: ScanPost[], mediaEngajamento: number) {
  return posts.map((p) => {
    const eng = (p.likesCount ?? 0) + (p.commentsCount ?? 0);
    const vsMedia = mediaEngajamento > 0 ? +(eng / mediaEngajamento).toFixed(2) : null;
    const caption =
      p.caption.length > MAX_CAPTION_CHARS
        ? `${p.caption.slice(0, MAX_CAPTION_CHARS)}… [truncado]`
        : p.caption;

    return {
      url: p.url,
      data: p.timestamp?.slice(0, 10) ?? null,
      formato: p.formato,
      legenda: caption,
      hashtags: p.hashtags,
      curtidas: p.likesCount,
      comentarios: p.commentsCount,
      views: p.videoViewCount,
      duracao_seg: p.videoDuration ? Math.round(p.videoDuration) : null,
      engajamento: eng,
      vs_media_do_perfil: vsMedia,
      patrocinado: p.isSponsored || undefined,
    };
  });
}

function buildUserPrompt(
  profile: ScanProfile,
  metrics: ScanMetrics,
  posts: ScanPost[],
  focus?: string | null,
): string {
  const payload = {
    PERFIL: {
      username: profile.username,
      nome: profile.fullName,
      bio: profile.biography,
      categoria: profile.businessCategoryName,
      link_externo: profile.externalUrl,
      seguidores: profile.followersCount,
      seguindo: profile.followsCount,
      publicacoes_totais: profile.postsCount,
      verificado: profile.verified,
      conta_business: profile.isBusinessAccount,
    },
    METRICAS: {
      janela: metrics.janela,
      totais: metrics.totais,
      frequencia: metrics.frequencia,
      engajamento: metrics.engajamento,
      reels: metrics.reels,
      formatos: metrics.formatos,
      top_hashtags: metrics.hashtags,
      por_dia_da_semana: metrics.porDiaSemana,
      por_faixa_de_horario: metrics.porFaixaHorario,
      por_mes: metrics.porMes,
      legenda: metrics.legenda,
      observacao_fuso: `Dia e horário calculados em UTC${metrics.tzOffset >= 0 ? "+" : ""}${metrics.tzOffset}.`,
    },
    PUBLICACOES: compactPosts(posts, metrics.engajamento.media),
  };

  // Pergunta específica do usuário: responde ela em primeiro plano, mas o resto
  // do diagnóstico continua saindo completo — o schema exige todos os campos.
  const focoBloco = focus?.trim()
    ? `

<pergunta_do_usuario>
${focus.trim()}
</pergunta_do_usuario>

Essa é a pergunta que a pessoa quer responder sobre este perfil. Responda-a em "resposta_ao_foco" de forma direta e ancorada nos dados (cite números, legendas ou URLs), em 2 a 5 parágrafos. Se os dados disponíveis não permitirem responder com segurança, diga isso explicitamente em vez de especular. Além disso, enviese o restante do diagnóstico para o que for relevante a essa pergunta — sem deixar de preencher todos os campos.`
    : `

Não houve pergunta específica: faça o diagnóstico padrão completo e devolva "resposta_ao_foco" como null.`;

  return `Analise o perfil abaixo e devolva o diagnóstico no formato JSON definido.

Sobre "insights_conteudo": priorize os Reels e os posts com maior engajamento, mas cubra também os pilares menos óbvios. Gere entre 12 e 25 itens (ou todos os posts, se houver menos que isso).${focoBloco}

<dados>
${JSON.stringify(payload, null, 1)}
</dados>`;
}

export async function analyzeProfile(input: {
  apiKey: string;
  profile: ScanProfile;
  metrics: ScanMetrics;
  posts: ScanPost[];
  /** Pergunta específica do usuário. Vazio/null = diagnóstico padrão. */
  focus?: string | null;
  model?: string;
  effort?: string;
  onProgress?: (msg: string) => void;
}): Promise<{ analysis: ScanAnalysis; usage: ScanUsage }> {
  const {
    apiKey,
    profile,
    metrics,
    posts,
    focus = null,
    model = DEFAULT_MODEL,
    effort = DEFAULT_EFFORT,
    onProgress = () => {},
  } = input;

  const client = new Anthropic({ apiKey });

  onProgress(`Analisando ${posts.length} publicações com ${model} (effort: ${effort})...`);

  // Streaming porque max_tokens é alto — sem isso a requisição estoura o
  // timeout HTTP do SDK antes de terminar.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: effort as "low" | "medium" | "high" | "xhigh" | "max",
      format: { type: "json_schema", schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown> },
    },
    // Se os classificadores de segurança recusarem, a própria API reexecuta num
    // modelo alternativo dentro da mesma chamada.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: buildUserPrompt(profile, metrics, posts, focus) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      "A análise foi recusada pelos filtros de segurança do modelo. " +
        "As métricas do perfil foram calculadas e seguem disponíveis.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "A resposta do modelo foi truncada. Rode de novo com menos publicações (limite menor).",
    );
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("O modelo não retornou nenhum bloco de texto.");
  }

  let analysis: ScanAnalysis;
  try {
    analysis = JSON.parse(textBlock.text) as ScanAnalysis;
  } catch {
    throw new Error("Não consegui parsear o JSON devolvido pelo modelo.");
  }

  return {
    analysis,
    usage: {
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
