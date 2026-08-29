/**
 * A aritmética da grade.
 *
 * É o tipo de código que "parece certo" lendo e erra por um na tela — daí ser
 * testado direto, sem DOM.
 */

import { describe, expect, it } from "vitest";
import {
  ALTURA_DA_LINHA,
  COLUNAS,
  MARGEM,
  MINIMO_POR_TIPO,
  acomodar,
  alturaDoCanvas,
  celulaParaPx,
  colidem,
  compactarVertical,
  dentroDaGrade,
  larguraDaColuna,
  primeiroEspacoLivre,
  pxParaCelula,
  type Bloco,
} from "./grid";

const b = (id: string, x: number, y: number, w = 3, h = 2): Bloco => ({ id, x, y, w, h });

describe("colisão", () => {
  it("blocos encostados não colidem", () => {
    expect(colidem(b("a", 0, 0, 3, 2), b("b", 3, 0, 3, 2))).toBe(false);
    expect(colidem(b("a", 0, 0, 3, 2), b("b", 0, 2, 3, 2))).toBe(false);
  });

  it("um pixel de sobreposição já é colisão", () => {
    expect(colidem(b("a", 0, 0, 3, 2), b("b", 2, 1, 3, 2))).toBe(true);
  });
});

describe("compactação vertical", () => {
  it("sobe o que está flutuando", () => {
    const r = compactarVertical([b("a", 0, 5), b("b", 3, 9)]);
    expect(r.map((x) => x.y)).toEqual([0, 0]);
  });

  it("empilha na mesma coluna sem sobrepor", () => {
    const r = compactarVertical([b("a", 0, 4), b("b", 0, 9)]);
    expect(r.find((x) => x.id === "a")!.y).toBe(0);
    expect(r.find((x) => x.id === "b")!.y).toBe(2);
  });

  it("preserva a ordem da lista, não a ordem de empilhamento", () => {
    // Se a lista embaralhasse, o React remontaria cards que só mudaram de lugar.
    const r = compactarVertical([b("z", 0, 9), b("a", 0, 1)]);
    expect(r.map((x) => x.id)).toEqual(["z", "a"]);
  });

  it("fecha o buraco deixado por um widget apagado", () => {
    const r = compactarVertical([b("a", 0, 0), b("c", 0, 4)]);
    expect(r.find((x) => x.id === "c")!.y).toBe(2);
  });
});

describe("acomodar", () => {
  it("empurra para baixo quem foi invadido, em vez de recusar o arrasto", () => {
    const inicial = [b("a", 0, 0), b("b", 0, 2)];
    const r = acomodar(inicial, { ...b("a", 0, 0), y: 1, id: "a" });
    const a = r.find((x) => x.id === "a")!;
    const outro = r.find((x) => x.id === "b")!;
    expect(colidem(a, outro)).toBe(false);
    expect(outro.y).toBeGreaterThanOrEqual(a.y + a.h);
  });
});

describe("primeiro espaço livre", () => {
  it("num canvas vazio é o canto superior esquerdo", () => {
    expect(primeiroEspacoLivre([], { w: 6, h: 4 })).toEqual({ x: 0, y: 0 });
  });

  it("preenche a sobra da linha antes de descer", () => {
    const ocupado = [{ x: 0, y: 0, w: 6, h: 4 }];
    expect(primeiroEspacoLivre(ocupado, { w: 6, h: 4 })).toEqual({ x: 6, y: 0 });
  });

  it("desce quando a linha não comporta", () => {
    const ocupado = [{ x: 0, y: 0, w: 8, h: 4 }];
    expect(primeiroEspacoLivre(ocupado, { w: 6, h: 4 })).toEqual({ x: 0, y: 4 });
  });

  it("um bloco mais largo que a grade é encolhido, não jogado para fora", () => {
    expect(primeiroEspacoLivre([], { w: 99, h: 2 })).toEqual({ x: 0, y: 0 });
  });
});

describe("T4 · célula ↔ pixel", () => {
  const LARGURA = 1200;

  it("a coluna zero começa no zero", () => {
    expect(celulaParaPx({ x: 0, y: 0, w: 1, h: 1 }, LARGURA).left).toBe(0);
  });

  it("um bloco de 12 colunas ocupa a largura inteira", () => {
    const px = celulaParaPx({ x: 0, y: 0, w: COLUNAS, h: 1 }, LARGURA);
    expect(Math.round(px.width)).toBe(LARGURA);
  });

  it("a altura segue a constante do dossiê", () => {
    const px = celulaParaPx({ x: 0, y: 0, w: 1, h: 3 }, LARGURA);
    expect(px.height).toBe(3 * ALTURA_DA_LINHA + 2 * MARGEM);
  });

  it("ida e volta preserva a posição", () => {
    const c = larguraDaColuna(LARGURA);
    const { dx, dy } = pxParaCelula(4 * (c + MARGEM), 3 * (ALTURA_DA_LINHA + MARGEM), LARGURA);
    expect({ dx, dy }).toEqual({ dx: 4, dy: 3 });
  });

  it("meio passo arredonda para o mais próximo, não trunca", () => {
    const c = larguraDaColuna(LARGURA);
    expect(pxParaCelula(1.6 * (c + MARGEM), 0, LARGURA).dx).toBe(2);
  });
});

describe("limites da grade", () => {
  it("o mínimo do tipo é respeitado", () => {
    const g = dentroDaGrade({ x: 0, y: 0, w: 1, h: 1 }, "tabela");
    expect(g.w).toBe(MINIMO_POR_TIPO.tabela.w);
    expect(g.h).toBe(MINIMO_POR_TIPO.tabela.h);
  });

  it("KPI cabe menor que tabela", () => {
    expect(MINIMO_POR_TIPO.kpi.w).toBeLessThan(MINIMO_POR_TIPO.tabela.w);
    expect(MINIMO_POR_TIPO.kpi.h).toBeLessThan(MINIMO_POR_TIPO.tabela.h);
  });

  it("não existe máximo de largura além das 12 colunas", () => {
    expect(dentroDaGrade({ x: 0, y: 0, w: 99, h: 3 }, "linha").w).toBe(COLUNAS);
  });

  it("um bloco arrastado para fora da direita é trazido de volta", () => {
    expect(dentroDaGrade({ x: 20, y: 0, w: 6, h: 3 }, "linha").x).toBe(COLUNAS - 6);
  });

  it("y negativo vira zero", () => {
    expect(dentroDaGrade({ x: 0, y: -5, w: 6, h: 3 }, "linha").y).toBe(0);
  });
});

describe("altura do canvas", () => {
  it("reserva espaço até a última linha ocupada", () => {
    expect(alturaDoCanvas([{ x: 0, y: 0, w: 3, h: 2 }, { x: 3, y: 2, w: 3, h: 3 }])).toBe(
      5 * (ALTURA_DA_LINHA + MARGEM),
    );
  });

  it("canvas vazio tem altura zero", () => {
    expect(alturaDoCanvas([])).toBe(0);
  });
});
