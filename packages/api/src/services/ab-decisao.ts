/**
 * Quem venceu o teste A/B — e se dá para afirmar isso.
 *
 * ## Por que não é um arg-max
 *
 * O caminho óbvio é ordenar por taxa de conversão e coroar o primeiro. É o que
 * o VK Metrics faz, e o efeito é que **3 conversões em 10 visitas contra 2 em
 * 10 elegem um vencedor, com selo e tudo** — uma diferença que o acaso produz
 * sozinho quase metade das vezes.
 *
 * Aqui a pergunta é outra: a diferença observada é grande o bastante para não
 * ser sorte? Com conversão binária (converteu / não converteu), um teste de
 * proporção responde isso em dez linhas.
 *
 * ## Três estados, não um selo
 *
 * `sem_amostra` · `inconclusivo` · `vencedor`. O do meio é o que falta na
 * maioria das ferramentas, e é o mais comum na vida real: o teste rodou, os
 * números diferem, e ainda não dá para dizer nada. Sem esse estado a tela
 * mente por omissão — mostra um vencedor onde só há ruído.
 *
 * ## `null`, nunca `0`
 *
 * Variação sem visita não tem taxa de conversão — não tem taxa ZERO. Zero
 * contamina média, ordenação e exportação, e faz uma variação que ninguém viu
 * parecer a pior de todas.
 */

/** O que se sabe de uma variação depois de contar visitas e conversões. */
export interface ContagemDaVariacao {
  id: string;
  nome: string;
  /** Quantos viram a página. É o denominador — sem ele não há taxa. */
  visitas: number;
  conversoes: number;
}

export type EstadoDoTeste = "sem_amostra" | "inconclusivo" | "vencedor";

export interface LinhaDoResultado extends ContagemDaVariacao {
  /** `null` quando não houve visita — nunca 0. */
  taxa: number | null;
  /** Só a vencedora recebe `true`, e só quando o estado é `vencedor`. */
  vencedora: boolean;
}

export interface ResultadoDoTeste {
  estado: EstadoDoTeste;
  linhas: LinhaDoResultado[];
  /** A explicação que vai para a tela, em português e sem jargão. */
  mensagem: string;
  /** Menor p-valor entre as comparações feitas. `null` sem amostra. */
  pValor: number | null;
  /** Nível exigido, já corrigido para comparações múltiplas. */
  alfaEfetivo: number;
  /** Quantas comparações par a par entraram na correção. */
  comparacoes: number;
}

/** Abaixo disto nem vale calcular: qualquer taxa é ruído. */
export const VISITAS_MINIMAS = 30;

/** O padrão da casa. 5% de chance de gritar vitória onde não há. */
export const ALFA_PADRAO = 0.05;

/**
 * A estatística z de duas proporções.
 *
 * `null` quando não dá para calcular — amostra vazia ou variância zero (as duas
 * variações com 0% ou com 100%, onde não há o que distinguir).
 */
export function zDeDuasProporcoes(
  a: { conversoes: number; visitas: number },
  b: { conversoes: number; visitas: number },
): number | null {
  if (a.visitas <= 0 || b.visitas <= 0) return null;
  const p1 = a.conversoes / a.visitas;
  const p2 = b.conversoes / b.visitas;
  // Proporção combinada: sob a hipótese de que as duas vêm da mesma população.
  const p = (a.conversoes + b.conversoes) / (a.visitas + b.visitas);
  const se = Math.sqrt(p * (1 - p) * (1 / a.visitas + 1 / b.visitas));
  if (se === 0) return null;
  return (p1 - p2) / se;
}

/**
 * Função erro, por Abramowitz & Stegun 7.1.26.
 *
 * Erro máximo de 1,5e-7 — três ordens de grandeza abaixo do que muda qualquer
 * decisão em alfa de 5%. Escrita aqui porque o JavaScript não tem `erf` e
 * carregar uma biblioteca de estatística inteira por uma função seria caro.
 */
function erf(x: number): number {
  const sinal = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return sinal * y;
}

