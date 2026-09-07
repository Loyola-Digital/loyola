/**
 * A duplicação de um mapa.
 *
 * O que protege: nenhum id se repete entre original e cópia, e as ligações
 * continuam apontando para os blocos certos. Um id repetido não quebra nada na
 * hora — quebra depois, quando alguém copia um bloco da cópia e cola no
 * original, e a seta passa a apontar para outro lugar sem erro nenhum.
 */

import { describe, expect, it } from "vitest";
import { reidentificarAbas } from "../services/funnel-map-abas.js";

const aba = () => ({
  id: "tab1",
  name: "Principal",
  boxes: [
    { id: "b1", label: "VSL", x: 10, y: 20, color: "#f00" },
    { id: "b2", label: "Checkout", x: 300, y: 20, color: "#0f0" },
  ],
  connectors: [{ id: "l1", fromBox: "b1", toBox: "b2", type: "solid" }],
});

describe("reidentificarAbas", () => {
  it("troca todos os ids de bloco", () => {
    const [nova] = reidentificarAbas([aba()]);
    const antigos = new Set(["b1", "b2"]);
    for (const b of nova.boxes) expect(antigos.has(b.id)).toBe(false);
  });

  it("as ligações seguem os blocos certos", () => {
    const [nova] = reidentificarAbas([aba()]);
    const vsl = nova.boxes.find((b) => b.label === "VSL");
    const checkout = nova.boxes.find((b) => b.label === "Checkout");
    expect(nova.connectors[0].fromBox).toBe(vsl?.id);
    expect(nova.connectors[0].toBox).toBe(checkout?.id);
  });

  it("preserva tudo que não é id — é cópia do desenho, não releitura", () => {
    const [nova] = reidentificarAbas([aba()]);
    expect(nova.boxes[0]).toMatchObject({ label: "VSL", x: 10, y: 20, color: "#f00" });
    expect(nova.connectors[0]).toMatchObject({ type: "solid" });
    expect(nova.name).toBe("Principal");
  });

  it("conector órfão é descartado — seta saindo do nada", () => {
    const bruta = { ...aba(), connectors: [{ id: "l1", fromBox: "b1", toBox: "sumiu", type: "solid" }] };
    expect(reidentificarAbas([bruta])[0].connectors).toHaveLength(0);
  });

  it("ids não colidem ENTRE abas do mesmo mapa", () => {
    const [a1, a2] = reidentificarAbas([aba(), { ...aba(), id: "tab2", name: "Segunda" }]);
    const todos = [...a1.boxes, ...a2.boxes].map((b) => b.id);
    expect(new Set(todos).size).toBe(todos.length);
    expect(a1.id).not.toBe(a2.id);
  });

  it("aba sem blocos não quebra", () => {
    const vazia = { id: "tab1", name: "X", boxes: [], connectors: [] };
    expect(reidentificarAbas([vazia])).toEqual([{ id: "tabc1", name: "X", boxes: [], connectors: [] }]);
  });
});
