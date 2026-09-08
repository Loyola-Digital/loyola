"use client";

/**
 * A página HTML salva, desenhada como capa do card.
 *
 * ## Por que a página inteira, e não uma imagem gerada no upload
 *
 * O caminho óbvio seria tirar um screenshot quando o arquivo sobe e guardar o
 * PNG junto. Custaria um navegador headless no servidor (~400 MB na imagem da
 * API, um Chromium por render), uma coluna nova, mais espaço no bucket — e não
 * valeria para NENHUM dos arquivos já salvos sem um backfill à parte.
 *
 * Renderizar aqui custa nada disso, e é o mesmo desenho que a `PdfCapa` já faz
 * com a primeira página do PDF. Funciona retroativo: as páginas subidas semana
 * passada ganham capa assim que a grade abre.
 *
 * ## O truque da escala, e por que 800 e não 1280
 *
 * Uma página feita para desktop espremida em 300px não vira miniatura: vira o
 * layout mobile, com tudo empilhado, e duas landing pages diferentes ficam com
 * a mesma cara. O iframe renderiza largo e o `scale` do CSS encolhe — o mesmo
 * que o navegador faz ao dar zoom out.
 *
 * A largura foi escolhida comparando 640, 1024 e 1280 lado a lado com um
 * arquivo real. Quanto mais larga, menor a escala e mais ilegível a capa: a
 * 1280 o resultado é a página inteira em 22%, cinza e indistinguível. 800 fica
 * acima do breakpoint mobile comum (768px) — o layout ainda não empilha — e
 * cabe em 37%, onde headline, cores e a forma do herói ainda se reconhecem.
 * É a mesma escolha que `enquadramento.ts` faz para o PDF: o topo legível vale
 * mais que a página inteira ilegível.
 *
 * ## `allow-scripts`, pelo mesmo motivo do visualizador
 *
 * Muita página salva monta o conteúdo com JavaScript — sem scripts, a capa
 * seria uma moldura vazia. Sem `allow-same-origin` junto, o documento fica
 * numa origem opaca: não alcança cookie, `localStorage`, o DOM desta página
 * nem a nossa API. **Os dois juntos seriam o erro grave**, porque aí o script
 * pode remover o próprio `sandbox` e escapar.
 *
 * ## O que ISTO custa, já que scripts rodam
 *
 * Menos do que parece. Medido com o PDI do time — que monta a página inteira
 * por JavaScript e ainda busca fonte externa —, o `load` do iframe dispara em
 * ~190ms na primeira vez e ~95ms com a fonte em cache. Só as capas que entram
 * em tela renderizam, e uma página acima do limite nem é baixada.
 *
 * O que fica: uma página com animação em laço continua gastando CPU depois de
 * sair da tela, porque desmontar o iframe faria a capa piscar toda vez que a
 * grade rolasse de volta. É o caso raro — página salva monta o conteúdo e
 * para —, e trocamos o pior caso pelo comportamento certo no caso comum.
 */

import { useEffect, useRef, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { motivoDaFalha, type CausaDaFalha } from "@/lib/swipe/motivo-da-falha";
import { decodificarHtml } from "@/lib/swipe/decodificar-html";

/** A largura que o iframe finge ter. O porquê de 800 está no cabeçalho. */
const LARGURA_VIRTUAL = 800;

/** Proporção da capa. Retrato, porque o que identifica a página é o topo. */
const PROPORCAO = 3 / 4;

/** Acima disto nem tenta: a capa não se paga em megabytes de download. */
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

/** O prazo do download. Curto — é HTML, não vídeo. */
const PRAZO_MS = 10_000;

class FalhaDaCapa extends Error {
  constructor(readonly causa: CausaDaFalha) {
    super(causa.tipo);
  }
}

type Estado =
  | { fase: "espera" }
  | { fase: "carregando" }
  | { fase: "pronto"; html: string }
  | { fase: "falhou"; motivo: string };

export function PaginaCapa({
  url,
  titulo,
  tamanhoBytes,
}: {
  url: string | null | undefined;
  titulo: string;
  tamanhoBytes?: number | null;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "espera" });

  // Quanto encolher. Medido, porque o card é fluido: a grade é masonry e a
  // largura muda com a janela e com o número de colunas.
  const [escala, setEscala] = useState(0);

  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const no = caixaRef.current;
    if (!no || visivel) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setVisivel(true);
      },
      { rootMargin: "200px" },
    );
    obs.observe(no);
    return () => obs.disconnect();
  }, [visivel]);

  useEffect(() => {
    const no = caixaRef.current;
    if (!no) return;
    const medir = () => {
      const largura = no.clientWidth;
      if (largura > 0) setEscala(largura / LARGURA_VIRTUAL);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(no);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel) return;

    if (!url) {
      setEstado({
        fase: "falhou",
        motivo: motivoDaFalha({ tipo: "sem-link" }),
      });
      return;
    }
    if (tamanhoBytes && tamanhoBytes > TAMANHO_MAXIMO) {
      setEstado({
        fase: "falhou",
        motivo: motivoDaFalha({ tipo: "grande-demais" }),
      });
      return;
    }

    let cancelado = false;
    setEstado({ fase: "carregando" });

    const relogio = new AbortController();
    const prazo = setTimeout(() => relogio.abort(), PRAZO_MS);

    fetch(url, { signal: relogio.signal })
      .then((r) => {
        if (!r.ok) throw new FalhaDaCapa({ tipo: "http", status: r.status });
        return r.arrayBuffer();
      })
      .then((bytes) => {
        if (cancelado) return;
        setEstado({ fase: "pronto", html: decodificarHtml(bytes) });
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        const causa: CausaDaFalha =
          e instanceof FalhaDaCapa
            ? e.causa
            : relogio.signal.aborted
              ? { tipo: "prazo" }
              : e instanceof TypeError
                ? { tipo: "rede" }
                : { tipo: "pagina" };
        setEstado({ fase: "falhou", motivo: motivoDaFalha(causa) });
      })
      .finally(() => clearTimeout(prazo));

    return () => {
      cancelado = true;
      clearTimeout(prazo);
      relogio.abort();
    };
  }, [visivel, url, tamanhoBytes]);

  return (
    <div
      ref={caixaRef}
      className="relative overflow-hidden bg-gradient-to-b from-sky-500/10 to-transparent"
      style={{ aspectRatio: String(PROPORCAO) }}
    >
      {estado.fase === "pronto" && escala > 0 && (
        <iframe
          srcDoc={estado.html}
          title={`Prévia de ${titulo}`}
          /* NUNCA acrescentar `allow-same-origin` aqui — ver o cabeçalho. */
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          scrolling="no"
          aria-hidden="true"
          /* O clique tem que chegar no botão que abre o visualizador. Sem
             isto, clicar na capa cai dentro da página renderizada e não
             acontece nada. */
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{
            width: LARGURA_VIRTUAL,
            height: LARGURA_VIRTUAL / PROPORCAO,
            transform: `scale(${escala})`,
          }}
        />
      )}

      {estado.fase !== "pronto" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          {estado.fase === "carregando" || estado.fase === "espera" ? (
            <Loader2 className="size-6 animate-spin text-sky-600/60" />
          ) : (
            <>
              <Globe className="size-8 text-sky-600/70" />
              <p className="text-[10px] leading-tight text-muted-foreground">
                {estado.motivo}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
