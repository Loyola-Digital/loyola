/**
 * Exporta o mapa do funil como PDF.
 *
 * Desenha vetorialmente a partir dos dados (blocos, conectores), em vez de
 * fotografar a tela. Sai nítido em qualquer zoom, leve, e o que está fora da
 * área visível entra igual — capturar a tela exportaria só o pedaço que
 * estivesse enquadrado no momento do clique.
 *
 * Uma página por aba, em paisagem: o mapa é largo por natureza.
 */

import {
  STATUS,
  TAMANHO_DO_ESTILO,
  TIPO_GENERICO,
  TIPO_NOTA,
  TIPO_TEXTO,
  metaDoTipo,
} from "@/lib/utils/funnel-map-palette";

interface BlocoPdf {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  status: string;
  texto?: string | null;
  estilo?: string | null;
  emoji?: string | null;
  negrito?: boolean;
  italico?: boolean;
  fonte?: number | null;
}

interface ConectorPdf {
  fromBox: string;
  fromPoint: "top" | "right" | "bottom" | "left";
  toBox: string;
  toPoint: "top" | "right" | "bottom" | "left";
  type: "solid" | "dashed";
  label?: string | null;
}

interface AbaPdf {
  name: string;
  boxes: BlocoPdf[];
  connectors: ConectorPdf[];
}

/** "#6366f1" para [99, 102, 241]. Aceita a forma curta; cai no cinza se não entender. */
function rgb(hex: string): [number, number, number] {
  const h = (hex || "").trim().replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(c)) return [107, 114, 128];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/**
 * Tira emoji e símbolos que a fonte do PDF não tem.
 *
 * As fontes embutidas do jsPDF são Latin-1: emoji não vira quadradinho, vira
 * lixo — e às vezes leva junto o resto da linha. Acento passa; emoji sai.
 */