/** p-valor bilateral de um z. Bilateral porque B pode ganhar de A ou perder. */
export function pValorBilateral(z: number): number {
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

/**
 * O veredito.
 *
 * Compara a variação de maior taxa contra cada uma das outras. Ela só é
 * declarada vencedora se ganhar de TODAS com significância — ganhar da pior e
 * empatar com a segunda não é vitória.
 *
 * ## Bonferroni
 *
 * Com k variações são k−1 comparações, e cada uma tem sua própria chance de
 * falso positivo. Testar quatro variações a 5% dá ~14% de chance de coroar um
 * vencedor inexistente. Dividir alfa pelo número de comparações corrige isso —
 * é conservador, e conservador é o lado certo de errar aqui.
 */
export function decidirVencedor(
  variacoes: ContagemDaVariacao[],
  opcoes: { alfa?: number; visitasMinimas?: number } = {},
): ResultadoDoTeste {
  const alfa = opcoes.alfa ?? ALFA_PADRAO;
  const minimo = opcoes.visitasMinimas ?? VISITAS_MINIMAS;

  const taxaDe = (v: ContagemDaVariacao) =>
    v.visitas > 0 ? v.conversoes / v.visitas : null;
  const comTaxa = variacoes.map((v) => ({
    ...v,
    taxa: taxaDe(v),
    vencedora: false,
  }));

  const semDecisao = (
    estado: EstadoDoTeste,
    mensagem: string,
    pValor: number | null = null,
  ) => ({
    estado,
    linhas: comTaxa,
    mensagem,
    pValor,
    alfaEfetivo: alfa,
    comparacoes: 0,
  });

  if (variacoes.length < 2) {
    return semDecisao(
      "sem_amostra",
      "Um teste precisa de pelo menos duas variações.",
    );
  }

  // Toda variação precisa de amostra própria: a que tem 5 visitas não pode ser
  // declarada perdedora, e sem ela a comparação não fecha.
  const magras = comTaxa.filter((v) => v.visitas < minimo);
  if (magras.length > 0) {
    const faltam = magras.map((v) => `${v.nome} (${v.visitas})`).join(", ");
    return semDecisao(
      "sem_amostra",
      `Ainda sem visitas suficientes para concluir — mínimo de ${minimo} por variação. Faltam: ${faltam}.`,
    );
  }

  const lider = comTaxa.reduce((a, b) =>
    (b.taxa ?? 0) > (a.taxa ?? 0) ? b : a,
  );
  const rivais = comTaxa.filter((v) => v.id !== lider.id);
  const alfaEfetivo = alfa / rivais.length;

  let piorP = 0;
  for (const rival of rivais) {
    const z = zDeDuasProporcoes(lider, rival);
    // Sem z não há como afirmar nada sobre este par — e basta um par
    // indecidível para a liderança não se sustentar.
    if (z === null) {
      return {
        ...semDecisao(
          "inconclusivo",
          "Não dá para comparar — as taxas não têm variação.",
        ),
        comparacoes: rivais.length,
        alfaEfetivo,
      };
    }
    piorP = Math.max(piorP, pValorBilateral(z));
  }

  if (piorP >= alfaEfetivo) {
    return {
      estado: "inconclusivo",
      linhas: comTaxa,
      mensagem:
        `Diferença ainda não conclusiva (p = ${piorP.toFixed(3)}, exigido < ${alfaEfetivo.toFixed(3)}). ` +
        `Rodando mais tempo ela pode aparecer — ou não existir.`,
      pValor: piorP,
      alfaEfetivo,
      comparacoes: rivais.length,
    };
  }

  return {
    estado: "vencedor",
    linhas: comTaxa.map((v) => ({ ...v, vencedora: v.id === lider.id })),
    mensagem: `${lider.nome} vence com significância (p = ${piorP.toFixed(3)}).`,
    pValor: piorP,
    alfaEfetivo,
    comparacoes: rivais.length,
  };
}

/**
 * Quantas visitas POR VARIAÇÃO o teste precisa para ter chance de concluir.
 *
 * Serve para a pergunta que se faz antes de ativar: "com o meu volume, isso
 * termina algum dia?". Um teste que precisa de 40 mil visitas por variação num
 * site que recebe 300 por mês não deve ser ligado — e saber disso antes vale
 * mais que descobrir dois meses depois.
 *
 * Fórmula clássica de duas proporções, com z bilateral em alfa e poder de 80%
 * (z = 1,96 e 0,84). `mde` é a diferença absoluta que se quer detectar: 0,02
 * para "de 5% para 7%".
 */
export function amostraNecessaria(
  taxaBase: number,
  mde: number,
): number | null {
  if (taxaBase <= 0 || taxaBase >= 1 || mde <= 0) return null;
  const p2 = taxaBase + mde;
  if (p2 >= 1) return null;
  const zAlfa = 1.959964;
  const zPoder = 0.8416212;
  const pMedio = (taxaBase + p2) / 2;
  const n =
    (zAlfa * Math.sqrt(2 * pMedio * (1 - pMedio)) +
      zPoder * Math.sqrt(taxaBase * (1 - taxaBase) + p2 * (1 - p2))) **
      2 /
    mde ** 2;
  return Math.ceil(n);
}
