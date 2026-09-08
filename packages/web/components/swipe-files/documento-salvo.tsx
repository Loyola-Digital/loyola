"use client";

/**
 * O documento — transcrição, roteiro, briefing — lido na tela.
 *
 * ## Por que o texto vem do servidor
 *
 * `.docx` é um ZIP com XML dentro; o navegador não abre. Sem isto, uma
 * transcrição subida vira um card que diz "Documento" e não mostra nada — o
 * que é pior que não ter subido, porque parece que o arquivo se perdeu.
 *
 * A extração fica no servidor porque a biblioteca que lê `.docx` vive lá, e
 * mandá-la para o navegador seria meio megabyte de código para ler dois mil
 * caracteres de texto.
 *
 * ## Transcrição tem marca de tempo, e ela vira âncora
 *
 * "[00:12]" no começo da linha é o gancho para achar o trecho no vídeo. Fica
 * destacado e alinhado à esquerda, para o olho descer pela coluna dos tempos
 * em vez de reler a fala inteira.
 */

import { AlertCircle, Download, Loader2 } from "lucide-react";
import { useTextoDoDocumento } from "@/lib/hooks/use-swipe-files";

/** `[00:12]` ou `00:12` no começo da linha. */
const MARCA_DE_TEMPO = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*/;

function Linha({ texto }: { texto: string }) {
  const m = MARCA_DE_TEMPO.exec(texto);
  if (!m) return <p className="py-0.5">{texto}</p>;
  return (
    <p className="flex gap-3 py-0.5">
      <span className="shrink-0 select-none font-mono text-[11px] tabular-nums text-white/40">
        {m[1]}
      </span>
      <span className="min-w-0">{texto.slice(m[0].length)}</span>
    </p>
  );
}

export function DocumentoSalvo({
  id,
  titulo,
  urlDoArquivo,
}: {
  id: string;
  titulo: string;
  urlDoArquivo: string | null;
}) {
  // Pelo cliente da API, não por `fetch` cru: a rota exige o token do Clerk,
  // e um fetch sem ele volta 401 e a tela diria "não consegui ler".
  const { data, error, isLoading } = useTextoDoDocumento(id);
  const texto = data?.texto ?? null;
  const erro = error
    ? error instanceof Error
      ? error.message
      : "Não consegui ler este documento."
    : null;

  if (erro) {
    return (
      <div className="flex h-[86vh] w-full flex-col items-center justify-center gap-3 text-center text-white/70">
        <AlertCircle className="h-8 w-8" />
        <p className="max-w-sm text-sm">{erro}</p>
        {urlDoArquivo && (
          <a
            href={urlDoArquivo}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar o arquivo
          </a>
        )}
      </div>
    );
  }

  if (isLoading || texto === null) {
    return (
      <div className="flex h-[86vh] w-full items-center justify-center gap-2 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Lendo o documento…
      </div>
    );
  }

  if (texto.trim().length === 0) {
    return (
      <div className="flex h-[86vh] w-full flex-col items-center justify-center gap-3 text-center text-white/60">
        <p className="text-sm">Este documento não tem texto.</p>
        {urlDoArquivo && (
          <a
            href={urlDoArquivo}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar o arquivo
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="h-[86vh] w-full overflow-y-auto rounded bg-neutral-900 px-6 py-5">
      {/* Coluna estreita: transcrição é texto corrido, e linha longa demais
          faz o olho perder o começo da seguinte. */}
      <article className="mx-auto max-w-[62ch] text-[13.5px] leading-relaxed text-white/85">
        <h2 className="mb-4 border-b border-white/10 pb-3 text-[15px] font-semibold text-white">
          {titulo}
        </h2>
        {texto.split("\n").map((linha, i) =>
          linha.trim() ? <Linha key={i} texto={linha} /> : <div key={i} className="h-2" />,
        )}
      </article>
    </div>
  );
}
