/**
 * Parser do `utm_term` no padrão que o time usa no Meta.
 *
 * Formato observado (104 valores distintos em produção):
 *
 *   {Posicionamento}_{campanha}|{conjunto}|{anúncio}
 *
 * onde cada uma das três partes é subdividida por `--`. Exemplos reais:
 *
 *   Instagram_Reels_dg-pg04-ago-26--vendas-principal-leads--2026-08-03--hot--cbo--videos--lpa
 *     |01_FD-ST_ALLINONE30D|adv03--ia--pg04--vendas--g03-b03-f01--is_ia
 *
 *   Instagram_Feed_dg-pg04-ago-26--vendas-captacao--2026-07-11--cold--cbo--videos--lote00--lpaa
 *     |00_FD-ST_LaL1-ALLINONE|adv11--ia--pg04--cap-ads-claude
 *
 * IMPORTANTE: a quantidade de blocos VARIA — o segundo exemplo tem `lote00` e o
 * primeiro não. Por isso NÃO mapeamos por posição (posição 6 seria `videos` num
 * e `lote00` no outro). Cada bloco é identificado pelo que ele PARECE, e o que
 * não reconhecemos fica em `outros`, na ordem, em vez de receber um rótulo
 * errado.
 *
 * Nem todo term é estruturado: convivem no mesmo campo valores como "vendas",
 * "publico-imersao", "recuperacao-carrinho" e IDs crus ("120247829052320208").
 * Esses voltam com `estruturado: false` e o bruto preservado.
 */

export interface ParsedTerm {
  bruto: string;
  /** true = tem a estrutura do Meta (pipes e/ou blocos `--`). */
  estruturado: boolean;
  posicionamento: string | null;
  campanha: string | null;
  objetivo: string | null;
  data: string | null;
  publico: string | null;
  estrategia: string | null;
  formato: string | null;
  lote: string | null;
  /** A landing page — "de qual LP veio". */
  lp: string | null;
  conjunto: string | null;
  anuncio: string | null;
  /** Blocos que não casaram com nenhum reconhecedor, na ordem original. */
  outros: string[];
}

const VAZIO: Omit<ParsedTerm, "bruto" | "estruturado"> = {
  posicionamento: null,
  campanha: null,
  objetivo: null,
  data: null,
  publico: null,
  estrategia: null,
  formato: null,
  lote: null,
  lp: null,
  conjunto: null,
  anuncio: null,
  outros: [],
};

/**
 * O posicionamento vem do `{{placement}}` do Meta e é sempre Capitalizado_Com_
 * Underscores (Instagram_Reels, Facebook_Mobile_Feed). O slug da campanha começa
 * em minúscula — é esse degrau que usamos pra cortar, em vez de manter uma lista
 * de posicionamentos que o Meta muda quando quer.
 */
const RE_POSICIONAMENTO = /^((?:[A-Z][A-Za-z]*)(?:_[A-Z][A-Za-z]*)*)_(?=[a-z0-9])/;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_LP = /^lp[a-z0-9]*$/i;
const RE_LOTE = /^lote[-_]?\d+$/i;
const RE_PUBLICO = /^(hot|warm|cold|quente|morno|frio|lal\d*|lookalike\d*|remarketing|rmkt)$/i;
const RE_ESTRATEGIA = /^(cbo|abo)$/i;
const RE_FORMATO = /^(videos?|estaticos?|est[aá]ticos?|carrossel|carousel|imagens?|stories|reels|criativos?)$/i;

/**
 * O Meta sufixa " — Cópia" / " - Copy" quando alguém duplica campanha, conjunto
 * ou anúncio, e o sufixo vaza pro utm_term. Sem limpar, `lpe` e `lpe — Cópia`
 * viram DUAS linhas no ranking — a mesma LP contada em dobro, o que é pior que
 * não ter o dado.
 */
function limparSufixoCopia(bloco: string): string {
  return bloco.replace(/\s*[—-]\s*(c[óo]pia|copy)\s*\d*$/i, "").trim();
}

