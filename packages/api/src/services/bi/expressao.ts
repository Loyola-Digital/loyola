/**
 * O avaliador de expressões derivadas.
 *
 * ## Por que um parser escrito à mão
 *
 * A expressão é **código do usuário rodando no nosso servidor**. `eval` e
 * `new Function` estão fora — não como preferência de estilo, mas porque
 * qualquer uma das duas dá acesso ao processo inteiro a partir de um campo de
 * texto de um widget. "Só no cliente" também não vale: o cliente é de quem
 * escreveu a expressão.
 *
 * A gramática é minúscula de propósito. Tudo o que não for número, referência
 * `qN.coluna`, os quatro operadores e parênteses é **erro de análise** — a lista
 * do que se aceita é fechada, não a lista do que se proíbe.
 *
 * ```
 * expr    := termo (('+' | '-') termo)*
 * termo   := unario (('*' | '/') unario)*
 * unario  := '-'? primario
 * primario := numero | referencia | '(' expr ')'
 * ```
 */

/** Teto de tamanho: expressão gigante é erro de uso, não caso de uso. */
export const MAX_CARACTERES = 500;

export class ErroDeExpressao extends Error {
  constructor(
    message: string,
    /** Posição aproximada do problema, para a tela apontar. */
    public readonly posicao?: number,
  ) {
    super(message);
    this.name = "ErroDeExpressao";
  }
}

export type No =
  | { tipo: "numero"; valor: number }
  | { tipo: "ref"; query: number; coluna: string }
  | { tipo: "neg"; de: No }
  | { tipo: "bin"; op: "+" | "-" | "*" | "/"; esq: No; dir: No };

// ============================================================
// Léxico
// ============================================================

type Token =
  | { t: "num"; v: number; i: number }
  | { t: "ref"; q: number; col: string; i: number }
  | { t: "op"; v: "+" | "-" | "*" | "/"; i: number }
  | { t: "("; i: number }
  | { t: ")"; i: number };

const REF = /^q(\d+)\.([a-zA-Z_][a-zA-Z0-9_.]*)/;
const NUM = /^\d+(\.\d+)?/;

function tokenizar(texto: string): Token[] {
  if (texto.length > MAX_CARACTERES) {
    throw new ErroDeExpressao(`A expressão passa de ${MAX_CARACTERES} caracteres.`);
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < texto.length) {
    const c = texto[i]!;

    if (c === " " || c === "\t" || c === "\n") {
      i += 1;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push({ t: c, i });
      i += 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c, i });
      i += 1;
      continue;
    }

    const resto = texto.slice(i);

    // A referência vem ANTES do número: `q0` começa com letra, mas o `0` dentro
    // dela não pode ser lido como literal.
    const ref = REF.exec(resto);
    if (ref) {
      tokens.push({ t: "ref", q: Number(ref[1]), col: ref[2]!, i });
      i += ref[0].length;
      continue;
    }

    const num = NUM.exec(resto);
    if (num) {
      tokens.push({ t: "num", v: Number(num[0]), i });
      i += num[0].length;
      continue;
    }

    // Aqui morrem `process.exit(1)`, `constructor`, `require`, aspas, ponto e
    // vírgula e tudo o mais: não há regra que os aceite.
    throw new ErroDeExpressao(
      `Não entendi "${resto.slice(0, 12)}". Use números, qN.coluna, + - * / e parênteses.`,
      i,
    );
  }

  return tokens;
}

// ============================================================
// Análise
// ============================================================

