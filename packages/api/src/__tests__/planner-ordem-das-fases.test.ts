/**
 * A ordem das fases é de quem olha a tela, não do Google.
 *
 * ## O que acontecia
 *
 * A importação reconstruía a lista como `[...preservadas, ...novas]` — as
 * manuais primeiro, as do Google depois, na ordem dele. Isso é uma ordem
 * recém-inventada a cada ciclo, e `mesmasFases` compara COM ordem: a lista
 * "mudava", era gravada, e o arrasto do usuário sumia.
 *
 * Com o ciclo de 5 minutos, arrastar "Lote 2" para antes de "Definições"
 * durava no máximo cinco minutos. Pior: sem erro nenhum — a pessoa achava que
 * não tinha salvado.
 *
 * A ordem importa porque é como o time lê a campanha (definições, lote 1,
 * lote 2), e não corresponde nem à data nem à origem da fase.
 */

import { describe, expect, it } from "vitest";
import { mesmasFases, naOrdemDeAntes } from "../services/planner-sync.js";

const fase = (id: string, name = id) => ({ id, name, start: "2026-10-01", end: "2026-10-02" });

describe("naOrdemDeAntes", () => {
  it("mantém a ordem que estava, mesmo que a reconstrução venha trocada", () => {
    // O que a importação monta: manuais primeiro, Google depois.
    const reconstruida = [fase("definicoes"), fase("lote1"), fase("lote2")];
    // O que o usuário deixou: lote 2 antes de definições.
    const comoEstava = [fase("lote2"), fase("definicoes"), fase("lote1")];
    expect(naOrdemDeAntes(reconstruida, comoEstava).map((f) => f.id)).toEqual([
      "lote2",
      "definicoes",
      "lote1",
    ]);
  });

  it("fase inédita entra no FIM, não no meio da ordem de quem já estava", () => {
    const r = naOrdemDeAntes(
      [fase("nova"), fase("a"), fase("b")],
      [fase("a"), fase("b")],
    );
    expect(r.map((f) => f.id)).toEqual(["a", "b", "nova"]);
  });

  it("duas inéditas preservam a ordem em que chegaram", () => {
    const r = naOrdemDeAntes([fase("a"), fase("n1"), fase("n2")], [fase("a")]);
    expect(r.map((f) => f.id)).toEqual(["a", "n1", "n2"]);
  });

  it("fase que sumiu não ressuscita só porque estava na ordem antiga", () => {
    const r = naOrdemDeAntes([fase("a")], [fase("a"), fase("apagada")]);
    expect(r.map((f) => f.id)).toEqual(["a"]);
  });

  it("primeira importação (nada antes) respeita a ordem do Google", () => {
    const r = naOrdemDeAntes([fase("x"), fase("y")], []);
    expect(r.map((f) => f.id)).toEqual(["x", "y"]);
  });

  it("lista vazia não explode", () => {
    expect(naOrdemDeAntes([], [fase("a")])).toEqual([]);
  });
});

describe("mesmasFases enxerga a ordem", () => {
  it("trocar a ordem conta como mudança — é por isso que a correção importa", () => {
    // Se não enxergasse, a importação não gravaria e o problema não existiria.
    // Enxergando, qualquer reordenação inventada pela importação era gravada
    // por cima da do usuário.
    const a = [fase("1"), fase("2")];
    const b = [fase("2"), fase("1")];
    expect(mesmasFases(a, b)).toBe(false);
  });

  it("mesma ordem e mesmos valores continuam sendo 'não mudou'", () => {
    expect(mesmasFases([fase("1"), fase("2")], [fase("1"), fase("2")])).toBe(true);
  });
});
