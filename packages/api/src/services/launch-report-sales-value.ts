/**
 * Story 41.2 — §2.4: valor da venda em BRL.
 *
 * Duas responsabilidades, ambas nascidas de bugs reais:
 *
 * 1. **Resolver a coluna de preço.** A spec é explícita: usar o campo de
 *    *preço*, nunca "valor da oferta"/"valor pago". Caso real documentado: duas
 *    linhas de "valor oferta" vieram com R$ 56.693,00 e R$ 122.677,00 quando o
 *    preço real era R$ 44,90 e R$ 99,00 — inflaram o faturamento em R$ 175 mil,
 *    43% do total. O campo líquido da mesma linha mostrava R$ 3,58 e R$ 8,52,
 *    confirmando o erro.
 *
 *    ⚠️ Isso não é hipotético: em 2026-07-30 o `columnMapping` do stage de
 *    Captação Paga do **DG-PG04** aponta `valorBruto` → `"Valor oferta"` em
 *    produção (o do PG02 aponta para `"Preço"`, correto). Seguir o mapping
 *    cegamente reproduziria o bug. Por decisão do dono do produto, o motor
 *    **prefere sempre a coluna de preço** e sinaliza quando o mapping divergiu.
 *
 * 2. **Moeda estrangeira.** Sem taxa de câmbio — são produtos de preço fixo por
 *    lote, então a substituição é pelo preço BRL *modal* do mesmo produto.
 *
 * Funções puras: recebem linhas já carregadas, não tocam banco nem planilha.
 */

// ---------------------------------------------------------------------------
// Resolução da coluna de preço
// ---------------------------------------------------------------------------

/** Cabeçalhos que a spec proíbe usar como valor da venda. */
const HEADER_PROIBIDO = /valor\s*(d[ae]\s*)?oferta|valor\s*pago/i;

/** Cabeçalhos aceitos como "o campo de preço". */
const HEADER_PRECO = /^\s*pre[çc]o\s*$/i;

export interface ColunaPrecoResolvida {
  /** Cabeçalho escolhido. `null` quando nenhum candidato existe na planilha. */
  coluna: string | null;
  /** De onde veio a escolha. */
  origem: "mapping" | "header-preco" | "nenhuma";
  /**
   * `true` quando o `columnMapping` apontava para um campo proibido e o motor
   * escolheu outra coluna. Vira alerta no relatório — config errada não deve
   * passar em silêncio só porque o motor se protegeu.
   */
  mappingDivergente: boolean;
  /** Cabeçalho que o mapping indicava, para citar no alerta. */
  colunaDoMapping: string | null;
}

/**
 * Escolhe a coluna de valor da venda.
 *
 * Ordem: se o mapping aponta para uma coluna que **não** é proibida, respeita o
 * mapping (é a config do usuário). Se aponta para "valor oferta"/"valor pago",
 * procura uma coluna de preço nos cabeçalhos e usa ela, marcando divergência.
 *
 * @param colunaDoMapping - `columnMapping.valorBruto` da planilha do stage
 * @param headers - cabeçalhos reais da planilha
 */
export function resolverColunaPreco(
  colunaDoMapping: string | null | undefined,
  headers: readonly string[],
): ColunaPrecoResolvida {
  const doMapping = (colunaDoMapping ?? "").trim() || null;
  const headerPreco = headers.find((h) => HEADER_PRECO.test(h)) ?? null;

  if (doMapping && !HEADER_PROIBIDO.test(doMapping)) {
    return {
      coluna: doMapping,
      origem: "mapping",
      mappingDivergente: false,
      colunaDoMapping: doMapping,
    };
  }

  if (headerPreco) {
    return {
      coluna: headerPreco,
      origem: "header-preco",
      // Só é "divergência" se havia um mapping e ele apontava para o campo errado.
      mappingDivergente: doMapping !== null,
      colunaDoMapping: doMapping,
    };
  }

  // Nem mapping utilizável nem coluna de preço: devolver o que houver, para o
  // motor decidir se bloqueia. Não inventar coluna.
  return {
    coluna: doMapping,
    origem: doMapping ? "mapping" : "nenhuma",
    mappingDivergente: false,
    colunaDoMapping: doMapping,
  };
}

// ---------------------------------------------------------------------------
// Estatística — mediana e moda
// ---------------------------------------------------------------------------

