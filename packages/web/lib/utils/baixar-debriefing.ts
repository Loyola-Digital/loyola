/**
 * Baixar o arquivo de um debriefing — o HTML original, do jeito que foi subido
 * ou gerado.
 *
 * O doc subido guarda o nome do arquivo (`fileName`); o gerado nasce com
 * `fileName: null` (o gerador não passa por upload), então o nome sai do nome
 * da campanha. Sanitiza porque `campaignName` é texto livre: barra, dois
 * pontos ou `?` no nome fazem o navegador salvar com nome quebrado — mas
 * acento fica, que `\w` trocaria "Lançamento" por "Lan_amento".
 */

export function nomeDoArquivoDebriefing(d: {
  campaignName: string;
  fileName: string | null;
}): string {
  const base = d.fileName?.replace(/\.html?$/i, "") || d.campaignName;
  const limpo = base
    .replace(/[^\p{L}\p{N}\-. _]+/gu, "_")
    .replace(/^[._\s]+/, "")
    .trim()
    .slice(0, 120);
  return `${limpo || "debriefing"}.html`;
}

/** Dispara o download no navegador. O nome já vem com a extensão. */
export function baixarHtml(nomeDoArquivo: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeDoArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
