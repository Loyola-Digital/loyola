// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RevenuecatOverviewBlock } from "../revenuecat-overview-block";

/**
 * Story 42.14 (AC9d) — o memorial de cada card do Overview ABRE.
 *
 * As duas armadilhas do Epic 42 passam no tsc, no lint e no build, e só aparecem
 * quando alguém passa o mouse: o card que não é `forwardRef` com `{...rest}`
 * descarta o ref e os handlers do trigger, e o `Tooltip` sem `TooltipProvider`
 * não abre. Aqui as duas são provadas em execução.
 */

type Q<T> = { isLoading: boolean; error: unknown; data: T | undefined };
let overview: Q<{ configured: boolean; metrics: { id: string; name: string; value: number; unit: string | null }[] }>;
let derivadas: Q<Record<string, unknown>>;

vi.mock("@/lib/hooks/use-revenuecat", () => ({
  useRevenuecatOverview: () => overview,
  useRevenuecatMetricasDerivadas: () => derivadas,
}));

const metrica = (id: string, value: number) => ({ id, name: id, value, unit: null });
const METRICAS = [
  metrica("active_subscriptions", 120),
  metrica("active_trials", 30),
  metrica("mrr", 596),
  metrica("revenue", 2318),
  metrica("new_customers", 900),
  metrica("active_users", 11124),
];
const DERIVADAS = {
  novasAssinaturasPagas: 10, novosTrials: 182, conversoesDeTrial: 26, taxaDeConversaoDeTrial: 26 / 182,
  churnPagante: 5, abandonoDeTrial: 164, cancelamentosPagantes: 30, movimentoDeAssinaturas: 31,
  serieDesde: "2026-08-10", totalDeEventos: 900,
};
const ROTULOS = [
  "Assinaturas ativas", "Trials ativos", "MRR", "ARR", "Receita", "Novos clientes", "Usuários ativos",
  "Conversão para Trial", "Conversão para Pagante",
  "Novas assinaturas pagas", "Conversões de trial", "Churn (pagantes)", "Movimento de assinaturas", "Trials abandonados", "Cancelamentos",
];

beforeEach(() => {
  overview = { isLoading: false, error: null, data: { configured: true, metrics: METRICAS } };
  derivadas = { isLoading: false, error: null, data: DERIVADAS };
});
afterEach(cleanup);

const bloco = <RevenuecatOverviewBlock projectId="p" funnelId="f" stageId="s" days={90} />;

/** A superfície do card: o elemento focável que carrega o rótulo. */
function cardDe(rotulo: string): HTMLElement {
  const el = screen.getAllByText(rotulo).map((t) => t.closest("[data-janela]")).find(Boolean);
  if (!el) throw new Error(`card ${rotulo} não encontrado`);
  return el as HTMLElement;
}

/**
 * Foca o card e devolve o texto do memorial aberto (o `role="tooltip"` do Radix).
 *
 * Exige também que o conteúdo foi ANCORADO no card. Sem o `ref` repassado, o
 * Radix abre o tooltip mesmo assim (os handlers vêm pelo `{...rest}`), mas sem
 * âncora o deixa em `translate(0, -200%)` — fora da tela. Medido nesta story:
 * com o ref, o wrapper ganha as variáveis `--radix-popper-anchor-*`; sem ele,
 * não. É a diferença entre "abre" e "aparece".
 */
async function abrirMemorial(rotulo: string): Promise<string> {
  const card = cardDe(rotulo);
  act(() => {
    fireEvent.focus(card);
  });
  const tooltip = screen.getByRole("tooltip");
  const texto = tooltip.textContent ?? "";
  await waitFor(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
    expect(wrapper?.getAttribute("style") ?? "", `memorial de ${rotulo} sem âncora (ref perdido)`).toContain("--radix-popper-anchor-width");
  });
  act(() => {
    fireEvent.blur(card);
    fireEvent.keyDown(card, { key: "Escape" });
  });
  return texto;
}

describe("RevenuecatOverviewBlock — cada memorial abre (AC1, AC9d)", () => {
  it("dentro do provider, os 15 cards abrem o memorial ao receber foco, com a janela e a frase do filtro", async () => {
    render(<TooltipProvider>{bloco}</TooltipProvider>);
    for (const rotulo of ROTULOS) {
      const card = cardDe(rotulo);
      expect(card.tabIndex, rotulo).toBe(0);
      const texto = await abrirMemorial(rotulo);
      expect(texto, rotulo).toContain(rotulo);
      expect(texto, rotulo).toMatch(/segue o filtro de 90 dias/);
    }
  });

  it("FORA de qualquer TooltipProvider o bloco não quebra e o memorial abre: o provider é local (AC1d)", async () => {
    expect(() => render(bloco)).not.toThrow();
    expect(await abrirMemorial("MRR")).toContain("Receita recorrente mensal");
  });

  it("a etiqueta de janela aparece em cada card; o que não segue o filtro leva o âmbar", () => {
    render(bloco);
    expect(cardDe("MRR").textContent).toContain("agora");
    expect(cardDe("MRR").getAttribute("data-janela")).toBe("nao-segue");
    expect(cardDe("MRR").className).toContain("bg-amber-500/10");
  });
});

describe("RevenuecatOverviewBlock — erro não vira ausência (PO-D4)", () => {
  it("overview em erro: o bloco NÃO some; aviso role=alert e o card mostra '—' com a causa no memorial", async () => {
    overview = {
      isLoading: false,
      error: Object.assign(new Error("Limite de consultas do RevenueCat"), {
        status: 429,
        body: { error: "Limite de consultas do RevenueCat", details: "RevenueCat 429: Too Many Requests", causa: "limite" },
      }),
      data: undefined,
    };
    render(bloco);
    expect(screen.getByRole("alert").textContent).toContain("25 consultas por minuto");
    const mrr = cardDe("MRR");
    expect(mrr.textContent).toContain("—");
    const texto = await abrirMemorial("MRR");
    expect(texto).toContain("RevenueCat 429");
    expect(texto).toContain("tente de novo em 1 minuto");
  });

  it("ausência legítima (app não escolhido): o bloco não aparece", () => {
    overview = { isLoading: false, error: null, data: { configured: false, metrics: [] } };
    const { container } = render(bloco);
    expect(container.textContent).toBe("");
  });
});
