// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PeriodSelector, periodToConfig } from "../period-selector";

/**
 * O Radix quebrou a tela em produção com "`SelectLabel` must be used within
 * `SelectGroup`" — um erro que só aparece quando o menu ABRE, então nem tsc
 * nem lint pegavam. Este teste abre o menu.
 */

// O Radix usa APIs de ponteiro e rolagem que o jsdom não implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("PeriodSelector", () => {
  it("abre o menu com os meses sem estourar", () => {
    render(
      <PeriodSelector value={periodToConfig("30d")} onChange={() => {}} />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    // Se o rótulo estivesse fora de um SelectGroup, o render acima teria lançado.
    expect(screen.getByText("Mês fechado")).toBeTruthy();
    expect(
      screen.getAllByText(/\/\d{2}( \(em curso\))?$/).length,
    ).toBeGreaterThan(5);
  });

  it("escolher um mês devolve o período daquele mês", () => {
    const onChange = vi.fn();
    render(
      <PeriodSelector value={periodToConfig("30d")} onChange={onChange} />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    const itens = screen.getAllByRole("option");
    const mes = itens.find((i) => /\/\d{2}$/.test(i.textContent ?? ""));
    fireEvent.click(mes!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        period: "mes",
        mes: expect.stringMatching(/^\d{4}-\d{2}$/),
      }),
    );
  });
});