/** Mediana. `null` para lista vazia (nunca 0 — 0 é um valor legítimo). */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? ord[meio]! : (ord[meio - 1]! + ord[meio]!) / 2;
}

/** Chave de agrupamento de dinheiro — evita `0.1 + 0.2` separar valores iguais. */
function chaveValor(v: number): string {
  return v.toFixed(2);
}

/**
 * Moda (valor mais frequente), **arredondada a 2 casas**. `null` para lista
 * vazia.
 *
 * Empate de frequência → devolve o **menor** valor. A spec não define o
 * desempate; escolhemos o conservador, porque o erro que a §2.4 combate é
 * faturamento *inflado*.
 */
export function moda(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const freq = new Map<string, { valor: number; n: number }>();
  for (const v of valores) {
    const k = chaveValor(v);
    const atual = freq.get(k);
    if (atual) atual.n += 1;
    // Guarda o valor JÁ normalizado a 2 casas, não o primeiro visto: o retorno
    // vira preço somado no faturamento, e `0.1 + 0.2` propagaria
    // 0.30000000000000004 para dentro do total.
    else freq.set(k, { valor: Number(k), n: 1 });
  }
  let melhor: { valor: number; n: number } | null = null;
  for (const cand of freq.values()) {
    if (!melhor || cand.n > melhor.n || (cand.n === melhor.n && cand.valor < melhor.valor)) {
      melhor = cand;
    }
  }
  return melhor!.valor;
}

// ---------------------------------------------------------------------------
// valorBrl
// ---------------------------------------------------------------------------

export interface LinhaVendaValor {
  /** Nome do produto. `null` conta como bucket próprio "(sem produto)". */
  produto: string | null;
  /** Valor lido da coluna de preço resolvida. */
  preco: number;
  /**
   * Moeda da linha. `null`/vazio é tratado como BRL — a planilha do Loyola não
   * mapeia coluna de moeda hoje, então o caminho normal é "tudo BRL" e a
   * detecção abaixo não liga. É a degradação correta: sem informação de moeda,
   * não há como afirmar que uma linha é estrangeira.
   */
  moeda?: string | null;
  /** Dia da venda em `YYYY-MM-DD`, já convertido para America/Sao_Paulo. */
  data: string;
}

export interface ResultadoValorBrl {
  /** Valor final em BRL por linha, na **mesma ordem** da entrada. */
  valores: number[];
  /** Quantas linhas tiveram o preço substituído pelo modal BRL (alerta W7). */
  linhasConvertidas: number;
  /** Produto → quantidade de valores de preço distintos (insumo do alerta W4). */
  precoDistintoPorProduto: Record<string, number>;
  /** Produtos em que a detecção concluiu que era preciso converter. */
  produtosConvertidos: string[];
}

const BUCKET_SEM_PRODUTO = "(sem produto)";

function chaveProduto(produto: string | null): string {
  const p = (produto ?? "").trim();
  return p || BUCKET_SEM_PRODUTO;
}

function ehBrl(moeda: string | null | undefined): boolean {
  const m = (moeda ?? "").trim().toUpperCase();
  return m === "" || m === "BRL" || m === "R$";
}

/**
 * §2.4 — valor da venda em BRL, com detecção de moeda estrangeira.
 *
 * Tradução direta do pseudocódigo da spec:
 * 1. `v = vendas.preco`
 * 2. sem linhas estrangeiras → devolve `v`
 * 3. por produto com linhas BRL **e** não-BRL: se `mediana_fx < mediana_brl × 0,5`,
 *    marca que precisa converter
 * 4. convertendo: substitui pelo preço BRL **modal** do mesmo produto no mesmo
 *    dia; sem modal no dia, o modal do produto em qualquer dia
 *
 * A decisão de converter é **por produto**, não global: um produto com preços
 * coerentes não é mexido só porque outro estava em outra moeda.
 */
