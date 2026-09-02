/**
 * O que estes testes protegem: a leitura precisa alcançar as meta tags mesmo
 * quando elas estão fundo na página. Um teto baixo demais devolve "sem
 * preview" para um site que TEM preview — e isso é indistinguível, na tela, de
 * um site que não publica Open Graph.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchLinkPreview } from "../services/link-preview.js";

/**
 * Uma resposta HTML falsa, entregue em pedaços como a rede entrega.
 *
 * `entregues` conta o que foi realmente puxado — é como se verifica que a
 * leitura parou cedo, já que quem cancela é o reader e não o corpo.
 */
function respostaEmPedacos(
  html: string,
  pedaco = 16 * 1024,
): { resposta: Response; entregues: () => number } {
  const bytes = new TextEncoder().encode(html);
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + pedaco));
      i += pedaco;
    },
  });
  return {
    resposta: new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
    entregues: () => i,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchLinkPreview", () => {
  it("acha a meta tag que está a 700 KB do começo", async () => {
    // Medido no YouTube: o `og:image` fica no byte ~700.000, depois de um head
    // cheio de script inline. Com o teto antigo de 512 KB, um vídeo voltava
    // sem título e sem miniatura.
    const enchimento = "<script>/*" + "x".repeat(700_000) + "*/</script>";
    const html =
      `<html><head>${enchimento}` +
      `<meta property="og:title" content="Vídeo fundo na página">` +
      `<meta property="og:image" content="https://i.ytimg.com/vi/abc/max.jpg">` +
      `</head><body></body></html>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmPedacos(html).resposta));

    const og = await fetchLinkPreview("https://www.youtube.com/shorts/abc");
    expect(og.title).toBe("Vídeo fundo na página");
    expect(og.image).toBe("https://i.ytimg.com/vi/abc/max.jpg");
  });

  it("para no </head> e não baixa o corpo inteiro", async () => {
    // A parada antecipada é o que mantém o custo baixo no caso comum. Se ela
    // quebrasse, cada preview passaria a baixar megabytes de página.
    const html =
      `<html><head><meta property="og:title" content="Curto"></head>` +
      `<body>${"y".repeat(900_000)}</body></html>`;

    const { resposta, entregues } = respostaEmPedacos(html);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta));

    const og = await fetchLinkPreview("https://exemplo.com/pagina");
    expect(og.title).toBe("Curto");
    // Parou logo depois do </head>, muito antes dos 900 KB de corpo.
    expect(entregues()).toBeLessThan(64 * 1024);
  });

  it("acha a etiqueta partida entre dois pedaços", async () => {
    // `</head` pode cair no fim de um pedaço e `>` no começo do seguinte.
    // Procurar só no pedaço novo perderia o fim do cabeçalho.
    const antes = "<html><head><meta property=\"og:title\" content=\"Partida\">";
    const encher = "z".repeat(16 * 1024 - antes.length - 3);
    const html = `${antes}${encher}</head><body>fim</body></html>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaEmPedacos(html).resposta));

    const og = await fetchLinkPreview("https://exemplo.com/partida");
    expect(og.title).toBe("Partida");
  });
});
