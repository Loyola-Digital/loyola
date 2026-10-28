// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cardsDoResumo, fmtBRL, type EntradaDoResumo } from "@/lib/utils/resumo-mobile-lyrio";
import { cardsDeAquisicao } from "@/lib/utils/aquisicao-lyrio";
import { cardsDoLtvPorChurn, margemDosPercentuais, type EntradaDoLtvPorChurn } from "@/lib/utils/ltv-por-churn-lyrio";
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
  vendas: {
    tipo: "pronto",
    dados: {
      days: 90, desde: "2026-07-19", atributosDesde: "2026-07-01",
      canais: [
        { canal: "meta", rotulo: "Meta", vendas: 10, compradores: 8, receitaUsd: 600 },
        { canal: "google", rotulo: "Google", vendas: 4, compradores: 3, receitaUsd: 200 },
        { canal: "organico", rotulo: "Orgânico ou cupom", vendas: 6, compradores: 5, receitaUsd: 150 },
        { canal: "sem_atribuicao", rotulo: "Sem atribuição", vendas: 3, compradores: 3, receitaUsd: 50 },
      ],
      conflito: { vendas: 0, compradores: 0, receitaUsd: 0 },
      totalPago: { vendas: 23, compradores: 19, receitaUsd: 1000 },
      metaPorEntidade: { campaign: [], adset: [], ad: [] },
      foraDaQuebra: { semValor: 0, semUsuario: 0 },
    },
  },
  novosClientes: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valor: 15232 } },
  overview: { tipo: "pronto", dados: [{ id: "mrr", value: 596 }, { id: "active_subscriptions", value: 120 }, { id: "active_trials", value: 30 }, { id: "new_customers_last_28_days", value: 900 }] },
  percentuais: { tipo: "pronto", dados: { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 } },
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
  it("os 8 cards abrem o memorial ao receber foco, com a janela e a frase do filtro", async () => {
    const cards = cardsDoResumo(entrada());
    render(<TooltipProvider><GradeDoResumo cards={cards} /></TooltipProvider>);
    expect(cards).toHaveLength(8);
    for (const c of cards) {
      expect(cardDe(c.rotulo).tabIndex, c.rotulo).toBe(0);
      const texto = await abrirMemorial(c.rotulo);
      expect(texto, c.rotulo).toContain(c.rotulo);
      expect(texto, c.rotulo).toMatch(/segue o filtro de 90 dias/);
    }
  });

  it("os cards de CAC, LTV e renovação também abrem o memorial (AC4d, AC7, AC8d)", async () => {
    const contagem = (n: number) => ({
      canais: [
        { canal: "meta" as const, rotulo: "Meta", quantidade: n },
        { canal: "google" as const, rotulo: "Google", quantidade: n },
        { canal: "organico" as const, rotulo: "Orgânico ou cupom", quantidade: n },
        { canal: "sem_atribuicao" as const, rotulo: "Sem atribuição", quantidade: n },
      ],
      conflito: 0,
      total: 4 * n,
    });
    const dados = (days: number) => ({
      days, desde: "2026-07-19", assinaturaDesde: "2026-08-10", atributosDesde: null,
      novosPagantes: contagem(2), renovacoes: contagem(3),
      ltv: {
        planos: [
          { plano: "mensal" as const, rotulo: "LTV Mensal", receitaCentavos: 999, pessoas: 1, produtos: [{ productId: "premium_monthly_15:base", pagamentos: 1, pessoas: 1, receitaCentavos: 999 }] },
          { plano: "trimestral" as const, rotulo: "LTV Trimestral", receitaCentavos: 0, pessoas: 0, produtos: [] },
          { plano: "anual" as const, rotulo: "LTV Anual", receitaCentavos: 5999, pessoas: 1, produtos: [{ productId: "premium_yearly_150", pagamentos: 1, pessoas: 1, receitaCentavos: 5999 }] },
        ],
        naoClassificado: { pagamentos: 0, pessoas: 0, receitaCentavos: 0, produtos: [] },
        foraPorDecisao: { pagamentos: 0, pessoas: 0, receitaCentavos: 0, produtos: [] },
      },
    });
    const e = entrada();
    const a = cardsDeAquisicao({ ctx: e.ctx, pagantesFiltro: { tipo: "pronto", dados: dados(90) }, pagantes28: { tipo: "pronto", dados: dados(28) }, meta: e.meta, google: e.google });
    const cards = [...a.cac, ...a.ltv, ...a.renovacoes];
    expect(cards).toHaveLength(6); // Story 42.15: CAC (filtro), CAC · 28d fixo, 3 LTV bruto (sem Semestral na resposta), Renovações
    render(<TooltipProvider><GradeDoResumo cards={cards} /></TooltipProvider>);
    for (const c of cards) {
      const texto = await abrirMemorial(c.rotulo);
      expect(texto, c.rotulo).toContain(c.rotulo);
      expect(texto, c.rotulo).toMatch(/segue o filtro de 90 dias/);
    }
  });

  it("card em erro: mostra '—' e o memorial abre com a causa (PO-D4)", async () => {
    const cards = cardsDoResumo(entrada({ vendas: { tipo: "erro", mensagem: "HTTP 500: falhou" } }));
    render(<TooltipProvider><GradeDoResumo cards={cards} /></TooltipProvider>);
    expect(cardDe("ROAS").textContent).toContain("—");
    const texto = await abrirMemorial("Receita (RevenueCat)");
    expect(texto).toContain("HTTP 500: falhou");
    expect(texto).toContain("tente atualizar");
  });

  it("Story 42.15 (AC7) — as linhas Meta e Google aparecem abaixo do valor, cortando com reticências (truncate)", () => {
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada())} /></TooltipProvider>);
    const card = cardDe("Investimento (Total)");
    const linhas = [...card.querySelectorAll("[data-secundarias] li")];
    expect(linhas.map((l) => l.textContent)).toEqual([`Meta ${fmtBRL(2000)}`, `Google ${fmtBRL(500)}`]);
    for (const l of linhas) expect(l.className).toContain("truncate");
    expect(card.className).toContain("min-w-0");
    // margem positiva: a linha não fica vermelha
    const margem = [...cardDe("Margem de Contribuição").querySelectorAll("[data-secundarias] li")];
    expect(margem.find((l) => l.textContent?.startsWith("Margem Meta"))!.className).not.toContain("text-red-600");
  });

  it("Story 42.15 (AC3e) — margem negativa do canal: vermelho também na linha em segundo plano", () => {
    const base = entrada();
    const dados = (base.vendas as { tipo: "pronto"; dados: import("@/lib/utils/vendas-por-canal-lyrio").VendasPorCanalDoLyrio }).dados;
    const vendas = { tipo: "pronto" as const, dados: { ...dados, canais: dados.canais.map((c) => (c.canal === "meta" ? { ...c, receitaUsd: 100 } : c)), totalPago: { ...dados.totalPago, receitaUsd: 500 } } };
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada({ vendas }))} /></TooltipProvider>);
    const margem = [...cardDe("Margem de Contribuição").querySelectorAll("[data-secundarias] li")];
    expect(margem.find((l) => l.textContent?.startsWith("Margem Meta"))!.className).toContain("text-red-600");
    expect(margem.find((l) => l.textContent?.startsWith("Margem Google"))!.className).not.toContain("text-red-600");
  });

  it("Story 42.15 (AC2g) — carregando: skeleton no valor, sem memorial nem foco", () => {
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada({ vendas: { tipo: "carregando" } }))} /></TooltipProvider>);
    const receita = cardDe("Receita (RevenueCat)");
    expect(receita.querySelector("[data-carregando]")).not.toBeNull();
    expect(receita.tabIndex).toBe(-1);
    expect(cardDe("Investimento (Total)").querySelector("[data-carregando]")).toBeNull();
  });

  // ── QA loop 1 da 42.15 ──
  const entradaDoLtv = (p: Partial<EntradaDoLtvPorChurn> = {}): EntradaDoLtvPorChurn => ({
    ctx: { diasDoFiltro: 90, hoje: "2026-10-28", serieDesde: "2026-08-10" },
    cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
    arpu: { tipo: "pronto", dados: { periodo: "mensal", mrrUsd: 600, assinaturasAtivas: 120 } },
    margem: { tipo: "pronto", dados: { periodo: "mensal", platformFeePct: 15, taxPct: 4, otherCostsPct: 1 } },
    churn: { tipo: "pronto", dados: { periodo: "mensal", dias: 30, desde: "2026-09-29", ate: "2026-10-28", expiracoesPagas: 13, assinaturasNoInicio: 520, diaDoChart: "2026-09-29", serieDesde: "2026-08-10" } },
    cac: { tipo: "pronto", centavos: 25000, investimentoCentavos: 250000, pessoas: 10 },
    ...p,
  });

  it("QA loop 1 (TEST-005, Q65) — o card com alerta no memorial desenha o ícone de alerta; o card sem alerta, não", () => {
    const { ltv, relacao } = cardsDoLtvPorChurn(entradaDoLtv());
    expect(relacao.alerta).toBe(true);
    render(<TooltipProvider><GradeDoResumo cards={[ltv, relacao]} /></TooltipProvider>);
    expect(within(cardDe("LTV/CAC")).getByLabelText("Há alertas no memorial")).toBeTruthy();
    expect(within(cardDe("LTV (margem)")).queryByLabelText("Há alertas no memorial")).toBeNull();
  });

  it("QA loop 1 (TEST-005, Q66) — a nota da linha ('atribuição desde') aparece no card, depois do valor", () => {
    const base = entrada();
    const dados = (base.vendas as { tipo: "pronto"; dados: import("@/lib/utils/vendas-por-canal-lyrio").VendasPorCanalDoLyrio }).dados;
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada({ vendas: { tipo: "pronto", dados: { ...dados, atributosDesde: "2026-10-06" } } }))} /></TooltipProvider>);
    const linhas = [...cardDe("Receita (RevenueCat)").querySelectorAll("[data-secundarias] li")].map((l) => l.textContent);
    expect(linhas).toEqual([`Meta ${fmtBRL(3000)} · atribuição desde 06/10`, `Google ${fmtBRL(1000)} · atribuição desde 06/10`]);
    // e sem a data tardia, a linha não leva nota
    cleanup();
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada())} /></TooltipProvider>);
    expect([...cardDe("Receita (RevenueCat)").querySelectorAll("[data-secundarias] li")].map((l) => l.textContent)).toEqual([`Meta ${fmtBRL(3000)}`, `Google ${fmtBRL(1000)}`]);
  });

  it("QA loop 1 (REL-001) — config da etapa em erro: LTV, LTV/CAC e Margem mostram '—', e o memorial diz que os percentuais não carregaram", async () => {
    const erro = { tipo: "indisponivel" as const, causa: "os percentuais da margem não carregaram (configuração da etapa indisponível: HTTP 500)" };
    const { ltv, relacao } = cardsDoLtvPorChurn(entradaDoLtv({ margem: margemDosPercentuais(erro) }));
    render(<TooltipProvider><GradeDoResumo cards={[...cardsDoResumo(entrada({ percentuais: erro })), ltv, relacao]} /></TooltipProvider>);
    for (const rotulo of ["LTV (margem)", "LTV/CAC", "Margem de Contribuição"]) {
      const c = cardDe(rotulo);
      expect(c.querySelector("[data-carregando]"), rotulo).toBeNull();
      expect(c.querySelector("p.font-bold")!.textContent, rotulo).toBe("—");
      expect(await abrirMemorial(rotulo), rotulo).toContain("os percentuais da margem não carregaram");
    }
    expect([...cardDe("LTV/CAC").querySelectorAll("[data-secundarias] li")].map((l) => l.textContent)).toEqual(["CAC máximo (3:1) —"]);
  });

  it("QA loop 1 (REL-001) — config da etapa carregando: LTV, LTV/CAC e Margem em skeleton, sem foco", () => {
    const { ltv, relacao } = cardsDoLtvPorChurn(entradaDoLtv({ margem: margemDosPercentuais({ tipo: "carregando" }) }));
    render(<TooltipProvider><GradeDoResumo cards={[...cardsDoResumo(entrada({ percentuais: { tipo: "carregando" } })), ltv, relacao]} /></TooltipProvider>);
    for (const rotulo of ["LTV (margem)", "LTV/CAC", "Margem de Contribuição"]) {
      expect(cardDe(rotulo).querySelector("[data-carregando]"), rotulo).not.toBeNull();
      expect(cardDe(rotulo).tabIndex, rotulo).toBe(-1);
    }
    expect(cardDe("ROAS").querySelector("[data-carregando]")).toBeNull();
  });

  it("âmbar só em quem não segue o filtro", () => {
    render(<TooltipProvider><GradeDoResumo cards={cardsDoResumo(entrada())} /></TooltipProvider>);
    expect(cardDe("MRR").className).toContain("bg-amber-500/10");
    expect(cardDe("Investimento (Total)").className).not.toContain("bg-amber-500/10");
  });
});
