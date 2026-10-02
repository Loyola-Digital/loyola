/**
 * Por que este widget nasceu sem número — dito em voz alta, não deixado em branco.
 *
 * ## Por que existe
 *
 * O agente responde "montei o KPI de faturamento e a pizza por origem" e some.
 * Quando as consultas voltam vazias, a tela mostra cards zerados e nada liga uma
 * coisa à outra: a pessoa não sabe se o dia não teve venda, se o filtro não
 * casou, ou se a IA errou. Foi assim que a pergunta do Alberto em 01/10/2026
 * terminou — dois widgets, zero dados, nenhuma explicação.
 *
 * Um widget vazio é um resultado legítimo (o dia realmente pode não ter tido
 * venda). O que não é legítimo é não dizer. Então aqui a saída é sempre uma
 * frase que nomeia o período e os filtros usados — com eles à vista, quem
 * perguntou enxerga em um segundo se o recorte é o que queria.
 *
 * Módulo puro: sem DB, sem rede.
 */

import { campo } from "./catalogo.js";
import { CAMPO_DE_DATA, type QuerySpec } from "./query.js";

interface ResultadoMinimo {
  rows: Record<string, string | number | null>[];
}

/** Só os filtros que a pessoa escolheu — a data é o período, e vai à parte. */
function filtrosLegiveis(spec: QuerySpec): string[] {
  const chaveDeData = CAMPO_DE_DATA[spec.entity];
  const saida: string[] = [];
  for (const [chave, filtro] of Object.entries(spec.filters ?? {})) {
    if (chave === chaveDeData) continue;
    const valores = Array.isArray(filtro.value) ? filtro.value : [filtro.value];
    const texto = valores.filter((v) => v != null && v !== "").join(", ");
    saida.push(`${campo(chave)?.label ?? chave} = ${texto || "(vazio)"}`);
  }
  return saida;
}

/** Toda métrica da linha é zero ou nula? */
function soZeros(resultado: ResultadoMinimo, spec: QuerySpec): boolean {
  if (resultado.rows.length === 0) return false;
  return resultado.rows.every((linha) =>
    spec.metrics.every((m) => {
      const v = linha[m];
      return v === null || v === undefined || v === 0;
    }),
  );
}

/**
 * A frase que explica o widget sem dado, ou `null` quando ele tem dado.
 *
 * Distingue dois casos que parecem um só na tela: nenhuma LINHA (o recorte não
 * encontrou nada) e linhas com tudo ZERO (encontrou e o valor é zero mesmo).
 * O segundo costuma ser verdade sobre o negócio; o primeiro, quase sempre, um
 * filtro que não casou.
 */
export function porQueVazio(
  titulo: string,
  spec: QuerySpec,
  resultado: ResultadoMinimo,
  periodo: { start: string; end: string },
): string | null {
  const temLinha = resultado.rows.length > 0;
  if (temLinha && !soZeros(resultado, spec)) return null;

  const filtros = filtrosLegiveis(spec);
  const recorte =
    `${periodo.start === periodo.end ? `em ${periodo.start}` : `de ${periodo.start} a ${periodo.end}`}` +
    (filtros.length ? ` com ${filtros.join(" e ")}` : " (sem filtro além do período)");

  return temLinha
    ? `"${titulo}" veio zerado: há registro ${recorte}, mas o valor é zero.`
    : `"${titulo}" não encontrou nenhum registro ${recorte}. Confira se o período e os filtros são os que você queria.`;
}
