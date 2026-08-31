"use client";

/**
 * A primeira página do PDF, desenhada como capa do card.
 *
 * ## Por que renderizar, em vez de mostrar um ícone
 *
 * Numa grade de referências, a capa é o que faz reconhecer. Um ícone genérico
 * de PDF ao lado de doze outros ícones genéricos de PDF não distingue nada — e
 * a biblioteca inteira existe para achar de novo o que se salvou.
 *
 * ## Só quando entra em tela
 *
 * Cada render baixa o PDF e desenha num canvas. Fazer isso para trinta cards de
 * uma vez travaria a página e puxaria dezenas de megabytes que ninguém pediu.
 * O `IntersectionObserver` deixa o trabalho acontecer quando o card aparece.
 *
 * ## Falhar aqui não é grave
 *
 * PDF protegido, corrompido ou grande demais cai no ícone — a mesma capa que
 * havia antes. A referência continua abrindo no lightbox de qualquer forma.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

/** Largura do bitmap. O card tem ~300px; 600 cobre telas retina sem exagero. */
const LARGURA = 600;

/** Acima disto nem tenta: baixar 40 MB para desenhar uma capa não se paga. */
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

type Estado = "espera" | "carregando" | "pronto" | "falhou";

export function PdfCapa({
  url,
  titulo,
  tamanhoBytes,
}: {
  url: string;
  titulo: string;
  tamanhoBytes?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("espera");
  const [proporcao, setProporcao] = useState<number | null>(null);

  // Só começa quando o card entra em tela.
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const no = caixaRef.current;
    if (!no || visivel) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setVisivel(true);
      },
      // 200px de antecedência: a capa fica pronta pouco antes de aparecer, em
      // vez de piscar depois que já está sendo olhada.
      { rootMargin: "200px" },
    );
    obs.observe(no);
    return () => obs.disconnect();
  }, [visivel]);

  useEffect(() => {
    if (!visivel || estado !== "espera") return;
    if (tamanhoBytes && tamanhoBytes > TAMANHO_MAXIMO) {
      setEstado("falhou");
      return;
    }

    let cancelado = false;
    setEstado("carregando");

    (async () => {
      try {
        // Import dinâmico: o pdf.js pesa, e a maioria das sessões não abre um
        // PDF sequer. Fora do bundle inicial, ele só chega a quem precisa.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url, disableAutoFetch: true }).promise;
        if (cancelado) return;

        const pagina = await doc.getPage(1);
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: LARGURA / base.width });

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setProporcao(viewport.width / viewport.height);

        await pagina.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelado) setEstado("pronto");

        // Libera o que o worker guardou: sem isso, uma grade de vinte PDFs
        // segura centenas de megabytes de páginas já desenhadas.
        void doc.cleanup();
      } catch {
        // PDF protegido, corrompido, CORS — o ícone dá conta.
        if (!cancelado) setEstado("falhou");
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [visivel, estado, url, tamanhoBytes]);

  return (
    <div
      ref={caixaRef}
      className="relative flex items-center justify-center bg-gradient-to-b from-rose-500/10 to-transparent"
      style={{ aspectRatio: proporcao ? String(proporcao) : "3 / 4" }}
    >
      <canvas
        ref={canvasRef}
        aria-label={`Primeira página de ${titulo}`}
        className={`h-full w-full object-contain transition-opacity duration-200 ${
          estado === "pronto" ? "opacity-100" : "opacity-0"
        }`}
      />

      {estado !== "pronto" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          {estado === "carregando" ? (
            <Loader2 className="size-6 animate-spin text-rose-600/60" />
          ) : (
            <FileText className="size-10 text-rose-600/70" />
          )}
        </div>
      )}
    </div>
  );
}
