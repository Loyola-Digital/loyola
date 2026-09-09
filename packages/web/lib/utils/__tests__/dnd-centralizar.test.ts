import { describe, expect, it } from "vitest";
import { centralizarNoCursor } from "../dnd-centralizar";

/** O card na tela: 300×100, com o canto em (100, 200). */
const card = {
  left: 100,
  top: 200,
  width: 300,
  height: 100,
  right: 400,
  bottom: 300,
};

/** O evento que iniciou o arrasto, com o ponteiro onde a pessoa clicou. */
const clique = (x: number, y: number) =>
  ({ type: "pointerdown", clientX: x, clientY: y }) as unknown as Event;

const semMovimento = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

/** Onde o centro do arrastado fica, dado o transform devolvido. */
const centro = (t: { x: number; y: number }) => ({
  x: card.left + t.x + card.width / 2,
  y: card.top + t.y + card.height / 2,
});

describe("centralizarNoCursor", () => {
  it("põe o centro no cursor quando se pega o card pela direita", () => {
    // O caso relatado: pegar longe do canto deixava a prévia a meia largura
    // de distância, e mirar a pasta de destino virava adivinhação.
    const t = centralizarNoCursor({
      activatorEvent: clique(350, 250),
      draggingNodeRect: card as never,
      transform: semMovimento,
    } as never);
    expect(centro(t)).toEqual({ x: 350, y: 250 });
  });

  it("põe o centro no cursor quando se pega pelo canto superior esquerdo", () => {
    const t = centralizarNoCursor({
      activatorEvent: clique(100, 200),
      draggingNodeRect: card as never,
      transform: semMovimento,
    } as never);
    expect(centro(t)).toEqual({ x: 100, y: 200 });
  });

  it("não mexe em nada quando se pega exatamente no centro", () => {
    // Já estava certo: o ajuste tem que ser zero, não um deslocamento fixo.
    const t = centralizarNoCursor({
      activatorEvent: clique(250, 250),
      draggingNodeRect: card as never,
      transform: semMovimento,
    } as never);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });

  it("acompanha o movimento do ponteiro", () => {
    // O transform que chega já traz o deslocamento; o ajuste é somado a ele.
    const t = centralizarNoCursor({
      activatorEvent: clique(350, 250),
      draggingNodeRect: card as never,
      transform: { x: 40, y: -25, scaleX: 1, scaleY: 1 },
    } as never);
    expect(centro(t)).toEqual({ x: 390, y: 225 });
  });

  it("preserva a escala que veio", () => {
    const t = centralizarNoCursor({
      activatorEvent: clique(350, 250),
      draggingNodeRect: card as never,
      transform: { x: 0, y: 0, scaleX: 0.5, scaleY: 2 },
    } as never);
    expect(t.scaleX).toBe(0.5);
    expect(t.scaleY).toBe(2);
  });

  it("devolve o transform intacto sem o retângulo", () => {
    // Acontece no primeiro quadro, antes de o nó ser medido. Jogar a prévia
    // para um canto nesse instante seria pior que não centralizar.
    const t = centralizarNoCursor({
      activatorEvent: clique(350, 250),
      draggingNodeRect: null,
      transform: semMovimento,
    } as never);
    expect(t).toEqual(semMovimento);
  });

  it("devolve o transform intacto sem o evento", () => {
    const t = centralizarNoCursor({
      activatorEvent: null,
      draggingNodeRect: card as never,
      transform: semMovimento,
    } as never);
    expect(t).toEqual(semMovimento);
  });
});
