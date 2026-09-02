/**
 * O filtro de "já passou".
 *
 * O que estes testes protegem: uma fase em aberto que começou ontem está
 * ACONTECENDO e não pode sumir, e campanha sem data não é campanha concluída —
 * é campanha esperando alguém preencher.
 */

import { describe, expect, it } from "vitest";
import { campanhaConcluida, faseTerminou, type Campanha, type Fase } from "../datas";

const HOJE = "2026-09-02";

const fase = (over: Partial<Fase> = {}): Fase => ({
  id: "f",
  name: "Fase",
  start: "2026-09-01",
  end: "2026-09-05",
  ...over,
});

const campanha = (phases: Fase[]): Campanha => ({
  id: "c",
  name: "C",
  color: "#6D5BD0",
  sortOrder: 0,
  projectId: null,
  phases,
});

describe("faseTerminou", () => {
  it("terminou ontem", () => {
    expect(faseTerminou(fase({ start: "2026-08-01", end: "2026-09-01" }), HOJE)).toBe(true);
  });

  it("termina hoje ainda NÃO terminou", () => {
    // O dia de hoje conta inteiro: uma fase que acaba hoje está acontecendo.
    expect(faseTerminou(fase({ start: "2026-08-01", end: HOJE }), HOJE)).toBe(false);
  });

  it("fase em aberto que começou ontem está acontecendo", () => {
    // É a que mais precisa ficar visível: começou e ninguém marcou o fim.
    expect(faseTerminou(fase({ start: "2026-09-01", end: "" }), HOJE)).toBe(false);
  });

  it("fase em aberto que começou mês passado também está acontecendo", () => {
    expect(faseTerminou(fase({ start: "2026-07-01", end: "" }), HOJE)).toBe(false);
  });

  it("fase sem data nunca 'terminou'", () => {
    expect(faseTerminou(fase({ start: "", end: "" }), HOJE)).toBe(false);
  });
});

describe("campanhaConcluida", () => {
  it("todas as fases no passado", () => {
    const c = campanha([
      fase({ id: "a", start: "2026-07-01", end: "2026-07-10" }),
      fase({ id: "b", start: "2026-08-01", end: "2026-08-20" }),
    ]);
    expect(campanhaConcluida(c, HOJE)).toBe(true);
  });

  it("uma fase futura basta para NÃO estar concluída", () => {
    const c = campanha([
      fase({ id: "a", start: "2026-07-01", end: "2026-07-10" }),
      fase({ id: "b", start: "2026-11-01", end: "2026-11-10" }),
    ]);
    expect(campanhaConcluida(c, HOJE)).toBe(false);
  });

  it("uma fase em aberto segura a campanha", () => {
    const c = campanha([
      fase({ id: "a", start: "2026-07-01", end: "2026-07-10" }),
      fase({ id: "b", start: "2026-08-01", end: "" }),
    ]);
    expect(campanhaConcluida(c, HOJE)).toBe(false);
  });

  it("campanha SEM data nenhuma não é concluída — é não planejada", () => {
    // Escondê-la sumiria justamente com a que espera alguém preencher.
    expect(campanhaConcluida(campanha([fase({ start: "", end: "" })]), HOJE)).toBe(false);
    expect(campanhaConcluida(campanha([]), HOJE)).toBe(false);
  });

  it("fase sem data no meio de fases passadas não impede a conclusão", () => {
    // A fase vazia não diz nada sobre o futuro; as datadas dizem.
    const c = campanha([
      fase({ id: "a", start: "2026-07-01", end: "2026-07-10" }),
      fase({ id: "b", start: "", end: "" }),
    ]);
    expect(campanhaConcluida(c, HOJE)).toBe(true);
  });
});