export function analisar(texto: string): No {
  const tokens = tokenizar(texto);
  if (tokens.length === 0) throw new ErroDeExpressao("A expressão está vazia.");

  let pos = 0;
  const olhar = (): Token | undefined => tokens[pos];

  function expr(): No {
    let no = termo();
    for (;;) {
      const t = olhar();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        pos += 1;
        no = { tipo: "bin", op: t.v, esq: no, dir: termo() };
      } else {
        return no;
      }
    }
  }

  function termo(): No {
    let no = unario();
    for (;;) {
      const t = olhar();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) {
        pos += 1;
        no = { tipo: "bin", op: t.v, esq: no, dir: unario() };
      } else {
        return no;
      }
    }
  }

  function unario(): No {
    const t = olhar();
    if (t?.t === "op" && t.v === "-") {
      pos += 1;
      return { tipo: "neg", de: unario() };
    }
    return primario();
  }

  function primario(): No {
    const t = olhar();
    if (!t) throw new ErroDeExpressao("A expressão termina antes da hora.");

    if (t.t === "num") {
      pos += 1;
      return { tipo: "numero", valor: t.v };
    }
    if (t.t === "ref") {
      pos += 1;
      return { tipo: "ref", query: t.q, coluna: t.col };
    }
    if (t.t === "(") {
      pos += 1;
      const dentro = expr();
      const fecha = olhar();
      if (fecha?.t !== ")") throw new ErroDeExpressao("Faltou fechar um parêntese.", t.i);
      pos += 1;
      return dentro;
    }
    throw new ErroDeExpressao("Esperava um número, uma coluna ou um parêntese.", t.i);
  }

  const raiz = expr();
  const sobra = olhar();
  if (sobra) {
    // Sobra significa expressão malformada (`1 2`, `q0.a q1.b`). Aceitar em
    // silêncio devolveria o valor da primeira metade como se fosse o total.
    throw new ErroDeExpressao("Sobrou coisa depois do fim da expressão.", sobra.i);
  }
  return raiz;
}

/** As referências que a expressão usa — o editor precisa saber o que ela puxa. */
export function referencias(no: No): { query: number; coluna: string }[] {
  const saida: { query: number; coluna: string }[] = [];
  const visitar = (n: No) => {
    if (n.tipo === "ref") saida.push({ query: n.query, coluna: n.coluna });
    else if (n.tipo === "neg") visitar(n.de);
    else if (n.tipo === "bin") {
      visitar(n.esq);
      visitar(n.dir);
    }
  };
  visitar(no);
  return saida;
}

// ============================================================
// Avaliação
// ============================================================

export interface ResultadoDaExpressao {
  valor: number | null;
  avisos: string[];
}

/**
 * Avalia a árvore.
 *
 * `null` é contagioso de propósito: se um operando não tem amostra, a conta que
 * o usa não tem resultado. Devolver `0` no lugar afirmaria uma medição que não
 * houve — e o número entraria no gráfico como se fosse real.
 */
export function avaliar(
  no: No,
  buscar: (query: number, coluna: string) => number | null | undefined,
): ResultadoDaExpressao {
  const avisos: string[] = [];

  const passo = (n: No): number | null => {
    switch (n.tipo) {
      case "numero":
        return n.valor;

      case "ref": {
        const v = buscar(n.query, n.coluna);
        if (v === undefined) {
          // Referência a query ou coluna que não existe: aviso e `null`, nunca
          // exceção — um erro de digitação num widget não pode derrubar o
          // dashboard inteiro.
          avisos.push(`"q${n.query}.${n.coluna}" não existe nesta consulta.`);
          return null;
        }
        return v;
      }

      case "neg": {
        const v = passo(n.de);
        return v === null ? null : -v;
      }

      case "bin": {
        const a = passo(n.esq);
        const b = passo(n.dir);
        if (a === null || b === null) return null;
        switch (n.op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            if (b === 0) {
              // Divisão por zero é `null`, não `Infinity`: infinito propaga por
              // toda soma e ordenação a partir dali.
              avisos.push("Divisão por zero — o resultado ficou vazio.");
              return null;
            }
            return a / b;
        }
      }
    }
  };

  const valor = passo(no);
  return { valor: valor !== null && Number.isFinite(valor) ? valor : null, avisos };
}

/** Atalho: analisa e avalia de uma vez, sem lançar. */
export function calcular(
  texto: string,
  buscar: (query: number, coluna: string) => number | null | undefined,
): ResultadoDaExpressao {
  try {
    return avaliar(analisar(texto), buscar);
  } catch (erro) {
    return {
      valor: null,
      avisos: [erro instanceof ErroDeExpressao ? erro.message : "Expressão inválida."],
    };
  }
}