export function valorBrl(linhas: readonly LinhaVendaValor[]): ResultadoValorBrl {
  const valores = linhas.map((l) => l.preco);

  // Contagem de preços distintos por produto — sobre as linhas BRL, que são a
  // coluna sob auditoria. Feita antes de qualquer substituição.
  const distintosPorProduto = new Map<string, Set<string>>();
  for (const l of linhas) {
    if (!ehBrl(l.moeda)) continue;
    const k = chaveProduto(l.produto);
    let s = distintosPorProduto.get(k);
    if (!s) {
      s = new Set();
      distintosPorProduto.set(k, s);
    }
    s.add(chaveValor(l.preco));
  }
  const precoDistintoPorProduto: Record<string, number> = {};
  for (const [k, s] of distintosPorProduto) precoDistintoPorProduto[k] = s.size;

  const indicesEstrangeiros = linhas
    .map((l, i) => (ehBrl(l.moeda) ? -1 : i))
    .filter((i) => i >= 0);

  if (indicesEstrangeiros.length === 0) {
    return { valores, linhasConvertidas: 0, precoDistintoPorProduto, produtosConvertidos: [] };
  }

  const acumular = (mapa: Map<string, number[]>, chave: string, valor: number): void => {
    const atual = mapa.get(chave);
    if (atual) atual.push(valor);
    else mapa.set(chave, [valor]);
  };

  // Preços BRL por produto e por (produto, dia) — base do modal.
  const brlPorProduto = new Map<string, number[]>();
  const brlPorProdutoDia = new Map<string, number[]>();
  for (const l of linhas) {
    if (!ehBrl(l.moeda)) continue;
    const k = chaveProduto(l.produto);
    acumular(brlPorProduto, k, l.preco);
    const kd = `${k} ${l.data}`;
    acumular(brlPorProdutoDia, kd, l.preco);
  }

  const fxPorProduto = new Map<string, number[]>();
  for (const i of indicesEstrangeiros) {
    const l = linhas[i]!;
    acumular(fxPorProduto, chaveProduto(l.produto), l.preco);
  }

  // Detecção por produto: mediana_fx < mediana_brl × 0,5 → preço não está em BRL.
  const precisaConverter = new Set<string>();
  for (const [k, fx] of fxPorProduto) {
    const brl = brlPorProduto.get(k);
    if (!brl || brl.length === 0) continue; // sem par BRL não há como comparar
    const medBrl = mediana(brl);
    const medFx = mediana(fx);
    if (medBrl === null || medFx === null || !(medBrl > 0)) continue;
    if (medFx < medBrl * 0.5) precisaConverter.add(k);
  }

  let linhasConvertidas = 0;
  if (precisaConverter.size > 0) {
    for (const i of indicesEstrangeiros) {
      const l = linhas[i]!;
      const k = chaveProduto(l.produto);
      if (!precisaConverter.has(k)) continue;
      const noDia = moda(brlPorProdutoDia.get(`${k} ${l.data}`) ?? []);
      // Sem modal no dia, o modal do produto em qualquer dia (§2.4).
      const modal = noDia ?? moda(brlPorProduto.get(k) ?? []);
      if (modal === null) continue; // sem referência BRL: manter o valor original
      valores[i] = modal;
      linhasConvertidas += 1;
    }
  }

  return {
    valores,
    linhasConvertidas,
    precoDistintoPorProduto,
    produtosConvertidos: [...precisaConverter],
  };
}

/**
 * Limiar do alerta **W4** (§8.2): produto com mais de 15 valores de preço
 * distintos = coluna contaminada.
 *
 * ⚠️ Contradição interna da spec, registrada de propósito: a §2.4 manda
 * **bloquear** nesse caso ("se um produto aparecer com dezenas de valores
 * diferentes, a coluna está contaminada → bloquear"), enquanto a §8.2 lista o
 * mesmo sintoma como **W4, alerta não-bloqueante** — e a Story 41.3 decidiu
 * explicitamente que "alerta é alerta". Seguimos a 41.3; este módulo só expõe a
 * contagem e quem decide bloquear ou não é `launch-report-guards.ts`.
 */
export const LIMITE_PRECOS_DISTINTOS = 15;

/** Produtos que estouram o limite de preços distintos (insumo do W4). */
export function produtosComPrecoContaminado(
  precoDistintoPorProduto: Record<string, number>,
  limite: number = LIMITE_PRECOS_DISTINTOS,
): { produto: string; valoresDistintos: number }[] {
  return Object.entries(precoDistintoPorProduto)
    .filter(([, n]) => n > limite)
    .map(([produto, valoresDistintos]) => ({ produto, valoresDistintos }))
    .sort((a, b) => b.valoresDistintos - a.valoresDistintos);
}
