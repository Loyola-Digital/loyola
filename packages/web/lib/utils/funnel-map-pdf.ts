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

/**
 * A cor é opaca? `rgba(0, 0, 0, 0)` e `transparent` não servem de fundo.
 *
 * Pura para dar teste sem DOM: é a regra que, errada, apagava o texto branco
 * do PDF.
 */
export function corOpaca(cor: string | null | undefined): boolean {
  const c = (cor ?? "").trim().toLowerCase();
  if (!c || c === "transparent") return false;
  // rgba(r, g, b, a) e rgb(r g b / a): o alfa é o último número depois de
  // vírgula ou barra. Sem alfa explícito, a cor é opaca.
  const alfa = /(?:,|\/)\s*([\d.]+%?)\s*\)$/.exec(c);
  if (!alfa) return true;
  const valor = alfa[1]!.endsWith("%")
    ? parseFloat(alfa[1]!) / 100
    : parseFloat(alfa[1]!);
  return valor >= 0.999;
}

/**
 * A cor de fundo que a pessoa VÊ atrás do mapa.
 *
 * ## Por que não basta ler o elemento
 *
 * A área do mapa não pinta fundo próprio — quem pinta é um ancestral (a seção
 * no modo claro, a página no escuro). Ler só a área devolvia `rgba(0,0,0,0)`,
 * que é texto verdadeiro e passava como cor: o PNG saía transparente, o jsPDF
 * o punha sobre papel branco, e todo texto branco do mapa sumia.
 *
 * Sobe até achar uma cor opaca. Camada semitransparente no caminho (o card é
 * 60%) é ignorada: o tom muda um nada, e o que importa é o contraste.
 */
export function fundoVisivel(no: Element | null, reserva = "#ffffff"): string {
  for (let el = no; el; el = el.parentElement) {
    const cor = getComputedStyle(el).backgroundColor;
    if (corOpaca(cor)) return cor;
  }
  return reserva;
}

/**
 * A mídia deste nó pode virar imagem sem contaminar o canvas?
 *
 * O html-to-image clona `<video>` e `<canvas>` desenhando o conteúdo num canvas
 * e chamando `toDataURL` — sem try/catch. Um único vídeo de origem sem CORS
 * derrubava o PDF inteiro com "Tainted canvases may not be exported".
 *
 * Testar num canvas de 1px antes é barato e exato: o que passa entra no PDF com
 * o quadro; o que falharia é deixado de fora, e o resto do mapa sai.
 */
function midiaLegivel(el: HTMLVideoElement | HTMLCanvasElement): boolean {
  try {
    const teste = document.createElement("canvas");
    teste.width = 1;
    teste.height = 1;
    teste.getContext("2d")?.drawImage(el, 0, 0, 1, 1);
    teste.toDataURL();
    return true;
  } catch {
    return false;
  }
}

/**
 * O que precisa sair do CSS e ir para o próprio elemento SVG.
 *
 * ## Por que existe
 *
 * O html-to-image copia o estilo computado para os elementos HTML do clone —
 * mas os filhos de um `<svg>` saem só com a `class`, e a folha de estilo não
 * vai junto. Medido: o rótulo da seta virava `<rect class="fill-background"/>`
 * sem atributo `style` nenhum. Sem `fill`, o SVG usa o padrão, que é PRETO:
 * retângulo preto e texto preto por cima — a tarja preta no lugar do texto.
 *
 * Por isso a lista é de propriedades de desenho de SVG: cor de preenchimento e
 * de traço, espessura, tracejado, opacidade e a fonte do texto (sem ela o
 * rótulo de 11px sai no padrão de 16px).
 */
const PROPRIEDADES_DO_SVG = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "font-size",
  "font-weight",
  "font-family",
] as const;

/**
 * Escreve o estilo computado direto nos elementos SVG e devolve quem desfaz.
 *
 * Mexe no DOM da TELA, e por pouco tempo: grava, captura, restaura o atributo
 * `style` exatamente como estava (inclusive a ausência dele). Sem restaurar, o
 * mapa ficaria com cores congeladas e deixaria de acompanhar o modo claro.
 */
function fixarEstiloDoSvg(raiz: Element): () => void {
  const alvos = [...raiz.querySelectorAll<SVGElement>("svg *")];
  const antes = alvos.map((el) => el.getAttribute("style"));
  for (const el of alvos) {
    const computado = getComputedStyle(el);
    for (const prop of PROPRIEDADES_DO_SVG) {
      const valor = computado.getPropertyValue(prop);
      if (valor) el.style.setProperty(prop, valor);
    }
  }
  return () =>
    alvos.forEach((el, i) => {
      const original = antes[i];
      if (original === null) el.removeAttribute("style");
      else el.setAttribute("style", original);
    });
}

async function capturar(
  area: AreaParaCapturar,
  fundo: string,
): Promise<string> {
  const { toPng } = await import("html-to-image");

  const largura = Math.max(1, Math.round(area.fimX - area.origemX));
  const altura = Math.max(1, Math.round(area.fimY - area.origemY));

  // Mapa muito grande estoura o limite de canvas do navegador; reduzir a escala
  // é melhor que devolver uma página em branco sem explicação.
  const escala = Math.min(ESCALA, Math.sqrt(MAX_PIXELS / (largura * altura)));

  // Decidido ANTES da captura: o filtro roda nó a nó e testar dentro dele
  // repetiria o desenho de cada vídeo a cada passada.
  const ilegiveis = new Set<Element>(
    [...area.no.querySelectorAll("video, canvas")].filter(
      (el) => !midiaLegivel(el as HTMLVideoElement | HTMLCanvasElement),
    ),
  );

  // Antes do `toPng`, e desfeito no `finally` — ver `fixarEstiloDoSvg`.
  const desfazerEstilo = fixarEstiloDoSvg(area.no);

  const captura = toPng(area.no, {
    width: largura,
    height: altura,
    pixelRatio: Math.max(1, escala),
    backgroundColor: fundo,
    filter: (no) => !(no instanceof Element && ilegiveis.has(no)),
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
    desfazerEstilo();
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
      doc = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: paisagem ? "landscape" : "portrait",
      });
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
    doc.addImage(
      png,
      "PNG",
      MARGEM + (util.w - w) / 2,
      TOPO + (util.h - h) / 2,
      w,
      h,
      undefined,
      "FAST",
    );
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
    img.onload = () =>
      resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
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
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu,
      "",
    )
    .replace(/️/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
