/**
 * Respostas de pesquisa que chegam por webhook, entrando como se fossem a
 * planilha do Tally.
 *
 * ## Por que não dá para reusar a fonte de LEADS
 *
 * `webhook-leads.ts` resolve o mesmo problema com uma diferença que muda tudo:
 * lá as colunas são NOVE e conhecidas (nome, e-mail, telefone, cinco UTMs), e
 * o módulo normaliza o corpo recebido para elas. Aqui as colunas são as
 * PERGUNTAS do questionário — mudam a cada lançamento, e quem as nomeia é quem
 * envia. Então nada é normalizado: as chaves do corpo viram os cabeçalhos, na
 * ordem em que apareceram, e o motor de scoring casa pergunta↔coluna pelos
 * aliases como já faz com a planilha e com o Tally.
 *
 * ## A forma de saída é a da planilha, de propósito
 *
 * Seis telas leem respostas de pesquisa (resultados, debug, quebra por
 * campanha, por conjunto, por criativo, qualificação do público) e todas leem
 * `{headers, rows}`. O webhook entra por onde a planilha entrava — mesma
 * conta, mesmo número.
 *
 * Módulo puro: sem DB, sem rede.
 */

import { dataComoPlanilha } from "./webhook-leads.js";

/**
 * O que marca uma pesquisa por webhook no `spreadsheet_id` da `funnel_surveys`.
 *
 * Prefixo PRÓPRIO, e não o `webhook:` dos leads: os dois convivem no mesmo
 * `readSheetData`, e o leitor que atende um não sabe ler o outro. Um prefixo
 * compartilhado devolveria nove colunas de lead onde o scoring espera as
 * perguntas — sem erro nenhum na tela, só faixa errada.
 */
export const PREFIXO_PESQUISA = "webhook-pesquisa:";

/** O id da pesquisa, ou `null` quando é planilha de verdade do Google. */
export function idDaPesquisa(spreadsheetId: string): string | null {
  if (!spreadsheetId.startsWith(PREFIXO_PESQUISA)) return null;
  const id = spreadsheetId.slice(PREFIXO_PESQUISA.length).trim();
  return id.length > 0 ? id : null;
}

/** `spreadsheetId` de uma pesquisa que chega por webhook. */
export function pesquisaComoPlanilhaId(surveyId: string): string {
  return `${PREFIXO_PESQUISA}${surveyId}`;
}

/**
 * A primeira coluna, que o remetente não precisa mandar: quando a resposta
 * chegou aqui.
 *
 * Não se chama `data` para não disputar nome com a data que o próprio
 * formulário manda — as duas podem existir, e são coisas diferentes (quando a
 * pessoa respondeu × quando o envio chegou). Se o corpo trouxer uma chave com
 * este mesmo nome, a nossa ganha: a hora de chegada é a única que o X mediu.
 */
export const COLUNA_DATA = "recebido_em";

/** Até onde descer em objeto aninhado ao achatar o corpo. */
const PROFUNDIDADE_MAXIMA = 3;

/**
 * O corpo recebido virando pares `coluna → valor`.
 *
 * Achata o aninhado com ponto (`contato.email`) e índice (`fields[0].value`)
 * porque é assim que o corpo chega de quem manda: o n8n repassa o nó inteiro,
 * e formulário costuma agrupar as respostas num objeto. Sem achatar, a pesquisa
 * teria UMA coluna chamada `fields` com `[object Object]` dentro.
 *
 * Valor que não é escalar depois do limite de profundidade fica de fora: é
 * melhor a coluna não existir do que existir com lixo — a prévia da tela mostra
 * exatamente o que entrou, e quem envia corrige na origem.
 */
export function achatarCorpo(corpo: Record<string, unknown>): Map<string, string> {
  const saida = new Map<string, string>();

  const andar = (valor: unknown, caminho: string, nivel: number): void => {
    if (valor === null || valor === undefined) {
      // Chave presente e vazia é informação: a coluna existe, a célula é "".
      if (caminho) saida.set(caminho, "");
      return;
    }
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      if (caminho) saida.set(caminho, String(valor).trim());
      return;
    }
    if (nivel >= PROFUNDIDADE_MAXIMA) return;
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => andar(item, `${caminho}[${i}]`, nivel + 1));
      return;
    }
    if (typeof valor === "object") {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        const chave = k.trim();
        if (!chave) continue;
        andar(v, caminho ? `${caminho}.${chave}` : chave, nivel + 1);
      }
    }
  };

  andar(corpo, "", 0);
  // A primeira ocorrência ganha, como na planilha: se o corpo trouxer a mesma
  // chave duas vezes (`email` e `Email`), a coluna é uma só.
  return saida;
}

export interface RespostaRecebida {
  payload: Record<string, unknown>;
  recebidoEm: Date;
}

/**
 * As respostas do banco na forma que o resto do sistema já sabe ler.
 *
 * Os cabeçalhos são a UNIÃO das chaves de todas as respostas, na ordem de
 * primeira aparição — e não as chaves da primeira resposta. Quem muda o
 * formulário no meio do lançamento manda uma pergunta nova a partir dali: pela
 * primeira resposta, essa coluna não existiria e as respostas novas cairiam
 * fora da conta em silêncio.
 *
 * Mais antiga primeiro, como a planilha onde cada resposta vira a próxima
 * linha.
 */
