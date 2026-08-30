/**
 * O agente que monta widget a partir de uma pergunta em português.
 *
 * ## Por que isto é seguro
 *
 * O modelo **não escreve SQL, nem expressão, nem nome de coluna**. Ele escolhe
 * chaves de um catálogo que o próprio prompt lista, e o que volta passa pelo
 * mesmo `validarSpec`/`planejar` que valida um widget montado à mão. Uma chave
 * inventada é recusada pelo validador antes de qualquer consulta existir — é a
 * mesma fronteira que já protegia o editor, e não uma nova.
 *
 * A consequência de projeto: o pior caso de uma alucinação é **um widget a
 * menos, com aviso**, nunca uma consulta estranha rodando no banco.
 *
 * ## Autocorreção, uma vez
 *
 * Quando o validador recusa, o erro volta ao modelo com a mensagem exata e ele
 * tenta de novo — uma vez. Duas tentativas cobrem o caso real (confundir chave
 * parecida); a partir da terceira o padrão é insistir no mesmo erro, e aí é
 * melhor mostrar a mensagem a quem perguntou.
 */

import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { CAMPOS, ENTIDADES, campo } from "./catalogo.js";
import { PADRAO_POR_TIPO, TIPOS_DE_WIDGET, primeiroEspacoLivre, type Widget } from "./dashboard.js";
import { CAMPO_DE_DATA, ErroDeQuery, planejar, querySpecSchema, OPERADORES } from "./query.js";
import { validarSpecDeAplicacoes } from "./aplicacoes.js";

/** Teto de widgets por pergunta. Acima disto vira despejo, não resposta. */
export const MAX_WIDGETS_POR_PERGUNTA = 6;

export interface WidgetProposto {
  titulo: string;
  tipo: (typeof TIPOS_DE_WIDGET)[number];
  entity: string;
  metrics: string[];
  dimensions?: string[];
  filtros?: { campo: string; operador: string; valores: string[] }[];
  ordenar_por?: string;
  ordem?: "asc" | "desc";
  limite?: number;
  agrupar_data_por?: "day" | "week" | "month";
}

export interface RespostaDoAgente {
  explicacao: string;
  widgets: Widget[];
  /** O que foi descartado e por quê — nunca some em silêncio. */
  avisos: string[];
}

// ============================================================
// O prompt
// ============================================================

/**
 * O catálogo em texto, para o modelo escolher.
 *
 * Mandar o catálogo inteiro em vez de deixar o modelo adivinhar é o que troca
 * "alucina um nome de coluna" por "escolhe da lista". As descrições vão junto
 * porque são elas que distinguem CPL geral de CPL atribuído — a diferença que a
 * pessoa não sabe pedir mas espera ver respeitada.
 */
export function catalogoEmTexto(): string {
  const linhas: string[] = [];

  for (const entidade of ENTIDADES) {
    const daEntidade = CAMPOS.filter((c) => c.entity === entidade.key);
    if (daEntidade.length === 0) continue;

    linhas.push(`\n## Entidade \`${entidade.key}\` — ${entidade.label}`);
    linhas.push(entidade.descricao);

    const dims = daEntidade.filter((c) => c.role === "dimension");
    const mets = daEntidade.filter((c) => c.role === "metric");

    if (dims.length) {
      linhas.push("\nDimensões (para agrupar e filtrar):");
      for (const d of dims) linhas.push(`- \`${d.key}\` — ${d.label}. ${d.description}`);
    }
    if (mets.length) {
      linhas.push("\nMétricas (para medir):");
      for (const m of mets) {
        const extra = m.formula ? ` Fórmula: ${m.formula}.` : "";
        linhas.push(`- \`${m.key}\` — ${m.label}. ${m.description}.${extra}`);
      }
    }
  }

  return linhas.join("\n");
}

