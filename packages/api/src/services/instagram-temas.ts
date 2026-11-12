/**
 * O tema de cada post, lido da legenda.
 *
 * ## Por que a IA sugere e uma pessoa revisa
 *
 * Tema é julgamento editorial: um carrossel sobre telas pode ser "Educação dos
 * filhos" num perfil e "Produtividade" em outro. O modelo acerta a maioria e
 * erra alguns, e um tema errado silencioso envenena a tabela que vai dizer que
 * assunto rende. Por isso tudo que ele devolve entra marcado como sugestão, e
 * a tela mostra isso até alguém confirmar.
 *
 * ## Por que o vocabulário existente vai no pedido
 *
 * Sem a lista do que já foi usado, o modelo escreve "Black MFB" num post e
 * "Promoção da Black" no seguinte, e a tabela de temas vira uma lista de
 * sinônimos com um post cada. O prompt manda reaproveitar e só criar tema novo
 * quando nenhum serve.
 */

import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { instagramPostMetrics } from "../db/schema.js";
import { salvarTemasSugeridos, temasDaConta } from "./instagram-post-metrics.js";

export interface PostParaEtiquetar {
  id: string;
  caption?: string | null;
  postedAt: Date;
}

export interface TemaSugerido {
  id: string;
  /** `null` quando a legenda não diz do que o post trata. */
  tema: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "tema"],
        properties: {
          id: { type: "string" },
          tema: {
            type: ["string", "null"],
            maxLength: 60,
            description: "Tema do conteúdo, 1 a 4 palavras. null se a legenda não disser do que trata.",
          },
        },
      },
    },
  },
} as const;

const SISTEMA = `Você etiqueta posts de Instagram por TEMA DO CONTEÚDO, lendo a legenda.

Tema é o assunto de que o post trata — "Rotina da família", "Inglês em casa", "Bastidores", "Promoção de Black Friday". Não é formato (Reels, carrossel), não é objetivo (vender, engajar) e não é tipo de chamada (link na bio, grupo).

Regras:
- Reaproveite SEMPRE um tema da lista "temas_que_ja_existem" quando ele servir, com a grafia exata. Criar um tema novo para dizer a mesma coisa que um existente é erro.
- Tema novo só quando nenhum existente serve. De 1 a 4 palavras, em português do Brasil, sem emoji, sem hashtag, sem ponto final. Substantivo, não frase.
- Não invente o que não está na legenda. Legenda vazia, só emoji, só hashtag ou genérica demais para dizer o assunto: devolva null.
- Você não viu a imagem nem o vídeo. Só a legenda.
- Devolva exatamente um item para CADA id recebido, com o mesmo id.`;

/**
 * Lê as legendas e devolve o tema de cada post.
 *
 * Um pedido só para o lote inteiro: é o que deixa o modelo ver os posts juntos
 * e usar a mesma palavra para o mesmo assunto — um pedido por post devolveria
 * um vocabulário por post.
 */
export async function sugerirTemas(
  apiKey: string,
  entrada: { posts: PostParaEtiquetar[]; temasQueJaExistem: string[] },
): Promise<TemaSugerido[]> {
  if (entrada.posts.length === 0) return [];

  const pacote = {
    temas_que_ja_existem: entrada.temasQueJaExistem,
    posts: entrada.posts.map((p) => ({
      id: p.id,
      data: p.postedAt.toISOString().slice(0, 10),
      // Legenda longa não ajuda a decidir o tema e multiplica o custo do lote.
      legenda: (p.caption ?? "").slice(0, 600),
    })),
  };

  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SISTEMA,
    thinking: { type: "adaptive" },
    output_config: {
      // Classificar legenda é tarefa curta; o que custa é o tamanho do lote.
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: `Posts (JSON):\n\n${JSON.stringify(pacote)}` }],
  });

  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("A sugestão foi recusada pelo modelo.");
  if (msg.stop_reason === "max_tokens") throw new Error("A resposta do modelo foi cortada.");
  const texto = msg.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("O modelo não devolveu texto.");

  const bruto = JSON.parse(texto.text) as { posts?: { id?: string; tema?: string | null }[] };
  return normalizarSugestoes(bruto.posts ?? [], entrada);
}

