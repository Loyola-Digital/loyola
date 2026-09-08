"use client";

/**
 * A página HTML salva, renderizada dentro do visualizador.
 *
 * ## Por que o conteúdo é BUSCADO e injetado, em vez de apontar o iframe
 *
 * Apontando `src` para o arquivo, quem decide se aquilo é uma página ou um
 * download é o `Content-Type` do storage. Reproduzido no navegador: servido
 * como `text/html`, renderiza; servido como `application/octet-stream`, o
 * navegador tenta baixar, o `sandbox` bloqueia o download, e sobra um
 * **iframe branco** — sem erro, sem aviso, sem nada para clicar.
 *
 * Com `srcDoc` o navegador renderiza o que entregamos. O rótulo do servidor
 * deixa de importar, e um arquivo antigo com mime errado volta a funcionar
 * sem precisar subir de novo.
 *
 * ## O sandbox continua fechado
 *
 * Sem `allow-scripts` e sem `allow-same-origin`: o arquivo veio de fora e pode
 * conter qualquer coisa. O CSS continua valendo, que é o que interessa.
 *
 * ## A codificação
 *
 * UTF-8 primeiro. Se o resultado vier cheio de caracteres de substituição, o
 * arquivo é de um editor antigo (Windows-1252) — e aí a segunda tentativa
 * acerta os acentos que apareceriam como "ImersÃ£o".
 */

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

/** Quantos caracteres perdidos já indicam que o UTF-8 foi o palpite errado. */
const LIMITE_DE_PERDA = 3;

function decodificar(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const perdidos = (utf8.match(/�/g) ?? []).length;
  if (perdidos <= LIMITE_DE_PERDA) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return utf8;
  }
}

export function PaginaSalva({ url, titulo }: { url: string; titulo: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setHtml(null);
    setErro(false);

    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => vivo && setHtml(decodificar(b)))
      .catch(() => vivo && setErro(true));

    return () => {
      vivo = false;
    };
  }, [url]);

  if (erro) {
    return (
      <div className="flex h-[86vh] w-full flex-col items-center justify-center gap-3 rounded bg-white text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Não consegui carregar a página.</p>
        {/* A saída que sempre funciona: fora do iframe, nenhuma restrição
            de sandbox ou de tipo se aplica. */}
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir em outra aba
        </a>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-[86vh] w-full items-center justify-center gap-2 rounded bg-white text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando a página…
      </div>
    );
  }

  return (
    <div className="relative h-[86vh] w-full">
      <iframe
        srcDoc={html}
        title={titulo}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-full w-full rounded bg-white"
      />
      {/* Sempre à mão: a página pode ser larga demais para a caixa, e ver no
          tamanho real é o gesto seguinte natural. */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] text-white backdrop-blur-sm transition-colors hover:bg-black/85"
      >
        <ExternalLink className="h-3 w-3" />
        Abrir em outra aba
      </a>
    </div>
  );
}
