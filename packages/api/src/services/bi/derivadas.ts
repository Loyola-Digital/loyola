/**
 * Colunas derivadas entre consultas.
 *
 * É o que o dossiê chama de "a joia" da DSL, e a razão é específica: cada
 * `querySpec` do widget pode ter **filtros diferentes**. É isso que permite
 * "lucro" com escopos assimétricos — receita de tudo menos o gasto de uma
 * campanha só —, uma pergunta que nenhuma consulta única responde.
 *
 * A expressão é avaliada pelo parser próprio (`expressao.ts`), nunca por `eval`.
 */

import { z } from "zod";
import { analisar, avaliar, ErroDeExpressao, type No } from "./expressao.js";
import type { ResultadoDaQuery } from "./query.js";

/** Teto de consultas por widget. Quatro já é um join manual de quatro pontas. */
export const MAX_QUERIES = 4;
/** Teto de colunas derivadas. Acima disto o widget virou uma planilha. */
export const MAX_DERIVADAS = 10;

export const derivadaSchema = z.object({
  /** A chave da coluna no resultado. Slug, porque vira `key` de coluna. */
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use letras minúsculas, números e _"),
  label: z.string().min(1).max(80),
  expression: z.string().min(1).max(500),
  /**
   * `scalar` = um valor para o widget inteiro (KPI).
   * `row` = uma conta por linha, casando as consultas pela `mergeKey`.
   */
  mode: z.enum(["scalar", "row"]).default("scalar"),
  semanticType: z.enum(["currency", "number", "percent"]).default("number"),
});

export type Derivada = z.infer<typeof derivadaSchema>;