/**
 * Limpa o que voltou do modelo.
 *
 * Exportado para o teste: é aqui que mora o risco de um tema sujo entrar no
 * banco e virar uma linha a mais na tabela de temas para sempre.
 */
export function normalizarSugestoes(
  recebidos: { id?: string; tema?: string | null }[],
  entrada: { posts: PostParaEtiquetar[]; temasQueJaExistem: string[] },
): TemaSugerido[] {
  const pedidos = new Set(entrada.posts.map((p) => p.id));
  // Casar sem acento e sem caixa: "Fé e família" e "fe e familia" são o mesmo
  // tema, e só um deles pode sobreviver — o que já estava no banco.
  const chave = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const existentes = new Map(entrada.temasQueJaExistem.map((t) => [chave(t), t]));

  const out: TemaSugerido[] = [];
  const vistos = new Set<string>();
  for (const r of recebidos) {
    const id = typeof r.id === "string" ? r.id : null;
    // Id que não foi pedido é alucinação: descarta em vez de etiquetar um post
    // que não é desta conta.
    if (!id || !pedidos.has(id) || vistos.has(id)) continue;
    vistos.add(id);

    const limpo = (r.tema ?? "")
      .replace(/[#@]\S+/g, "")
      .replace(/\s+/g, " ")
      .replace(/[.;,]+$/, "")
      .trim()
      .slice(0, 60);
    if (!limpo) {
      out.push({ id, tema: null });
      continue;
    }
    const jaExiste = existentes.get(chave(limpo));
    if (!jaExiste) existentes.set(chave(limpo), limpo);
    out.push({ id, tema: jaExiste ?? limpo });
  }
  return out;
}

/** Quantos posts a IA etiqueta de uma vez. Lote maior custa e demora sem ganhar. */
export const LOTE_DE_TEMAS = 60;

export interface RodadaDeTemas {
  sugeridos: number;
  /** Posts sem tema que sobraram do lote — a tela diz se vale rodar de novo. */
  restantes: number;
  temas: string[];
  mensagem?: string;
}

/**
 * Uma rodada de etiquetagem nos posts da conta que ainda não têm tema.
 *
 * Existe como função, e não só como rota, porque a sincronização chama a mesma
 * coisa: a tabela "Por tema" ficava vazia até alguém se lembrar de clicar em
 * "Sugerir temas", e um bloco que depende de lembrança fica vazio para sempre.
 *
 * É barato em regime: depois da primeira passagem quase toda sincronização
 * acha zero posts sem tema e sai sem chamar o modelo.
 */
export async function etiquetarPostsSemTema(
  db: Database,
  chave: string,
  accountId: string,
): Promise<RodadaDeTemas> {
  const candidatos = await db
    .select({
      mediaId: instagramPostMetrics.mediaId,
      caption: instagramPostMetrics.caption,
      postedAt: instagramPostMetrics.postedAt,
    })
    .from(instagramPostMetrics)
    .where(and(eq(instagramPostMetrics.accountId, accountId), isNull(instagramPostMetrics.tema)))
    .orderBy(desc(instagramPostMetrics.postedAt))
    .limit(LOTE_DE_TEMAS);

  const comLegenda = candidatos.filter((c) => (c.caption ?? "").trim().length > 0);
  const temas = await temasDaConta(db, accountId);
  if (comLegenda.length === 0) {
    return { sugeridos: 0, restantes: 0, temas, mensagem: "Todos os posts com legenda já têm tema." };
  }

  const sugestoes = await sugerirTemas(chave, {
    posts: comLegenda.map((c) => ({ id: c.mediaId, caption: c.caption, postedAt: c.postedAt })),
    temasQueJaExistem: temas,
  });
  const gravados = await salvarTemasSugeridos(db, accountId, sugestoes);
  return {
    sugeridos: gravados,
    restantes: Math.max(0, candidatos.length - comLegenda.length),
    temas: await temasDaConta(db, accountId),
  };
}
