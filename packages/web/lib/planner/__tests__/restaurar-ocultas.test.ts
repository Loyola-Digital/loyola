import { describe, expect, it } from "vitest";
import { restaurarOcultas, type Fase } from "../datas";

const fase = (id: string, end: string): Fase => ({ id, name: id, start: "2026-08-01", end });
const terminou = (f: Fase) => f.end < "2026-09-18";

// Duas passadas (escondidas na tela) e duas em andamento.
const todas = [
  fase("captacao", "2026-08-07"),
  fase("cpl", "2026-08-14"),
  fase("logistica", "2026-10-05"),
  fase("evento", "2026-10-06"),
];
const naTela = todas.filter((f) => !terminou(f));

describe("restaurarOcultas", () => {
  it("editar uma fase visível não apaga as escondidas", () => {
    // O defeito: o card salvava só as duas visíveis, e as passadas (com os
    // eventos delas no Google) iam embora.
    const editadas = naTela.map((f) => (f.id === "logistica" ? { ...f, name: "Logística" } : f));
    const r = restaurarOcultas(editadas, todas, terminou);
    expect(r.map((f) => f.id)).toEqual(["captacao", "cpl", "logistica", "evento"]);
    expect(r.find((f) => f.id === "logistica")!.name).toBe("Logística");
  });

  it("excluir uma fase visível continua excluindo", () => {
    const r = restaurarOcultas(naTela.filter((f) => f.id !== "evento"), todas, terminou);
    expect(r.map((f) => f.id)).toEqual(["captacao", "cpl", "logistica"]);
  });

  it("adicionar fase mantém as escondidas e põe a nova no fim", () => {
    const r = restaurarOcultas([...naTela, fase("nova", "")], todas, terminou);
    expect(r.map((f) => f.id)).toEqual(["captacao", "cpl", "logistica", "evento", "nova"]);
  });

  it("reordenar as visíveis não embaralha as escondidas", () => {
    const r = restaurarOcultas([naTela[1]!, naTela[0]!], todas, terminou);
    expect(r.map((f) => f.id)).toEqual(["captacao", "cpl", "evento", "logistica"]);
  });

  it("sem nada escondido, devolve o que veio", () => {
    expect(restaurarOcultas(naTela, naTela, terminou)).toEqual(naTela);
  });
});
