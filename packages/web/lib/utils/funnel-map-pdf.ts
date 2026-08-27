/**
 * Exporta o mapa do funil como PDF — um print do desenho, não um redesenho.
 *
 * A primeira versão redesenhava tudo com as primitivas do jsPDF: retângulo,
 * linha, texto. O resultado tinha os elementos na posição certa e a aparência
 * errada — sem ícone, sem a fonte da tela, sem a cor de fundo do card, com o
 * texto quebrando em outros pontos. Manter aquilo fiel exigiria reimplementar,
 * em código de PDF, cada regra de CSS do canvas — e refazer isso a cada ajuste
 * de estilo.
 *
 * Agora o próprio navegador desenha: o nó do mapa vira imagem (via
 * `foreignObject`, que usa o motor de layout do Chrome) e a imagem entra na
 * página. O que sai é o que está na tela.
 *
 * Não é screenshot da janela: a captura recebe o tamanho do CONTEÚDO INTEIRO e
 * anula o pan/zoom, então entra o mapa todo — inclusive o que estava fora da
 * área visível na hora do clique.
 */

export interface AreaParaCapturar {
  /** O nó que contém blocos e conectores (o que recebe translate/scale). */
  no: HTMLElement;
  /** Nome da aba — vira o rótulo da página. */
  nome: string;
  /**
   * Cantos do recorte, em coordenadas do mapa. O superior-esquerdo pode ser
   * negativo — bloco arrastado acima do topo continua no desenho.
   */
  origemX: number;
  origemY: number;
  fimX: number;
  fimY: number;
}

/**
 * Escala da captura.
 *
 * 2x deixa o texto nítido no zoom do leitor de PDF sem estourar o tamanho do
 * arquivo — 3x quadruplica os bytes para um ganho que a impressora não mostra.
 */
const ESCALA = 2;

/** Teto de área do canvas. Acima disto o navegador devolve imagem em branco. */
const MAX_PIXELS = 16_000_000;

/**
 * Teto por página.
 *
 * A biblioteca resolve a captura dentro de um `requestAnimationFrame`, e o
 * navegador PARA de disparar quadro em aba de segundo plano — medido: com a
 * aba oculta a promessa nunca resolve. Sem este teto, trocar de aba enquanto o
 * PDF é gerado deixaria o botão girando para sempre, sem erro nenhum.
 */
const LIMITE_MS = 30_000;

async function capturar(area: AreaParaCapturar, fundo: string): Promise<string> {
  const { toPng } = await import("html-to-image");

  const largura = Math.max(1, Math.round(area.fimX - area.origemX));
  const altura = Math.max(1, Math.round(area.fimY - area.origemY));

  // Mapa muito grande estoura o limite de canvas do navegador; reduzir a escala
  // é melhor que devolver uma página em branco sem explicação.
  const escala = Math.min(ESCALA, Math.sqrt(MAX_PIXELS / (largura * altura)));

  const captura = toPng(area.no, {
    width: largura,
    height: altura,
    pixelRatio: Math.max(1, escala),
    backgroundColor: fundo,
    // Anula pan e zoom e traz a origem para 0,0: o que vale aqui é o desenho
    // inteiro, não o enquadramento em que a pessoa estava.
    style: {
      transform: `translate(${-area.origemX}px, ${-area.origemY}px)`,
      transformOrigin: "top left",
      width: `${largura}px`,
      height: `${altura}px`,
    },
  });

  let alarme: ReturnType<typeof setTimeout>;
  const desistir = new Promise<never>((_, rejeitar) => {
    alarme = setTimeout(
      () =>
        rejeitar(
          new Error(
            "A geração demorou demais. Mantenha esta aba aberta e visível enquanto o PDF é montado.",
          ),
        ),
      LIMITE_MS,
    );
  });

  try {
    return await Promise.race([captura, desistir]);
  } finally {
    clearTimeout(alarme!);
  }
}

export interface OpcoesDoPdf {
  areas: AreaParaCapturar[];
  /** Vira o cabeçalho da página e o nome do arquivo. */
  titulo: string;
  /** Cor de fundo do desenho, lida da tela para o print bater com o que se vê. */
  fundo: string;
}

export async function exportarMapaEmPdf(opts: OpcoesDoPdf): Promise<void> {
  if (opts.areas.length === 0) throw new Error("Nada para exportar.");
  const { jsPDF } = await import("jspdf");

  let doc: import("jspdf").jsPDF | null = null;

  for (const area of opts.areas) {
    const png = await capturar(area, opts.fundo);
    const dims = await medir(png);

    // Uma página por aba, na orientação que melhor acomoda o desenho: mapa é
    // largo por natureza, mas um fluxo vertical em paisagem sobraria papel dos
    // dois lados.
    const paisagem = dims.largura >= dims.altura;
    const L = paisagem ? 297 : 210;
    const A = paisagem ? 210 : 297;

    if (!doc) {
      doc = new jsPDF({ unit: "mm", format: "a4", orientation: paisagem ? "landscape" : "portrait" });
    } else {
      doc.addPage("a4", paisagem ? "landscape" : "portrait");
    }

    const MARGEM = 10;
    const TOPO = opts.areas.length > 1 || opts.titulo ? 16 : MARGEM;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(semEmoji(opts.titulo), MARGEM, 10);
    if (area.nome) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(140, 140, 140);
      doc.text(semEmoji(area.nome), L - MARGEM, 10, { align: "right" });
    }

    // Encaixa sem distorcer: a escala é a mesma nos dois eixos.
    const util = { w: L - MARGEM * 2, h: A - TOPO - MARGEM };
    const fator = Math.min(util.w / dims.largura, util.h / dims.altura);
    const w = dims.largura * fator;
    const h = dims.altura * fator;
    doc.addImage(png, "PNG", MARGEM + (util.w - w) / 2, TOPO + (util.h - h) / 2, w, h, undefined, "FAST");
  }

  const nome = (semEmoji(opts.titulo) || "mapa-do-funil")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  doc!.save(`${nome || "mapa-do-funil"}.pdf`);
}

/** Dimensões reais do PNG — a captura pode ter reduzido a escala. */
function medir(dataUrl: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => reject(new Error("Não consegui ler a imagem do mapa."));
    img.src = dataUrl;
  });
}

/**
 * Tira emoji do TEXTO do PDF (cabeçalho e nome do arquivo).
 *
 * Só do texto desenhado pelo jsPDF, cujas fontes embutidas são Latin-1. Dentro
 * do mapa o emoji continua aparecendo normalmente — ali é imagem.
 */
function semEmoji(s: string): string {
  return (s || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/️/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
