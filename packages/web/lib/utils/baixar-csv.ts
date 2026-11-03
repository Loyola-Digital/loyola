/**
 * CSV que o Excel em português abre sem assistente de importação: separador
 * `;` e BOM no começo do arquivo. Sem o BOM, acento vira caractere estranho;
 * com vírgula em vez de `;`, o Excel pt-BR joga a linha toda numa célula.
 *
 * Virou utilitário porque a mesma função estava copiada em três telas (canais
 * do SendFlow, origem dos participantes e a tabela de vendas da etapa).
 */

/** Uma linha de CSV: cada célula entre aspas, com as aspas internas dobradas. */
function linha(celulas: readonly (string | number | null | undefined)[]): string {
  return celulas
    .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
    .join(";");
}

export function montarCsv(
  cabecalho: readonly string[],
  linhas: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return [linha(cabecalho), ...linhas.map(linha)].join("\n");
}

/** Dispara o download no navegador. Nome sem extensão: o `.csv` entra aqui. */
export function baixarCsv(nomeDoArquivo: string, conteudo: string): void {
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeDoArquivo.replace(/[^\w-]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
