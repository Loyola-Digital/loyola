// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cardsDoResumo, type EntradaDoResumo } from "@/lib/utils/resumo-mobile-lyrio";
import { GradeDoResumo } from "../lyrio-resumo-cards";

/**
 * Story 42.14 (AC9d) — cada card do Resumo mobile abre o memorial, ancorado
 * no card (ver `revenuecat-overview-block.test.tsx` sobre a âncora e o ref).
 * Os cards vêm do construtor real (`cardsDoResumo`), não de um fixture à parte.
 */
afterEach(cleanup);

const entrada = (p: Partial<EntradaDoResumo> = {}): EntradaDoResumo => ({
  ctx: { diasDoFiltro: 90, hoje: "2026-10-16" },
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
  meta: { temCampanhas: true, filtro: { spendLiquido: 1757.5, imposto: 242.5, spendComImposto: 2000 }, vinteOito: { spendLiquido: 878.75, imposto: 121.25, spendComImposto: 1000 } },
  google: { mostrar: true, filtro: { tipo: "pronto", spend: 500 }, vinteOito: { tipo: "pronto", spend: 100 } },
  receita: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valorUsd: 1000 } },
  overview: { tipo: "pronto", dados: [{ id: "mrr", value: 596 }, { id: "active_subscriptions", value: 120 }, { id: "active_trials", value: 30 }, { id: "new_customers_last_28_days", value: 900 }] },
  percentuais: { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 },
  ...p,
});

function cardDe(rotulo: string): HTMLElement {
  const el = screen.getAllByText(rotulo).map((t) => t.closest("[data-janela]")).find(Boolean);
  if (!el) throw new Error(`card ${rotulo} não encontrado`);
  return el as HTMLElement;
}

async function abrirMemorial(rotulo: string): Promise<string> {
  const card = cardDe(rotulo);
  act(() => {
    fireEvent.focus(card);
  });
  const texto = screen.getByRole("tooltip").textContent ?? "";
  await waitFor(() => {
    expect(document.querySelector("[data-radix-popper-content-wrapper]")?.getAttribute("style") ?? "", `memorial de ${rotulo} sem âncora`).toContain("--radix-popper-anchor-width");
  });
  act(() => {
    fireEvent.blur(card);
    fireEvent.keyDown(card, { key: "Escape" });
  });
  return texto;
}

describe("GradeDoResumo — cada memorial abre (AC1a, AC9d)", () => {
  it("os 9 cards abrem o memorial ao receber foco, com a janela e a frase do filtro", async () => {
    const cards = cardsDoResumo(entrada());
    render(<TooltipProvider><GradeDoResumo cards={cards} /></TooltipProvider>);
    expect(cards).toHaveLength(9);
    for (const c of cards) {
      expect(cardDe(c.rotulo).tabIndex, c.rotulo).toBe(0);
      const texto = await abrirMemorial(c.rotulo);
      expect(texto, c.rotulo).toContain(c.rotulo);
      expect(texto, c.rotulo).toMatch(/segue o filtro de 90 dias/);
    }
  });

  it("card em erro: mostra '—' e o memorial abre com a causa (PO-D4)", async () => {
    const cards = cardsDoResumo(entrada({ receita: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429: Too Many Requests" } }));
    render(<TooltipProvider><GradeDoResumo cards={cards} /></TooltipProvider>);
    expect(cardDe("ROAS").textContent).toContain("—");
    const texto = await abrirMemorial("Receita (RevenueCat)");
    expect(texto).toContain("RevenueCat 429");
    expect(texto).toContain("tente de novo em 1 minuto");
  });

  it("âmbar só em quem não segue o filtro", () => {
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada())} /></TooltipProvider>);
    expect(cardDe("MRR").className).toContain("bg-amber-500/10");
    expect(cardDe("Investimento (Meta)").className).not.toContain("bg-amber-500/10");
  });
});
