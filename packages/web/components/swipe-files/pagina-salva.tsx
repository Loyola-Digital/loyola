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
 * ## `allow-scripts`, e por que ele é seguro aqui
 *
 * Muita página salva monta o conteúdo com JavaScript. O PDI do time é assim:
 * medido no arquivo, o markup tem 176 caracteres — só os rótulos — e todo o
 * resto vem de um `<script type="application/json">` lido na hora. Sem
 * scripts, a página renderiza a moldura e nada dentro.
 *
 * `allow-scripts` SEM `allow-same-origin` deixa o documento numa origem
 * opaca: o script roda, mas não alcança cookie, `localStorage`, o DOM desta
 * página nem faz requisição autenticada para a nossa API. É o mesmo arranjo
 * que CodePen e JSFiddle usam para rodar código de estranhos.
 *
 * **Os dois juntos seriam o erro grave**: com `allow-same-origin` no meio, o
 * script pode remover o próprio atributo `sandbox` e escapar. Um sem o outro
 * é seguro; os dois, não.
 *
 * ## A codificação
 *
 * Fica em `decodificarHtml`, compartilhada com a capa do card — as duas telas
 * precisam do mesmo palpite, e o porquê está documentado lá.
 */

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { decodificarHtml } from "@/lib/swipe/decodificar-html";

export function PaginaSalva({ url, titulo }: { url: string; titulo: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setHtml(null);
    setErro(false);

    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => vivo && setHtml(decodificarHtml(b)))
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
        /* NUNCA acrescentar `allow-same-origin` aqui — ver o cabeçalho. */
        sandbox="allow-scripts"
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