function semEmoji(s: string): string {
  return (s || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    // O seletor de variação (U+FE0F) sai numa passada separada: dentro da
    // classe ele conta como caractere combinado e o lint barra.
    .replace(/\uFE0F/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Ponto de saída/entrada do conector, em coordenadas do mapa. */
function ancora(b: BlocoPdf, p: ConectorPdf["fromPoint"]): { x: number; y: number } {
  if (p === "top") return { x: b.x + b.width / 2, y: b.y };
  if (p === "bottom") return { x: b.x + b.width / 2, y: b.y + b.height };
  if (p === "left") return { x: b.x, y: b.y + b.height / 2 };
  return { x: b.x + b.width, y: b.y + b.height / 2 };
}

export interface OpcoesDoPdf {
  abas: AbaPdf[];
  /** Vira o título do cabeçalho e o nome do arquivo. */
  titulo: string;
  /** Só a aba informada, em vez de todas. */
  apenasAba?: number;
}

export async function exportarMapaEmPdf(opts: OpcoesDoPdf): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const L = 297;
  const A = 210;
  const MARGEM = 12;
  const TOPO = 22;

  const abas =
    opts.apenasAba !== undefined && opts.abas[opts.apenasAba]
      ? [opts.abas[opts.apenasAba]]
      : opts.abas;

  let primeira = true;
  for (const aba of abas) {
    if (!primeira) doc.addPage();
    primeira = false;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, L, A, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(semEmoji(opts.titulo), MARGEM, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(semEmoji(aba.name), MARGEM, 18);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, 20, L - MARGEM, 20);

    if (aba.boxes.length === 0) {
      doc.setTextColor(156, 163, 175);
      doc.text("Aba vazia.", MARGEM, TOPO + 10);
      continue;
    }

    // Enquadra o conteúdo inteiro na área útil. A escala nunca passa de 1: um
    // mapa de três blocos ampliado até encher a folha fica grotesco.
    const minX = Math.min(...aba.boxes.map((b) => b.x));
    const minY = Math.min(...aba.boxes.map((b) => b.y));
    const maxX = Math.max(...aba.boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...aba.boxes.map((b) => b.y + b.height));
    const util = { w: L - MARGEM * 2, h: A - TOPO - MARGEM };
    const escala = Math.min(util.w / (maxX - minX || 1), util.h / (maxY - minY || 1), 1);
    // Centraliza o que sobrar da folha.
    const offX = MARGEM + (util.w - (maxX - minX) * escala) / 2;
    const offY = TOPO + (util.h - (maxY - minY) * escala) / 2;
    const px = (x: number) => offX + (x - minX) * escala;
    const py = (y: number) => offY + (y - minY) * escala;

    const porId = new Map(aba.boxes.map((b) => [b.id, b]));

    // Conectores primeiro: passam por baixo dos blocos, como na tela.
    doc.setLineWidth(0.4);
    for (const c of aba.connectors) {
      const de = porId.get(c.fromBox);
      const para = porId.get(c.toBox);
      if (!de || !para) continue;
      const a = ancora(de, c.fromPoint);
      const b = ancora(para, c.toPoint);
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern(c.type === "dashed" ? [1.5, 1.2] : [], 0);
      doc.line(px(a.x), py(a.y), px(b.x), py(b.y));
      doc.setLineDashPattern([], 0);

      // Ponta da seta, desenhada na direção do segmento.
      const ang = Math.atan2(py(b.y) - py(a.y), px(b.x) - px(a.x));
      const T = 2;
      doc.setFillColor(148, 163, 184);
      doc.triangle(
        px(b.x),
        py(b.y),
        px(b.x) - T * Math.cos(ang - 0.4),
        py(b.y) - T * Math.sin(ang - 0.4),
        px(b.x) - T * Math.cos(ang + 0.4),
        py(b.y) - T * Math.sin(ang + 0.4),
        "F",
      );

      const rotulo = semEmoji(c.label ?? "");
      if (rotulo) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(rotulo, (px(a.x) + px(b.x)) / 2, (py(a.y) + py(b.y)) / 2 - 1, { align: "center" });
      }
    }

    for (const b of aba.boxes) {
      const x = px(b.x);
      const y = py(b.y);
      const w = b.width * escala;
      const h = b.height * escala;

      if (b.type === TIPO_TEXTO) {
        // Texto solto: sem moldura, com a hierarquia preservada.
        const tam = (b.fonte ?? TAMANHO_DO_ESTILO[b.estilo ?? "corpo"] ?? 14) * escala * 0.9;
        doc.setFont("helvetica", b.negrito ? "bold" : b.italico ? "italic" : "normal");
        doc.setFontSize(Math.max(5, tam));
        doc.setTextColor(17, 24, 39);
        const linhas = doc.splitTextToSize(semEmoji(b.texto || b.label), Math.max(w, 10)).slice(0, 6);
        linhas.forEach((linha: string, i: number) => {
          doc.text(String(linha), x, y + tam * 0.9 + i * tam * 1.15);
        });
        continue;
      }

      const cor = rgb(b.color);
      if (b.type === TIPO_NOTA) {
        doc.setFillColor(cor[0], cor[1], cor[2]);
        doc.rect(x, y, w, h, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(5, 7 * escala + 3));
        doc.setTextColor(60, 60, 60);
        const linhas = doc.splitTextToSize(semEmoji(b.texto || b.label), Math.max(w - 3, 6)).slice(0, 8);
        linhas.forEach((linha: string, i: number) => {
          doc.text(String(linha), x + 1.5, y + 5 + i * 3.6);
        });
        continue;
      }

      // Bloco: faixa da cor à esquerda, moldura clara, nome e tipo.
      doc.setFillColor(250, 250, 251);
      doc.setDrawColor(cor[0], cor[1], cor[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(x, y, w, h, 1.2, 1.2, "FD");
      doc.setFillColor(cor[0], cor[1], cor[2]);
      doc.rect(x, y, 1.2, h, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(Math.max(5, 6 * escala + 2.5));
      doc.setTextColor(17, 24, 39);
      const nome = semEmoji(b.label) || (b.type === TIPO_GENERICO ? "Bloco" : "");
      doc.text(String(doc.splitTextToSize(nome, Math.max(w - 4, 6))[0] ?? ""), x + 3, y + 4.5);

      if (b.type !== TIPO_GENERICO) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(4, 5 * escala + 1.5));
        doc.setTextColor(120, 128, 140);
        const tipo = semEmoji(metaDoTipo(b.type).label);
        doc.text(String(doc.splitTextToSize(tipo, Math.max(w - 4, 6))[0] ?? ""), x + 3, y + 8);
      }

      // Bolinha de status no canto — a mesma leitura de cor da tela.
      const st = STATUS[b.status as keyof typeof STATUS];
      if (st) {
        const cs = rgb(st.color);
        doc.setFillColor(cs[0], cs[1], cs[2]);
        doc.circle(x + w - 2.5, y + 2.5, 0.9, "F");
      }
    }
  }

  const nome = (semEmoji(opts.titulo) || "mapa-do-funil")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  doc.save(`${nome.toLowerCase() || "mapa-do-funil"}.pdf`);
}