export const INSTRUCOES = `Você monta widgets de dashboard para o Loyola X a partir de uma pergunta em português.

REGRAS QUE NÃO SE NEGOCIAM

1. Use SOMENTE as chaves do catálogo abaixo, escritas exatamente como estão. Não invente chave, não traduza chave, não abrevie.
2. Métrica e dimensão de um mesmo widget precisam ser da MESMA entidade. Para cruzar entidades, faça dois widgets.
3. NÃO inclua filtro de data. O período é do dashboard e é injetado depois — se você puser data, ela será substituída.
4. Escolha o tipo de gráfico pela forma da resposta:
   - \`kpi\` para um número do período (sem dimensão);
   - \`linha\` para evolução no tempo (dimensão de data);
   - \`barra\` para comparar categorias (campanha, produto, projeto);
   - \`pizza\` para composição de um total;
   - \`tabela\` quando há muitas métricas juntas ou é um ranking detalhado;
   - \`funil\` para etapas em sequência.
5. Ao comparar categorias, ordene pela métrica principal e ponha um limite (10 a 30).
6. Prefira POUCOS widgets bem escolhidos. No máximo ${MAX_WIDGETS_POR_PERGUNTA}.
7. Títulos em português, curtos, dizendo o que o número é — não repita a pergunta.

O QUE FAZER COM PEDIDO IMPOSSÍVEL

Se a pergunta pedir algo que o catálogo não tem, NÃO invente aproximação silenciosa.
Monte o que der e diga na explicação, em uma frase, o que não foi possível e por quê.`;

// ============================================================
// Tradução do que o modelo devolve
// ============================================================

const OPERADOR_VALIDO = new Set<string>(OPERADORES);

/** Converte a proposta do modelo em `Widget`, ou explica por que não dá. */
export function propostaParaWidget(
  proposta: WidgetProposto,
  ocupados: { x: number; y: number; w: number; h: number }[],
): { widget: Widget } | { erro: string } {
  const tipo = TIPOS_DE_WIDGET.includes(proposta.tipo) ? proposta.tipo : "tabela";

  const filters: Record<string, { operator: string; value?: string | string[] }> = {};
  for (const f of proposta.filtros ?? []) {
    if (!campo(f.campo)) return { erro: `filtro sobre campo inexistente: ${f.campo}` };
    if (!OPERADOR_VALIDO.has(f.operador)) return { erro: `operador desconhecido: ${f.operador}` };
    const valores = f.valores ?? [];
    filters[f.campo] =
      f.operador === "$in" || f.operador === "$nin" || f.operador === "$between"
        ? { operator: f.operador, value: valores }
        : { operator: f.operador, value: valores[0] ?? "" };
  }

  // A data entra aqui com um valor de fachada: o contexto do dashboard
  // sobrescreve na execução. Sem ela o `validarSpec` recusaria, e a recusa não
  // teria nada a ver com o que o modelo respondeu.
  const chaveDeData = CAMPO_DE_DATA[proposta.entity as keyof typeof CAMPO_DE_DATA];
  if (!chaveDeData) return { erro: `entidade desconhecida: ${proposta.entity}` };
  filters[chaveDeData] = { operator: "$between", value: ["1900-01-01", "2999-12-31"] };

  const bruto = {
    entity: proposta.entity,
    metrics: proposta.metrics ?? [],
    dimensions: proposta.dimensions ?? [],
    filters,
    order_by: proposta.ordenar_por
      ? [{ field: proposta.ordenar_por, direction: proposta.ordem ?? "desc" }]
      : [],
    limit: proposta.limite ?? 500,
    date_granularity: proposta.agrupar_data_por ?? "day",
  };

  const analisado = querySpecSchema.safeParse(bruto);
  if (!analisado.success) {
    return { erro: analisado.error.issues.map((i) => i.message).join("; ") };
  }

  try {
    // O MESMO gate do editor: entidade sem tradução, métrica sem fórmula,
    // ordenação fora do resultado — tudo recusado aqui, antes de virar consulta.
    if (analisado.data.entity === "aplicacoes") validarSpecDeAplicacoes(analisado.data);
    else planejar(analisado.data);
  } catch (erro) {
    return { erro: erro instanceof ErroDeQuery ? erro.message : "consulta inválida" };
  }

  const tamanho = PADRAO_POR_TIPO[tipo];
  const canto = primeiroEspacoLivre(ocupados, tamanho);

  return {
    widget: {
      id: randomUUID(),
      tipo,
      titulo: (proposta.titulo || "Widget").slice(0, 120),
      spec: analisado.data,
      specsExtras: [],
      derivadas: [],
      geometria: { ...canto, w: tamanho.w, h: tamanho.h },
      opcoes: {},
    },
  };
}

