// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Calendario } from "../calendario";
import type { Campanha } from "@/lib/planner/datas";

/** N campanhas, cada uma com uma fase no MESMO dia — o caso que "sumia". */
function noMesmoDia(n: number): Campanha[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Campanha ${i}`,
    color: "#2f6fdb",
    sortOrder: i,
    projectId: null,
    phases: [{ id: `f${i}`, name: `Fase ${i}`, start: "2026-10-15", end: "2026-10-15" }],
  }));
}

const montar = (campanhas: Campanha[]) =>
  render(
    <Calendario
      campanhas={campanhas}
      ano={2026}
      mes={10}
      faseSelecionada={null}
      onSelecionarFase={vi.fn()}
      onMudarFase={vi.fn()}
    />,
  );

describe("Calendario", () => {
  it("com mais campanhas do que cabe no dia, mostra 4 e um '+N' com o resto", () => {
    montar(noMesmoDia(7));
    // 5 linhas por semana: 4 barras + a linha do "+3".
    expect(screen.getAllByText(/^Fase \d$/)).toHaveLength(4);
    expect(screen.getByRole("button", { name: "+3" })).toBeTruthy();
  });

  it("o '+N' abre a lista com TODAS as fases do dia", () => {
    montar(noMesmoDia(7));
    fireEvent.click(screen.getByRole("button", { name: "+3" }));
    for (let i = 0; i < 7; i++) expect(screen.getAllByText(`Fase ${i}`).length).toBeGreaterThan(0);
  });

  it("até 5 no dia cabem todas, sem '+N'", () => {
    montar(noMesmoDia(5));
    expect(screen.getAllByText(/^Fase \d$/)).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /^\+\d/ })).toBeNull();
  });

  it("empilha por SEMANA: a fase que continua não herda a linha da semana anterior", () => {
    // Semana de 04/10: três fases curtas (linhas 0–2) e a longa, que cruza para
    // a semana de 11/10 na linha 3. Numerada no mês inteiro, ela descia para a
    // 4ª linha também na semana seguinte, onde está SOZINHA — três linhas vazias.
    const curtas = noMesmoDia(3).map((c) => ({
      ...c,
      phases: c.phases.map((f) => ({ ...f, start: "2026-10-05", end: "2026-10-08" })),
    }));
    const longa: Campanha = {
      id: "l", name: "Longa", color: "#e0529c", sortOrder: 9, projectId: null,
      phases: [{ id: "fl", name: "Fase longa", start: "2026-10-07", end: "2026-10-14" }],
    };
    montar([...curtas, longa]);
    const [semanaDe04, semanaDe11] = screen.getAllByText("Fase longa").map((el) => el.parentElement as HTMLElement);
    expect(semanaDe04!.style.top).toBe(`${26 + 3 * 20}px`);
    expect(semanaDe11!.style.top).toBe("26px");
  });
});
