/**
 * A grade do canvas de BI.
 *
 * Grid próprio em vez de `react-grid-layout`: são ~150 linhas de aritmética de
 * células contra uma dependência que traz CSS próprio, tipos separados e um
 * histórico de atrito com React 19. Aqui as constantes são as mesmas que o
 * dossiê especifica para o Construtor (§2.9), e a conta fica visível e testável.
 */

import type { Geometria, TipoDeWidget } from "./tipos";

export const COLUNAS = 12;
export const ALTURA_DA_LINHA = 64;
export const MARGEM = 16;

/**
 * O tamanho mínimo de cada tipo.
 *
 * KPI é um número: apertá-lo não perde nada. Tabela e funil precisam de altura
 * para não virar duas linhas com rolagem — e um gráfico de 1×1 não comunica.
 */
export const MINIMO_POR_TIPO: Record<TipoDeWidget, { w: number; h: number }> = {
  kpi: { w: 2, h: 2 },
  linha: { w: 4, h: 3 },
  barra: { w: 3, h: 3 },
  pizza: { w: 3, h: 3 },
  funil: { w: 3, h: 4 },
  tabela: { w: 4, h: 4 },
};

/** O tamanho com que um widget novo nasce. */
export const PADRAO_POR_TIPO: Record<TipoDeWidget, { w: number; h: number }> = {
  kpi: { w: 3, h: 2 },
  linha: { w: 6, h: 4 },
  barra: { w: 6, h: 4 },
  pizza: { w: 4, h: 4 },
  funil: { w: 4, h: 5 },
  tabela: { w: 6, h: 5 },
};

export interface Bloco extends Geometria {
  id: string;
}

/** Dois blocos ocupam a mesma célula? */
export function colidem(a: Geometria, b: Geometria): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Compacta os blocos para cima, na ordem em que aparecem.
 *
 * `compactType: 'vertical'` do dossiê. Sem isto, apagar um widget deixa um
 * buraco permanente no meio do canvas — e a única forma de fechá-lo seria
 * arrastar tudo o que está abaixo, um por um.
 */
export function compactarVertical(blocos: Bloco[]): Bloco[] {
  const ordem = [...blocos].sort((a, b) => a.y - b.y || a.x - b.x);
  const fixos: Bloco[] = [];
  for (const bloco of ordem) {
    let y = bloco.y;
    // Sobe enquanto a linha de cima estiver livre.
    while (y > 0 && !fixos.some((f) => colidem({ ...bloco, y: y - 1 }, f))) y -= 1;
    fixos.push({ ...bloco, y });
  }
  // Devolve na ordem original: a lista de widgets não deve embaralhar por causa
  // da compactação, senão o React remonta cards que só mudaram de posição.
  return blocos.map((b) => fixos.find((f) => f.id === b.id)!);
}

/**
 * Empurra para baixo o que o bloco em movimento invadiu.
 *
 * Empurrar, e não recusar: o arrasto que "não deixa soltar" é o comportamento
 * que faz a pessoa achar que o canvas travou.
 */
export function acomodar(blocos: Bloco[], movido: Bloco): Bloco[] {
  const resultado = blocos.map((b) => (b.id === movido.id ? movido : b));
  const fixo = resultado.find((b) => b.id === movido.id)!;

  for (const outro of resultado) {
    if (outro.id === fixo.id) continue;
    if (colidem(fixo, outro)) outro.y = fixo.y + fixo.h;
  }
  return compactarVertical(resultado);
}

/**
 * O primeiro espaço livre para um bloco do tamanho pedido.
 *
 * Varre linha a linha, da esquerda para a direita — é o que faz "clicar no
 * preset" colocar o widget onde a pessoa esperaria, em vez de no fim da página.
 */
export function primeiroEspacoLivre(
  blocos: Geometria[],
  tamanho: { w: number; h: number },
): { x: number; y: number } {
  const w = Math.min(tamanho.w, COLUNAS);
  const limite = blocos.reduce((m, b) => Math.max(m, b.y + b.h), 0) + 1;
  for (let y = 0; y <= limite; y += 1) {
    for (let x = 0; x + w <= COLUNAS; x += 1) {
      const candidato = { x, y, w, h: tamanho.h };
      if (!blocos.some((b) => colidem(candidato, b))) return { x, y };
    }
  }
  return { x: 0, y: limite };
}

/** A largura de uma coluna, dada a largura medida do container. */
export function larguraDaColuna(larguraTotal: number): number {
  return (larguraTotal - MARGEM * (COLUNAS - 1)) / COLUNAS;
}

/** Converte célula → pixel. */
export function celulaParaPx(g: Geometria, larguraTotal: number) {
  const c = larguraDaColuna(larguraTotal);
  return {
    left: g.x * (c + MARGEM),
    top: g.y * (ALTURA_DA_LINHA + MARGEM),
    width: g.w * c + (g.w - 1) * MARGEM,
    height: g.h * ALTURA_DA_LINHA + (g.h - 1) * MARGEM,
  };
}

/** Converte deslocamento em pixel → deslocamento em células. */
export function pxParaCelula(dx: number, dy: number, larguraTotal: number) {
  const c = larguraDaColuna(larguraTotal);
  return {
    dx: Math.round(dx / (c + MARGEM)),
    dy: Math.round(dy / (ALTURA_DA_LINHA + MARGEM)),
  };
}

/** Prende a geometria à grade: dentro das 12 colunas e acima do mínimo do tipo. */
export function dentroDaGrade(g: Geometria, tipo: TipoDeWidget): Geometria {
  const min = MINIMO_POR_TIPO[tipo];
  const w = Math.max(min.w, Math.min(g.w, COLUNAS));
  const h = Math.max(min.h, g.h);
  return {
    w,
    h,
    x: Math.max(0, Math.min(g.x, COLUNAS - w)),
    y: Math.max(0, g.y),
  };
}

/** A altura total do canvas, em pixels — o container precisa reservar espaço. */
export function alturaDoCanvas(blocos: Geometria[]): number {
  const linhas = blocos.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return linhas * (ALTURA_DA_LINHA + MARGEM);
}
