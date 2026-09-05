"use client";

/**
 * A capa de uma referência do Swipe Files, em qualquer tamanho.
 *
 * Vive fora da galeria porque o mapa de funil mostra as mesmas peças — e duas
 * implementações da mesma capa divergem: a regra de "vídeo não vai em `<img>`"
 * já se perdeu uma vez e cobriu a galeria de ícones quebrados.
 *
 * ## Por que o corte é pelo TOPO
 *
 * O acervo é feito de landing pages — 116 das 291. Uma página inteira tem
 * proporção de 1:8, e `object-cover` centrado numa miniatura de 80px devolve
 * uma faixa horizontal do meio dela: uma listra de texto corrido, igual à da
 * página seguinte. Pelo topo vem o que identifica a peça — logo, headline,
 * hero.
 *
 * ## Sem imagem nenhuma não é um retângulo vazio
 *
 * Medido: 90 dos 117 links não têm `og:image`. Um ícone cinza repetido noventa
 * vezes é indistinguível e parece imagem que falhou. A capa mostra o que de
 * fato identifica — título e domínio — sobre uma cor derivada do título.
 */

import { FileText, Image as ImageIcon, Link2, Play } from "lucide-react";
import { miniaturaDoSwipe } from "@/lib/utils/miniatura-do-swipe";
import type { SwipeFile } from "@/lib/hooks/use-swipe-files";

/** Cor estável derivada do texto: a mesma referência tem sempre a mesma. */
export function corDe(texto: string): string {
  let soma = 0;
  for (const c of texto) soma = (soma * 31 + c.charCodeAt(0)) % 100_000;
  return `hsl(${soma % 360} 42% 32%)`;
}

const ICONE = { image: ImageIcon, video: Play, pdf: FileText, link: Link2 } as const;
const ROTULO = { image: "Imagem", video: "Vídeo", pdf: "PDF", link: "Link" } as const;

export function CapaSemImagem({
  item,
  compacta = false,
}: {
  item: Pick<SwipeFile, "title" | "sourceUrl" | "assetKind">;
  /** No card do mapa a capa tem 40px: só cabe o ícone. */
  compacta?: boolean;
}) {
  const Icone = ICONE[item.assetKind];

  let dominio: string | null = null;
  try {
    if (item.sourceUrl) dominio = new URL(item.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    /* origem inválida: fica sem o domínio, que é só um enfeite aqui */
  }
  // O anexo do ClickUp no lugar do domínio não diz nada a ninguém.
  const doClickUp = dominio?.includes("clickup") ?? false;

  return (
    <div
      className={`flex h-full w-full flex-col justify-between overflow-hidden text-white ${
        compacta ? "items-center justify-center p-1" : "p-2"
      }`}
      style={{ background: `linear-gradient(150deg, ${corDe(item.title)}, rgba(0,0,0,.55))` }}
    >
      {compacta ? (
        <Icone className="h-3.5 w-3.5 opacity-80" />
      ) : (
        <>
          <Icone className="h-3 w-3 shrink-0 opacity-60" />
          <div className="min-w-0">
            <p className="line-clamp-3 text-[10px] font-semibold leading-snug">{item.title}</p>
            <p className="mt-0.5 truncate text-[9px] opacity-70">
              {dominio && !doClickUp ? dominio : ROTULO[item.assetKind]}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export function CapaDoSwipe({
  item,
  className = "",
  compacta = false,
}: {
  item: SwipeFile;
  className?: string;
  compacta?: boolean;
}) {
  const { forma, url } = miniaturaDoSwipe(item);

  if (forma === "imagem" && url) {
    return (
      <img
        src={url}
        alt={item.title}
        loading="lazy"
        className={`object-cover object-top ${className}`}
      />
    );
  }
  if (forma === "video" && url) {
    return (
      <video
        // `#t=0.1` pede o primeiro quadro: sem isso o player mostra um
        // retângulo preto até alguém dar play, e a miniatura não diz nada.
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className={`object-cover object-top ${className}`}
      />
    );
  }
  // PDF cai aqui de propósito: desenhá-lo de verdade custa um `<embed>` por
  // célula, e num grid de trinta isso trava a escolha em vez de ajudá-la.
  return (
    <div className={className}>
      <CapaSemImagem item={item} compacta={compacta} />
    </div>
  );
}
