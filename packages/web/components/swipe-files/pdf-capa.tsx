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
 * ## Falhar tem que ser visível, e tem que ter hora para acabar
 *
 * A versão anterior entregava a URL direto ao pdf.js e esperava. Quando o
 * arquivo não respondia — host que não resolve, bucket privado, link vencido —
 * nada acontecia: o spinner girava para sempre, indistinguível de "está
 * baixando". Um erro que parece carregamento é pior que um erro, porque
 * ninguém sabe se deve esperar mais ou avisar alguém.
 *
 * Agora o download é nosso: dá para ver o status HTTP, dá para desistir na
 * hora marcada, e o motivo aparece na tela.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

/** Largura do bitmap. O card tem ~300px; 600 cobre telas retina sem exagero. */
const LARGURA = 600;

/** Acima disto nem tenta: baixar 40 MB para desenhar uma capa não se paga. */
const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * O prazo. Depois disto, desiste e diz por quê.
 *
 * Quinze segundos é folgado para um PDF de alguns megabytes numa conexão ruim,
 * e curto o bastante para ninguém ficar olhando para um spinner achando que a
 * página travou.
 */
const PRAZO_MS = 15_000;

type Estado =
  | { fase: "espera" }
  | { fase: "carregando" }
  | { fase: "pronto" }
  | { fase: "falhou"; motivo: string };

export function PdfCapa({
  url,
  titulo,
  tamanhoBytes,
}: {
  url: string | null | undefined;
  titulo: string;
  tamanhoBytes?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "espera" });
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
    if (!visivel || estado.fase !== "espera") return;

    if (!url) {
      // Sem link não há o que baixar. Dizer isso é melhor que um ícone mudo:
      // é sintoma de storage mal configurado no servidor, não de PDF ruim.
      setEstado({ fase: "falhou", motivo: "Sem link — storage não configurado" });
      return;
    }
    if (tamanhoBytes && tamanhoBytes > TAMANHO_MAXIMO) {
      setEstado({ fase: "falhou", motivo: "Grande demais para pré-visualizar" });
      return;
    }

    let cancelado = false;
    setEstado({ fase: "carregando" });

    const relogio = new AbortController();
    const prazo = setTimeout(() => relogio.abort(), PRAZO_MS);

    (async () => {
      try {
        // O download é nosso, não do pdf.js: é assim que se enxerga o status.
        // Um 400 de bucket privado e um 404 de chave errada levam a ações
        // diferentes, e os dois viravam o mesmo spinner eterno.
        const r = await fetch(url, { signal: relogio.signal });
        if (!r.ok) {
          setEstado({
            fase: "falhou",
            motivo:
              r.status === 400 || r.status === 403
                ? "Sem permissão — o bucket não é público"
                : r.status === 404
                  ? "Arquivo não encontrado no bucket"
                  : `O servidor devolveu ${r.status}`,
          });
          return;
        }
        const dados = await r.arrayBuffer();
        if (cancelado) return;

        // Import dinâmico: o pdf.js pesa, e a maioria das sessões não abre um
        // PDF sequer. Fora do bundle inicial, ele só chega a quem precisa.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;
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
        if (!cancelado) setEstado({ fase: "pronto" });

        // Libera o que o worker guardou: sem isso, uma grade de vinte PDFs
        // segura centenas de megabytes de páginas já desenhadas.
        void doc.cleanup();
      } catch (e) {
        if (cancelado) return;
        setEstado({
          fase: "falhou",
          motivo: relogio.signal.aborted
            ? "Demorou demais — o arquivo não respondeu"
            : e instanceof TypeError
              // `TypeError` no fetch é rede: DNS que não resolve, CORS, offline.
              // É o caso do link com host errado, que era o spinner eterno.
              ? "Não consegui alcançar o arquivo"
              : "Não consegui abrir este PDF",
        });
      } finally {
        clearTimeout(prazo);
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(prazo);
      relogio.abort();
    };
  }, [visivel, estado.fase, url, tamanhoBytes]);

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
          estado.fase === "pronto" ? "opacity-100" : "opacity-0"
        }`}
      />

      {estado.fase !== "pronto" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          {estado.fase === "carregando" ? (
            <Loader2 className="size-6 animate-spin text-rose-600/60" />
          ) : (
            <>
              <FileText className="size-8 text-rose-600/70" />
              {estado.fase === "falhou" && (
                // O motivo na tela: é o que transforma "está quebrado" em algo
                // que alguém consegue consertar.
                <p className="text-[10px] leading-tight text-muted-foreground">{estado.motivo}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