export function respostasComoPlanilha(respostas: RespostaRecebida[]): {
  headers: string[];
  rows: string[][];
  totalRows: number;
} {
  const achatadas = respostas.map((r) => ({
    recebidoEm: r.recebidoEm,
    valores: achatarCorpo(r.payload ?? {}),
  }));

  const colunas: string[] = [];
  const vistas = new Set<string>();
  for (const { valores } of achatadas) {
    for (const chave of valores.keys()) {
      if (chave === COLUNA_DATA || vistas.has(chave)) continue;
      vistas.add(chave);
      colunas.push(chave);
    }
  }

  const headers = [COLUNA_DATA, ...colunas];
  const rows = achatadas.map(({ recebidoEm, valores }) => [
    dataComoPlanilha(recebidoEm),
    ...colunas.map((c) => valores.get(c) ?? ""),
  ]);

  return { headers, rows, totalRows: rows.length };
}

/** Onde uma coluna recebida vai cair. */
export type DestinoDaColuna =
  | { tipo: "data" }
  | { tipo: "pergunta"; perguntaId: string; rotulo: string }
  | { tipo: "contato"; campo: string }
  | { tipo: "nao_usado" };

export interface ColunaDaPrevia {
  coluna: string;
  /** O valor que veio no exemplo, para a pessoa reconhecer a coluna. */
  exemplo: string;
  destino: DestinoDaColuna;
}

/**
 * A prévia: cada coluna do exemplo colado com o lugar onde ela vai cair.
 *
 * É o que responde "como vocês vão esperar os dados" ANTES de o primeiro envio
 * acontecer. Quem decide o casamento com as perguntas é o próprio motor de
 * scoring (`findQuestionColumn`), e não uma regra parecida escrita aqui — o
 * caller já resolveu e passa em `perguntasCasadas`. Uma prévia com regra
 * própria prometeria um casamento que a conta real não faz.
 *
 * `contato` sai de `campoDoApelido`, a mesma tabela que a recepção de leads
 * usa. `nao_usado` não é erro: a pergunta pode simplesmente não estar no
 * modelo de scoring, e a coluna fica guardada do mesmo jeito.
 */
export function montarPrevia(
  valores: Map<string, string>,
  perguntasCasadas: Map<string, { perguntaId: string; rotulo: string }>,
  campoDeContato: (chave: string) => string | null,
): ColunaDaPrevia[] {
  const linhas: ColunaDaPrevia[] = [
    { coluna: COLUNA_DATA, exemplo: "(preenchido na chegada)", destino: { tipo: "data" } },
  ];

  for (const [coluna, exemplo] of valores) {
    if (coluna === COLUNA_DATA) continue;
    const pergunta = perguntasCasadas.get(coluna);
    const contato = pergunta ? null : campoDeContato(coluna);
    linhas.push({
      coluna,
      exemplo,
      destino: pergunta
        ? { tipo: "pergunta", perguntaId: pergunta.perguntaId, rotulo: pergunta.rotulo }
        : contato
          ? { tipo: "contato", campo: contato }
          : { tipo: "nao_usado" },
    });
  }

  return linhas;
}

/**
 * O content-type do exemplo colado na tela, deduzido do próprio texto.
 *
 * A tela não tem como saber o tipo — a pessoa cola um texto numa textarea — e
 * o parser só tenta `a=b&c=d` quando o content-type diz. Sem este palpite a
 * tela prometia aceitar os pares do formulário e recusava todos.
 */
export function inferirContentType(exemplo: string): string {
  const texto = exemplo.trim();
  if (texto.startsWith("{") || texto.startsWith("[")) return "application/json";
  if (texto.includes("=")) return "application/x-www-form-urlencoded";
  return "";
}

/**
 * Por que o exemplo não pôde ser lido, em uma frase para a tela.
 *
 * "Não consegui ler" sozinho não dá para agir: o caso mais comum é colar um
 * JSON copiado de um lugar que cortou as linhas, e o que a pessoa precisa
 * saber é ONDE ele quebra. O V8 informa linha e coluna; aproveitamos isso e
 * descartamos o resto da mensagem, que é em inglês.
 */
export function motivoDeNaoLer(exemplo: string): string {
  const texto = exemplo.trim();
  if (!texto) return "o campo está vazio";
  if (!texto.startsWith("{") && !texto.startsWith("[")) {
    return texto.includes("=")
      ? "os pares não têm nenhum campo com valor"
      : "não parece JSON nem os pares a=b&c=d";
  }
  try {
    const json: unknown = JSON.parse(texto);
    const corpo = Array.isArray(json) ? json[0] : json;
    if (!corpo || typeof corpo !== "object") return "o JSON é válido mas não é um objeto";
    return "o JSON é válido mas veio sem nenhum campo";
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : "";
    const linhaColuna = /line (\d+) column (\d+)/.exec(msg);
    if (linhaColuna) {
      return `o JSON quebra na linha ${linhaColuna[1]}, coluna ${linhaColuna[2]} — confira se alguma linha foi cortada ao copiar`;
    }
    const posicao = /position (\d+)/.exec(msg);
    if (posicao) return `o JSON quebra no caractere ${posicao[1]}`;
    return "o JSON está inválido";
  }
}