export function parseUtmTerm(raw: string | null | undefined): ParsedTerm {
  const bruto = (raw ?? "").trim();
  if (!bruto) return { bruto: "", estruturado: false, ...VAZIO };

  const partes = bruto.split("|").map((p) => p.trim());
  const primeira = partes[0] ?? "";
  const conjunto = partes.length > 1 ? partes[1] || null : null;
  const anuncio = partes.length > 2 ? partes.slice(2).join("|") || null : null;

  // Posicionamento gruda no começo da campanha, sem separador próprio.
  let posicionamento: string | null = null;
  let restoCampanha = primeira;
  const m = primeira.match(RE_POSICIONAMENTO);
  if (m) {
    posicionamento = m[1];
    restoCampanha = primeira.slice(m[0].length);
  }

  const blocos = restoCampanha
    .split("--")
    .map((b) => limparSufixoCopia(b))
    .filter(Boolean);
  const estruturado = partes.length > 1 || blocos.length > 1;
  if (!estruturado) {
    return { bruto, estruturado: false, ...VAZIO, posicionamento, campanha: blocos[0] ?? null };
  }

  const out: ParsedTerm = { bruto, estruturado: true, ...VAZIO, posicionamento, conjunto, anuncio, outros: [] };

  /** Preenche o campo só se ainda vazio. Devolve true se consumiu o valor. */
  const tentar = (campo: keyof ParsedTerm, re: RegExp, valor: string): boolean => {
    if (out[campo] || !re.test(valor)) return false;
    (out[campo] as string) = valor;
    return true;
  };
  const RECONHECEDORES: [keyof ParsedTerm, RegExp][] = [
    ["data", RE_DATA],
    ["lp", RE_LP],
    ["lote", RE_LOTE],
    ["publico", RE_PUBLICO],
    ["estrategia", RE_ESTRATEGIA],
    ["formato", RE_FORMATO],
  ];

  blocos.forEach((b, i) => {
    // Só a primeira posição é confiável: é sempre o slug da campanha.
    if (i === 0) {
      out.campanha = b;
      return;
    }
    if (RECONHECEDORES.some(([campo, re]) => tentar(campo, re, b))) return;

    // Segunda passada: bloco COMPOSTO ("videos-lote02", "cbo-vencedores-lote02").
    // Só roda depois que o bloco inteiro falhou, e os reconhecedores são de
    // igualdade exata contra palavras conhecidas — então extrair daqui não
    // inventa significado. O que sobrar continua indo pra `outros`.
    const pedacos = b.split("-").filter(Boolean);
    if (pedacos.length > 1) {
      const sobra = pedacos.filter((p) => !RECONHECEDORES.some(([campo, re]) => tentar(campo, re, p)));
      if (sobra.length < pedacos.length) {
        if (sobra.length) out.outros.push(sobra.join("-"));
        return;
      }
    }

    // Primeiro bloco não reconhecido depois da campanha é o objetivo/etapa
    // ("vendas-captacao", "vendas-principal-leads") — estável nos 104 valores
    // reais, mas só assumido depois que os reconhecedores falharam.
    if (!out.objetivo && i === 1) return void (out.objetivo = b);
    out.outros.push(b);
  });

  return out;
}

/** Identificador curto do anúncio: o primeiro bloco do nome (adv03, ad01-...). */
export function idDoAnuncio(anuncio: string | null): string | null {
  if (!anuncio) return null;
  const primeiro = anuncio.split("--")[0]?.trim();
  return primeiro || null;
}

// ============================================================
// Identificação da LP a partir das UTMs de uma linha de planilha
// ============================================================

/** De onde a LP foi deduzida — o consumidor decide o quanto confiar. */
export type FonteLp = "term" | "campanha";

/** "lpa" / "LPAA" → "LPA"; qualquer outra coisa → null. */
export function rotuloLp(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  const m = t.match(/^lp([a-z0-9]*)$/i);
  return m ? `LP${m[1].toUpperCase()}` : null;
}

/**
 * Chave de agrupamento: só a primeira letra depois de "LP".
 *
 * A tabela de LPs do dashboard identifica a página pelo campaign_name com
 * `/lp([a-z])/`, então "lpaa" e "lpa" já chegam fundidos como LPA lá. Agrupar
 * diferente aqui faria o mesmo lançamento ter duas contagens de LP na mesma
 * tela — o rótulo fino continua disponível em `variantes`.
 */
export function chaveLp(rotulo: string): string {
  const m = rotulo.match(/^LP([A-Z0-9])/);
  return m ? `LP${m[1]}` : rotulo;
}

/**
 * A LP de um registro (lead, aplicação, resposta de pesquisa ou venda), a partir
 * do que a linha carrega de UTM. Ordem: term estruturado → LP solta no term →
 * campanha.
 *
 * A regra da campanha é a MESMA que a tabela de LPs usa (`/lp([a-z])/`, casando
 * em qualquer posição), inclusive no falso positivo que ela tem ("helpdesk" →
 * LPD). Repetir o erro de forma previsível é melhor que divergir: os dois
 * números aparecem lado a lado na mesma tela.
 */
export function lpDoRegistro(
  term: string | null | undefined,
  campaign: string | null | undefined,
): { rotulo: string; fonte: FonteLp } | null {
  const t = (term ?? "").trim();
  const c = (campaign ?? "").trim();

  const viaTerm = rotuloLp(parseUtmTerm(t).lp);
  if (viaTerm) return { rotulo: viaTerm, fonte: "term" };

  // Term não estruturado ainda pode trazer a LP solta entre separadores.
  const solto = t.match(/(?:^|[-_|])lp([a-z0-9])(?=[-_|]|$)/i);
  if (solto) return { rotulo: `LP${solto[1].toUpperCase()}`, fonte: "term" };

  const viaCampanha = c.match(/lp([a-z])/i);
  if (viaCampanha) return { rotulo: `LP${viaCampanha[1].toUpperCase()}`, fonte: "campanha" };

  return null;
}