// ============================================================
// A conversa com o modelo
// ============================================================

const FERRAMENTA: Anthropic.Tool = {
  name: "montar_widgets",
  description: "Monta os widgets que respondem a pergunta.",
  input_schema: {
    type: "object",
    properties: {
      explicacao: {
        type: "string",
        description:
          "Uma ou duas frases dizendo o que foi montado e, se for o caso, o que não foi possível.",
      },
      widgets: {
        type: "array",
        maxItems: MAX_WIDGETS_POR_PERGUNTA,
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            tipo: { type: "string", enum: [...TIPOS_DE_WIDGET] },
            entity: { type: "string", enum: ENTIDADES.map((e) => e.key) },
            metrics: { type: "array", items: { type: "string" } },
            dimensions: { type: "array", items: { type: "string" } },
            filtros: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  campo: { type: "string" },
                  operador: { type: "string", enum: [...OPERADORES] },
                  valores: { type: "array", items: { type: "string" } },
                },
                required: ["campo", "operador", "valores"],
              },
            },
            ordenar_por: { type: "string" },
            ordem: { type: "string", enum: ["asc", "desc"] },
            limite: { type: "integer" },
            agrupar_data_por: { type: "string", enum: ["day", "week", "month"] },
          },
          required: ["titulo", "tipo", "entity", "metrics"],
        },
      },
    },
    required: ["explicacao", "widgets"],
  },
};

type ClienteMinimo = {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
};

function extrairProposta(
  mensagem: Anthropic.Message,
): { explicacao: string; widgets: WidgetProposto[] } | null {
  for (const bloco of mensagem.content) {
    if (bloco.type === "tool_use" && bloco.name === FERRAMENTA.name) {
      const entrada = bloco.input as { explicacao?: string; widgets?: WidgetProposto[] };
      return { explicacao: entrada.explicacao ?? "", widgets: entrada.widgets ?? [] };
    }
  }
  return null;
}

/**
 * Um passo do trabalho, para a tela mostrar.
 *
 * Existe porque "Montando…" por vinte segundos é indistinguível de travado. E
 * porque o passo diz coisas úteis: quando a IA erra uma chave e se corrige, quem
 * está olhando vê isso acontecer em vez de esperar em silêncio.
 */
export type PassoDoAgente =
  | { tipo: "lendo" }
  | { tipo: "pensando"; tentativa: number }
  | { tipo: "montou"; titulo: string; grafico: string }
  | { tipo: "corrigindo"; motivo: string }
  | { tipo: "calculando"; titulo: string };

export interface ContextoDoAgente {
  cliente: ClienteMinimo;
  modelo?: string;
  /** Geometria dos widgets que já existem, para o novo não nascer por cima. */
  ocupados: { x: number; y: number; w: number; h: number }[];
  /** Chamado a cada passo. A rota transforma em linha NDJSON. */
  aoProgredir?: (passo: PassoDoAgente) => void;
}

/**
 * Falha na conversa com o modelo, com o motivo preservado.
 *
 * A primeira versão engolia o erro e devolvia "a IA não respondeu, tente de
 * novo" — que não distingue sobrecarga de chave errada, e deixa quem está
 * olhando sem ação possível. O `motivo` sobe até a tela.
 */
