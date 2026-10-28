// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { trafegoDoGoogleNaRegua } from "@/lib/utils/google-ads-na-regua";
import type { VendasPorCanalDoLyrio } from "@/lib/utils/vendas-por-canal-lyrio";
import type { EntradaDosDadosDiarios } from "@/lib/utils/dados-diarios-lyrio";
import { LyrioDadosDiarios } from "../lyrio-dados-diarios";

/**
 * Story 42.17 (AC1, AC5, AC6, AC7d) — o desenho da tabela "Dados diários": o
 * componente real, com a entrada no formato da tela (`lyrio-stage-view.tsx`).
 * A conta é provada em `lib/utils/__tests__/dados-diarios-lyrio.test.ts`.
 */
afterEach(cleanup);

const HOJE = "2026-10-28";
const linhaMeta = (date: string, spend: string): CampaignDailyInsight => ({
  date_start: date, date_stop: date, impressions: "1000", reach: "0", clicks: "20", spend, ctr: "0", cpc: "0", cpm: "0",
  actions: [{ action_type: "link_click", value: "10" }],
});
const VENDAS: VendasPorCanalDoLyrio = {
  days: 7, desde: "2026-10-22", atributosDesde: "2026-10-06",
  canais: [
    { canal: "meta", rotulo: "Meta", vendas: 1, compradores: 1, receitaUsd: 2 },
    { canal: "google", rotulo: "Google", vendas: 0, compradores: 0, receitaUsd: 0 },
    { canal: "organico", rotulo: "Orgânico ou cupom", vendas: 0, compradores: 0, receitaUsd: 0 },
    { canal: "sem_atribuicao", rotulo: "Sem atribuição", vendas: 0, compradores: 0, receitaUsd: 0 },
  ],
  conflito: { vendas: 0, compradores: 0, receitaUsd: 0 },
  totalPago: { vendas: 1, compradores: 1, receitaUsd: 2 },
  metaPorEntidade: { campaign: [], adset: [], ad: [] },
  diario: [{ dia: "2026-10-24", vendas: 1, receitaUsd: 2 }],
  foraDaQuebra: { semValor: 0, semUsuario: 0 },
};
const CONTA = { tipo: "conta" as const, accountId: "acc" };
const GOOGLE = trafegoDoGoogleNaRegua(CONTA, [{ campaignId: "g1", isLoading: false, error: null, data: [{ date: "2026-10-24", spend: 3, impressions: 100, clicks: 5 }] }], 7, HOJE);

const entrada = (p: Partial<EntradaDosDadosDiarios> = {}): Omit<EntradaDosDadosDiarios, "ordem"> => ({
  ctx: { diasDoFiltro: 7, hoje: HOJE, serieDesde: "2026-08-10" },
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
  meta: { temCampanhas: true, linhas: [linhaMeta("2026-10-24", "87.85")], erro: null },
  google: { mostrar: true, trafego: GOOGLE },
  vendas: { tipo: "pronto", dados: VENDAS },
  revenuecatConectado: true,
  ...p,
});

const linhas = () => [...document.querySelectorAll("tbody tr")] as HTMLElement[];
const celula = (dia: string, coluna: string) => document.querySelector(`tr[data-dia="${dia}"] td[data-coluna="${coluna}"]`) as HTMLElement;