/** A coluna daquele resultado que corresponde à chave de merge. */
function colunaEquivalente(r: ResultadoDaQuery, mergeKey: string): string | undefined {
  const sufixo = (k: string) => k.split(".").slice(1).join(".");
  const alvo = sufixo(mergeKey);
  return r.columns.find((c) => c.key === mergeKey)?.key ?? r.columns.find((c) => sufixo(c.key) === alvo)?.key;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aplica as derivadas sobre os resultados das consultas do widget.
 *
 * `resultados[0]` é a consulta base — as linhas e dimensões dela é que definem a
 * forma da tabela final. As outras entram só pelo valor que a expressão pedir.
 */
export function aplicarDerivadas(
  resultados: ResultadoDaQuery[],
  derivadas: Derivada[],
  mergeKey?: string,
): ResultadoDaQuery {
  const base = resultados[0];
  if (!base) return { columns: [], rows: [], avisos: ["Widget sem consulta base."] };
  if (derivadas.length === 0) return base;

  const avisos = [...base.avisos];
  const columns = [...base.columns];
  const rows = base.rows.map((l) => ({ ...l }));

  // Índice por chave de merge, uma vez por consulta — não uma varredura por
  // linha × derivada, que num top-50 com 4 consultas viraria 200 varreduras.
  //
  // Cada consulta usa a SUA coluna: `vendas.date` e `trafego.date` são chaves
  // diferentes para a mesma coisa, e é justamente entre entidades diferentes que
  // a coluna derivada existe.
  const indices = resultados.map((r) => {
    const chaveLocal = mergeKey ? colunaEquivalente(r, mergeKey) : undefined;
    if (!chaveLocal) return null;
    const mapa = new Map<string, Record<string, string | number | null>>();
    for (const linha of r.rows) {
      const chave = linha[chaveLocal];
      if (chave !== null && chave !== undefined) mapa.set(String(chave), linha);
    }
    return mapa;
  });
  const chaveNaBase = mergeKey ? colunaEquivalente(base, mergeKey) : undefined;

  for (const derivada of derivadas) {
    let arvore: No;
    try {
      arvore = analisar(derivada.expression);
    } catch (erro) {
      // Expressão inválida vira coluna vazia + aviso: um erro de digitação num
      // widget não pode derrubar o dashboard.
      avisos.push(
        `"${derivada.label}": ${erro instanceof ErroDeExpressao ? erro.message : "expressão inválida"}`,
      );
      columns.push({ key: derivada.name, label: derivada.label, semanticType: derivada.semanticType });
      for (const linha of rows) linha[derivada.name] = null;
      continue;
    }

    const avisosDaColuna = new Set<string>();

    if (derivada.mode === "scalar") {
      // Escalar: uma conta só, sobre o total de cada consulta.
      const primeiras = resultados.map((r) => r.rows[0]);
      for (const [i, r] of resultados.entries()) {
        if (r.rows.length > 1) {
          avisosDaColuna.add(
            `"${derivada.label}" usa q${i}, que tem várias linhas — a conta usou só a primeira.`,
          );
        }
      }
      const { valor, avisos: a } = avaliar(arvore, (q, col) => {
        const linha = primeiras[q];
        if (!linha || !(col in linha)) return undefined;
        return numero(linha[col]);
      });
      a.forEach((x) => avisosDaColuna.add(x));
      for (const linha of rows) linha[derivada.name] = valor;
    } else {
      if (!mergeKey || !chaveNaBase) {
        avisosDaColuna.add(
          `"${derivada.label}" é por linha, mas o widget não tem chave para casar as consultas.`,
        );
        for (const linha of rows) linha[derivada.name] = null;
      } else {
        for (const linha of rows) {
          const chave = linha[chaveNaBase];
          const { valor, avisos: a } = avaliar(arvore, (q, col) => {
            const mapa = indices[q];
            // Consulta inexistente é `undefined` (referência quebrada). Consulta
            // que existe mas não tem essa linha é `null` — ausência de par, que
            // é resultado legítimo, não erro de expressão.
            if (!mapa) return q < resultados.length ? null : undefined;
            const par = mapa.get(String(chave));
            if (!par) return null;
            return col in par ? numero(par[col]) : undefined;
          });
          a.forEach((x) => avisosDaColuna.add(x));
          linha[derivada.name] = valor;
        }
      }
    }

    columns.push({ key: derivada.name, label: derivada.label, semanticType: derivada.semanticType });
    avisos.push(...avisosDaColuna);
  }

  return { columns, rows, avisos };
}

/**
 * Confere se as derivadas fazem sentido para as consultas declaradas.
 *
 * Roda na ESCRITA do widget, não só na leitura: uma expressão que aponta para
 * `q3` num widget de duas consultas precisa ser recusada na hora de salvar, e
 * não virar coluna vazia todo dia.
 */
export function validarDerivadas(
  derivadas: Derivada[],
  quantidadeDeQueries: number,
  mergeKey?: string,
): string[] {
  const problemas: string[] = [];
  const nomes = new Set<string>();

  for (const d of derivadas) {
    if (nomes.has(d.name)) problemas.push(`Coluna "${d.name}" declarada duas vezes.`);
    nomes.add(d.name);

    try {
      const arvore = analisar(d.expression);
      const visitar = (n: No): void => {
        if (n.tipo === "ref" && n.query >= quantidadeDeQueries) {
          problemas.push(`"${d.label}" usa q${n.query}, e o widget só tem ${quantidadeDeQueries} consulta(s).`);
        } else if (n.tipo === "neg") visitar(n.de);
        else if (n.tipo === "bin") {
          visitar(n.esq);
          visitar(n.dir);
        }
      };
      visitar(arvore);
    } catch (erro) {
      problemas.push(
        `"${d.label}": ${erro instanceof ErroDeExpressao ? erro.message : "expressão inválida"}`,
      );
    }

    if (d.mode === "row" && !mergeKey) {
      problemas.push(`"${d.label}" é por linha e precisa de uma dimensão em comum entre as consultas.`);
    }
  }

  return problemas;
}

/**
 * Escolhe sozinho a chave que casa duas consultas.
 *
 * O dossiê manda copiar isto sem pensar muito: é o que torna multi-entidade
 * usável sem interface de join. A data é a primeira candidata porque toda
 * entidade tem a dela — e é a que faz "receita por dia menos gasto por dia"
 * funcionar sem ninguém explicar nada.
 */
export function chaveDeMergeSugerida(dimensoesPorQuery: string[][]): string | undefined {
  const [primeira, ...resto] = dimensoesPorQuery;
  if (!primeira?.length) return undefined;

  const sufixo = (k: string) => k.split(".").slice(1).join(".");
  const candidatas = primeira.filter((k) =>
    resto.every((outras) => outras.some((o) => sufixo(o) === sufixo(k))),
  );
  // Data primeiro; depois a primeira em comum, qualquer que seja.
  return candidatas.find((k) => sufixo(k) === "date") ?? candidatas[0];
}
