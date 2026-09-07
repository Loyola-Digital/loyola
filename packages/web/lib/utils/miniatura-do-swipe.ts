/**
 * O que desenhar como miniatura de uma referência do Swipe Files.
 *
 * Existe porque a escolha erra fácil e o erro é silencioso: o `fileUrl` de um
 * vídeo dentro de uma `<img>` vira ícone de imagem quebrada, e um PDF não
 * desenha em nenhuma das duas. Já aconteceu na galeria — passou despercebido
 * enquanto havia um vídeo só, e apareceu quando viraram 23.
 *
 * Concentrar a regra aqui é o que permite o mapa de funil mostrar as mesmas
 * miniaturas da biblioteca sem repetir (nem divergir de) essa decisão.
 */

export type FormaDaMiniatura = "imagem" | "video" | "pdf" | "nenhuma";

export interface ParaMiniatura {
  assetKind: "image" | "video" | "pdf" | "link" | "html";
  fileUrl?: string | null;
  ogImage?: string | null;
}

export function miniaturaDoSwipe(item: ParaMiniatura): {
  forma: FormaDaMiniatura;
  url: string | null;
} {
  if (item.assetKind === "link") {
    // Link só tem capa se o site publicou uma: sem `og:image` não há o que
    // desenhar, e inventar um print da página seria outra feature.
    return item.ogImage ? { forma: "imagem", url: item.ogImage } : { forma: "nenhuma", url: null };
  }
  if (item.assetKind === "video") {
    return item.fileUrl ? { forma: "video", url: item.fileUrl } : { forma: "nenhuma", url: null };
  }
  if (item.assetKind === "pdf") {
    return item.fileUrl ? { forma: "pdf", url: item.fileUrl } : { forma: "nenhuma", url: null };
  }
  // A página salva não vira miniatura: desenhá-la exigiria um iframe por card,
  // e trinta iframes numa grade renderizam trinta páginas de uma vez. A capa
  // com título e domínio diz mais e custa nada.
  if (item.assetKind === "html") return { forma: "nenhuma", url: null };
  return item.fileUrl ? { forma: "imagem", url: item.fileUrl } : { forma: "nenhuma", url: null };
}