describe("LyrioDadosDiarios — o desenho", () => {
  it("(AC1b/c/d) o título com a janela, uma linha por dia (mais recente primeiro), o Total e a marca só em hoje", () => {
    render(<LyrioDadosDiarios entrada={entrada()} />);
    expect(screen.getByRole("heading", { name: "Dados diários · últimos 7 dias (22/10 a 28/10)" })).toBeTruthy();
    expect(linhas().map((l) => l.dataset.dia)).toEqual(["2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23", "2026-10-22"]);
    expect(within(linhas()[0]).getByText("28/10/2026")).toBeTruthy();
    const marcas = screen.getAllByTitle("dia em andamento");
    expect(marcas).toHaveLength(1);
    expect(linhas()[0].contains(marcas[0])).toBe(true);
    const total = document.querySelector('tfoot tr[data-dia="total"]') as HTMLElement;
    expect(within(total).getByText("Total")).toBeTruthy();
    // 87,85 ÷ 0,8785 = 100,00 (Meta) + 3,00 (Google)
    expect(celula("total", "investimento").textContent).toBe("R$ 103,00");
    expect(celula("2026-10-24", "investMeta").textContent).toBe("R$ 100,00");
    expect(celula("2026-10-24", "receita").textContent).toBe("R$ 10,00");
    expect(celula("2026-10-23", "vendas").textContent).toBe("0");
    expect(celula("2026-10-23", "roas").textContent).toBe("—");
  });

  it("(AC2) as colunas, na ordem, com a dica no cabeçalho", () => {
    render(<LyrioDadosDiarios entrada={entrada()} />);
    const cab = [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    expect(cab).toEqual(["Dia", "Investimento", "Invest. Meta", "Invest. Google", "Vendas", "Receita", "ROAS", "Custo por venda", "Impressões", "Cliques", "CTR", "CPM", "CPC"]);
    expect(screen.getByText("Investimento").getAttribute("title")).toBe("Meta com imposto + Google, régua de SP");
    expect(screen.getByText("Vendas").getAttribute("title")).toBe("eventos pagos: compra, renovação, conversão de trial");
    expect(screen.getByText("Receita").getAttribute("title")).toMatch(/câmbio US\$ 1 = R\$\s5,00 \(\/api\/fx\/usd-brl · manual\)/);
    expect(screen.getByText("Cliques").getAttribute("title")).toBe("Meta: link click; Google: cliques da campanha");
    expect(screen.getByText("Invest. Google").getAttribute("title")).toMatch(/segments\.date/);
  });

  it("(AC1b) o Dia ordena: o clique inverte para o mais antigo primeiro, e volta", () => {
    render(<LyrioDadosDiarios entrada={entrada()} />);
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por dia: decrescente/ }));
    expect(linhas()[0].dataset.dia).toBe("2026-10-22");
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por dia: crescente/ }));
    expect(linhas()[0].dataset.dia).toBe(HOJE);
  });

  it("(AC5a) Meta em erro: role=alert com a causa, e as células “—” com a causa na dica", () => {
    render(<LyrioDadosDiarios entrada={entrada({ meta: { temCampanhas: true, linhas: undefined, erro: "Request failed 502" } })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível carregar o investimento da Meta: Request failed 502/);
    const c = celula("2026-10-24", "investMeta");
    expect(c.textContent).toBe("—");
    expect(c.getAttribute("title")).toMatch(/Request failed 502/);
    expect(celula("total", "investimento").textContent).toBe("—");
    expect(celula("2026-10-24", "investGoogle").textContent).toBe("R$ 3,00");
  });

  it("(AC5b) sem campanha Google: a coluna Invest. Google não existe", () => {
    render(<LyrioDadosDiarios entrada={entrada({ google: { mostrar: false, trafego: { tipo: "sem_campanha" } } })} />);
    expect(screen.queryByText("Invest. Google")).toBeNull();
    expect(document.querySelector('td[data-coluna="investGoogle"]')).toBeNull();
    expect(celula("total", "investimento").textContent).toBe("R$ 100,00");
  });

  it("(AC5c) RevenueCat desconectado: “—” nas vendas, com o aviso", () => {
    render(<LyrioDadosDiarios entrada={entrada({ vendas: { tipo: "oculto" }, revenuecatConectado: false })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/RevenueCat não conectado/);
    expect(celula("total", "vendas").textContent).toBe("—");
    expect(celula("total", "vendas").getAttribute("title")).toBe("RevenueCat não conectado");
  });

  it("(AC1e) antes de serieDesde: “—” com a dica “antes do início da série do webhook”", () => {
    render(<LyrioDadosDiarios entrada={entrada({ ctx: { diasDoFiltro: 7, hoje: HOJE, serieDesde: "2026-10-24" } })} />);
    const c = celula("2026-10-23", "vendas");
    expect(c.textContent).toBe("—");
    expect(c.getAttribute("title")).toBe("antes do início da série do webhook");
    expect(celula("2026-10-24", "vendas").textContent).toBe("1");
  });

  it("(AC5d) carregando: skeleton no lugar da tabela", () => {
    render(<LyrioDadosDiarios entrada={entrada({ vendas: { tipo: "carregando" } })} />);
    expect(screen.getByTestId("dados-diarios-carregando")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
  });

  it("(AC6) a rolagem horizontal é DENTRO da tabela e o Dia fica fixo à esquerda (cabeçalho, dias e Total)", () => {
    render(<LyrioDadosDiarios entrada={entrada()} />);
    const secao = screen.getByRole("region", { name: "Dados diários" });
    expect(secao.className).toMatch(/\bmin-w-0\b/);
    expect(secao.className).toMatch(/\bmax-w-full\b/);
    const rolagem = secao.querySelector('[data-rolagem="tabela"]') as HTMLElement;
    expect(rolagem.className).toMatch(/\boverflow-x-auto\b/);
    expect(rolagem.contains(document.querySelector("table"))).toBe(true);
    const primeiras = [document.querySelector("thead th"), ...document.querySelectorAll("tbody tr td:first-child"), document.querySelector("tfoot td")];
    expect(primeiras).toHaveLength(9);
    for (const el of primeiras) {
      expect(el!.className).toMatch(/\bsticky\b/);
      expect(el!.className).toMatch(/\bleft-0\b/);
      expect(el!.className).toMatch(/\bbg-/);
    }
  });
});