export class ErroDoAgente extends Error {
  constructor(
    message: string,
    /** Status HTTP da API, quando houver. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ErroDoAgente";
  }
}

/** Espera entre tentativas quando a API está sobrecarregada. */
const ESPERA_MS = [400, 1200];

function ehTemporario(erro: unknown): boolean {
  const status = (erro as { status?: number })?.status;
  // 429 (limite) e 5xx (sobrecarga) passam sozinhos; o resto, não.
  return status === 429 || (typeof status === "number" && status >= 500);
}

function motivoLegivel(erro: unknown): string {
  const e = erro as { status?: number; message?: string };

  // Saldo esgotado chega como 400, não como 402 — e a mensagem crua da
  // Anthropic manda "ir para Plans & Billing", conselho que não serve para quem
  // está olhando um dashboard. Trocamos por quem pode resolver.
  if (/credit balance is too low/i.test(e?.message ?? "")) {
    return "A conta de IA está sem saldo. Recarregue os créditos da Anthropic — isso afeta o chat e os Minds também.";
  }

  if (e?.status === 401 || e?.status === 403) {
    return "A chave da API de IA foi recusada. Verifique a configuração do servidor.";
  }
  if (e?.status === 429) return "A IA está no limite de uso agora. Tente em alguns segundos.";
  if (e?.status === 404) {
    return "O modelo configurado não existe ou não está liberado para esta chave.";
  }
  if (typeof e?.status === "number" && e.status >= 500) {
    return "A IA está sobrecarregada. Tente de novo em instantes.";
  }
  return e?.message ? `Falha ao falar com a IA: ${e.message}` : "Falha ao falar com a IA.";
}

/**
 * Uma chamada ao modelo, com repetição só do que é temporário.
 *
 * Sobrecarga e limite de uso passam sozinhos e merecem uma segunda chance;
 * chave errada e modelo inexistente, não — repetir só atrasa a mensagem que
 * resolve.
 */
async function chamar(
  ctx: ContextoDoAgente,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa <= ESPERA_MS.length; tentativa += 1) {
    try {
      return await ctx.cliente.messages.create(params);
    } catch (erro) {
      ultimo = erro;
      if (!ehTemporario(erro) || tentativa === ESPERA_MS.length) break;
      await new Promise((r) => setTimeout(r, ESPERA_MS[tentativa]));
    }
  }
  throw new ErroDoAgente(motivoLegivel(ultimo), (ultimo as { status?: number })?.status);
}

/**
 * Interpreta a pergunta e devolve widgets já validados.
 *
 * Nunca lança por culpa do modelo: pergunta impossível vira explicação e lista
 * vazia, e widget recusado vira aviso.
 */
export async function montarWidgets(
  pergunta: string,
  ctx: ContextoDoAgente,
): Promise<RespostaDoAgente> {
  const sistema = `${INSTRUCOES}\n\n# Catálogo\n${catalogoEmTexto()}`;
  const conversa: Anthropic.MessageParam[] = [{ role: "user", content: pergunta }];
  const passo = ctx.aoProgredir ?? (() => {});

  const avisos: string[] = [];
  let explicacao = "";

  passo({ tipo: "lendo" });

  // Duas passadas no máximo: a segunda existe para o modelo corrigir uma chave
  // trocada, que é o erro real. Insistir além disso repete o mesmo erro.
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    passo({ tipo: "pensando", tentativa });
    const mensagem = await chamar(ctx, {
      model: ctx.modelo ?? "claude-sonnet-4-6",
      max_tokens: 4096,
      system: sistema,
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: FERRAMENTA.name },
      messages: conversa,
    });

    const proposta = extrairProposta(mensagem);
    if (!proposta) return { explicacao: "Não consegui montar nada com essa pergunta.", widgets: [], avisos };

    explicacao = proposta.explicacao;

    const aceitos: Widget[] = [];
    const recusados: string[] = [];
    const ocupados = [...ctx.ocupados];

    for (const p of proposta.widgets.slice(0, MAX_WIDGETS_POR_PERGUNTA)) {
      const r = propostaParaWidget(p, ocupados);
      if ("widget" in r) {
        aceitos.push(r.widget);
        ocupados.push(r.widget.geometria);
        passo({ tipo: "montou", titulo: r.widget.titulo, grafico: r.widget.tipo });
      } else {
        recusados.push(`"${p.titulo}": ${r.erro}`);
      }
    }

    if (recusados.length === 0) return { explicacao, widgets: aceitos, avisos };

    if (tentativa === 0) {
      passo({ tipo: "corrigindo", motivo: recusados[0] ?? "" });
      // A mensagem de erro vai INTEIRA para o modelo: ela nomeia o campo e o
      // motivo, que é exatamente o que ele precisa para acertar na segunda.
      conversa.push({ role: "assistant", content: mensagem.content });
      conversa.push({
        role: "user",
        content: `Alguns widgets foram recusados pelo validador:\n${recusados.join("\n")}\n\nCorrija usando apenas chaves do catálogo e responda de novo com a ferramenta.`,
      });
      continue;
    }

    // Segunda tentativa também falhou: entrega o que passou e diz o que caiu.
    avisos.push(...recusados);
    return { explicacao, widgets: aceitos, avisos };
  }

  return { explicacao, widgets: [], avisos };
}
