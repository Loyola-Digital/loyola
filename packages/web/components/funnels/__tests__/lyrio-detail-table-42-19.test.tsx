// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TrafegoDoGoogleNaRegua } from "@/lib/utils/google-ads-na-regua";
import { DICA_GOOGLE_SEM_VENDA } from "@/lib/utils/lyrio-detalhamento-diario";
import type { VendasPorCanalDoLyrio } from "@/lib/utils/vendas-por-canal-lyrio";

/**
 * Story 42.19 (AC6d, AC6e) — o FIO da linha expansível, com o hook real
 * `useEntityDaily` e o react-query de verdade: o que se conta são as
 * requisições que saem pelo `apiClient`, não as chamadas do hook.
 *
 *  - nenhuma requisição ao `entity-daily` sem expansão;
 *  - UMA ao expandir duas linhas da mesma dimensão;
 *  - uma nova ao trocar de dimensão (e expandir lá);
 *  - o controle é um `<button>` com `aria-expanded`/`aria-controls`.
 *
 * QA loop 1 (TEST-001..003, TEST-005): a linha do Google aberta (o ramo do
 * Google no componente), a janela e a plataforma fechando as linhas, o dia de
 * SP às 23:30 e o "Δ vs. linha" na Σ.
 */

const pedidos: string[] = [];
const respostaDaSerie = vi.fn();

vi.mock("@/lib/hooks/use-api-client", () => ({
  useApiClient: () => async (path: string) => {
    pedidos.push(path);
    if (path.includes("/entity-daily")) return respostaDaSerie(path);
    throw new Error(`rota inesperada no teste: ${path}`);
  },
}));

const CAMPANHAS = [
  { campaignId: "c1", campaignName: "Campanha Um", spend: 100, impressions: 1000, clicks: 12, linkClicks: 10 },
  { campaignId: "c2", campaignName: "Campanha Dois", spend: 50, impressions: 500, clicks: 6, linkClicks: 5 },
];
const PUBLICOS = [{ campaignId: "as-1", campaignName: "Conjunto A", spend: 150, impressions: 1500, clicks: 18, linkClicks: 15 }];

vi.mock("@/lib/hooks/use-traffic-analytics", async (original) => ({
  ...(await original<typeof import("@/lib/hooks/use-traffic-analytics")>()),
  useTrafficCampaigns: () => ({ data: { campaigns: CAMPANHAS }, isLoading: false }),
  useAllAdSets: () => ({ data: { adsets: PUBLICOS }, isLoading: false }),
  useAllAds: () => ({ data: { ads: [] }, isLoading: false }),
  useAdCreatives: () => ({ data: undefined }),
}));
vi.mock("@/lib/hooks/use-google-ads-analytics", () => ({ useGoogleAdsCampaigns: () => ({ data: undefined }) }));

let vendas: VendasPorCanalDoLyrio | undefined;
vi.mock("@/lib/hooks/use-revenuecat", () => ({
  useRevenuecatVendasPorCanal: () => ({ isLoading: false, error: null, data: vendas }),
}));
vi.mock("@/components/traffic/creative-thumb", () => ({ CreativeThumb: () => null }));

const { LyrioDetailTable } = await import("../lyrio-detail-table");

const serie = (groupBy: string) => ({
  rows:
    groupBy === "campaign"
      ? [{ entityId: "c1", entityName: "Campanha Um", dateStart: "2026-10-28", spend: 87.85, impressions: 1000, clicks: 12, linkClicks: 10 }]
      : [{ entityId: "as-1", entityName: "Conjunto A", dateStart: "2026-10-28", spend: 131.775, impressions: 1500, clicks: 18, linkClicks: 15 }],
  unattributedByDate: {},
  daysWithoutCoverage: [],
  since: "2026-10-26",
  until: "2026-10-28",
  groupBy,
});

const googleTrafego: TrafegoDoGoogleNaRegua = { tipo: "sem_campanha" };

type Props = Parameters<typeof LyrioDetailTable>[0];
const PROPS: Props = {
  projectId: "p1",
  funnelId: "f1",
  stageId: "s1",
  brlRate: 5,
  revenuecatConectado: true,
  campaignIds: ["c1", "c2"],
  googleAccountId: null,
  googleCampaignIds: new Set(),
  googleCampanhas: [],
  googleTrafego,
  days: 3,
};

/** Monta a tabela; `rerender(p)` troca as props no MESMO QueryClient (a janela do cabeçalho). */
function montar(p: Partial<Props> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arvore = (q: Partial<Props>) => (
    <QueryClientProvider client={qc}>
      <LyrioDetailTable {...PROPS} {...q} />
    </QueryClientProvider>
  );
  const r = render(arvore(p));
  return { ...r, rerender: (q: Partial<Props>) => r.rerender(arvore({ ...p, ...q })) };
}

/** As campanhas Google da etapa, com o `/daily` da régua já somado (a consulta da 42.16). */
const GOOGLE: Partial<Props> = {
  googleAccountId: "acc-1",
  googleCampaignIds: new Set(["g1"]),
  googleCampanhas: [{ id: "g1", name: "Search Lyrio" }],
  googleTrafego: {
    tipo: "pronto",
    spend: 30,
    impressions: 300,
    clicks: 3,
    porCampanha: new Map([["g1", { spend: 30, impressions: 300, clicks: 3 }]]),
    diasPorCampanha: new Map([
      ["g1", [
        { date: "2026-10-28", spend: 10, impressions: 100, clicks: 1 },
        { date: "2026-10-26", spend: 20, impressions: 200, clicks: 2 },
      ]],
    ]),
  },
};

const controle = (nome: string) => screen.getByRole("button", { name: new RegExp(`os dias de ${nome}$`) });
const daSerie = () => pedidos.filter((p) => p.includes("/entity-daily"));
/** O texto da linha, com o espaço não separável de `toLocaleString` trocado por espaço. */
const textoDa = (l: HTMLElement) => (l.textContent ?? "").replace(/\u00a0/g, " ");
const linhasDosDias = (nome: string) => within(screen.getByRole("rowgroup", { name: `Dias de ${nome}` })).getAllByRole("row");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00Z")); // 12:00 de SP
  pedidos.length = 0;
  respostaDaSerie.mockReset();
  respostaDaSerie.mockImplementation((path: string) => serie(new URL(path, "http://x").searchParams.get("groupBy")!));
  vendas = {
    days: 3,
    desde: "2026-10-26",
    atributosDesde: "2026-10-06",
    canais: [{ canal: "meta", rotulo: "Meta", vendas: 2, compradores: 2, receitaUsd: 10 }],
    conflito: { vendas: 0, compradores: 0, receitaUsd: 0 },
    totalPago: { vendas: 2, compradores: 2, receitaUsd: 10 },
    metaPorEntidade: { campaign: [{ chave: "c1", nome: "Campanha Um", vendas: 2, compradores: 2, receitaUsd: 10 }], adset: [], ad: [] },
    metaPorEntidadeDiario: { campaign: [{ chave: "c1", dia: "2026-10-27", vendas: 2, compradores: 2, receitaUsd: 10 }], adset: [], ad: [] },
    foraDaQuebra: { semValor: 0, semUsuario: 0 },
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AC6d — o fio: uma requisição por dimensão e janela, só depois da primeira expansão", () => {
  it("sem expansão, nenhuma; duas linhas abertas, UMA; outra dimensão, uma nova", async () => {
    montar();
    await act(async () => {});
    expect(daSerie()).toHaveLength(0);

    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    expect(daSerie()).toHaveLength(1);
    // a régua de SP, com datas explícitas, as campanhas vinculadas e a dimensão ativa
    expect(daSerie()[0]).toMatch(/groupBy=campaign&startDate=2026-10-26&endDate=2026-10-28&campaignIds=c1%2Cc2$/);

    fireEvent.click(controle("Campanha Dois"));
    await waitFor(() => expect(screen.getAllByText("Σ dos dias")).toHaveLength(2));
    expect(daSerie()).toHaveLength(1);

    // trocar de dimensão fecha tudo (AC1c) e não pede nada sozinho
    const [, dimensao] = screen.getAllByRole("combobox");
    fireEvent.keyDown(dimensao!, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Por Público" }));
    await act(async () => {});
    expect(screen.queryByText("Σ dos dias")).toBeNull();
    expect(daSerie()).toHaveLength(1);

    // AC1c — voltar para Campanha não reabre as linhas de antes: a troca fechou todas
    const escolher = (nome: string) => {
      fireEvent.keyDown(screen.getAllByRole("combobox")[1]!, { key: "ArrowDown" });
      fireEvent.click(screen.getByRole("option", { name: nome }));
    };
    escolher("Por Campanha");
    await act(async () => {});
    expect(screen.queryByText("Σ dos dias")).toBeNull();
    expect(controle("Campanha Um").getAttribute("aria-expanded")).toBe("false");
    escolher("Por Público");
    await act(async () => {});

    fireEvent.click(controle("Conjunto A"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    expect(daSerie()).toHaveLength(2);
    expect(daSerie()[1]).toMatch(/groupBy=adset&/);

  });

  it("os dias aparecem com as colunas da linha: hoje em andamento, a venda do dia e a Σ", async () => {
    montar();
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    const dias = screen.getByRole("rowgroup", { name: "Dias de Campanha Um" });
    const linhas = within(dias).getAllByRole("row");
    // `toLocaleString` separa "R$" do número com espaço não separável
    const texto = (i: number) => (linhas[i]!.textContent ?? "").replace(/\u00a0/g, " ");
    expect(linhas.map((l) => l.textContent?.slice(0, 10))).toEqual(["28/10/2026", "27/10/2026", "26/10/2026", "Σ dos dias"]);
    expect(within(linhas[0]!).getByText("dia em andamento")).toBeTruthy();
    // 87,85 bruto → R$ 100,00 com o imposto; a linha (ao vivo) é R$ 100,00 — Σ fecha
    expect(texto(0)).toContain("R$ 100,00");
    // a venda do dia 27 (2 vendas, US$ 10 → R$ 50,00)
    expect(texto(1)).toContain("R$ 50,00");
    expect(texto(3)).not.toMatch(/Δ/);
    expect(texto(3)).toContain("R$ 100,00");
  });

  it("AC5b — a série em erro → alerta DENTRO da expansão, com a causa; a linha continua", async () => {
    respostaDaSerie.mockImplementation(() => {
      throw new Error("cache indisponível");
    });
    montar();
    fireEvent.click(controle("Campanha Um"));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("cache indisponível");
    expect(within(screen.getByRole("rowgroup", { name: "Dias de Campanha Um" })).getByRole("alert")).toBe(alerta);
    expect(screen.getByText("Campanha Um")).toBeTruthy();
  });
});

describe("AC6e — acessibilidade do controle", () => {
  it("é um <button type=button> focável; aria-expanded muda e aria-controls aponta para os dias", async () => {
    montar();
    const b = controle("Campanha Um");
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    b.focus();
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    const alvo = document.getElementById(b.getAttribute("aria-controls")!);
    expect(alvo).not.toBeNull();
    expect(alvo!.hidden).toBe(true);
    // Enter e Espaço num <button> nativo disparam `click` no navegador; o jsdom
    // não simula essa ativação, então o clique é o que se dispara aqui.
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(alvo!.hidden).toBe(false);
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(alvo!.hidden).toBe(true);
  });
});

describe("AC2e / AC3f (D22) — a linha do GOOGLE aberta: o ramo do Google no componente (QA TEST-001)", () => {
  it("abre sozinha: sem pedir a série da Meta, sem skeleton, a mídia do /daily na régua e a venda “—” com a dica", async () => {
    montar(GOOGLE);
    fireEvent.click(controle("Search Lyrio"));
    await act(async () => {});
    // a linha do Google não pede o `entity-daily` (os dias já estão na consulta do /daily)
    expect(daSerie()).toHaveLength(0);
    const dias = screen.getByRole("rowgroup", { name: "Dias de Search Lyrio" });
    // nada de skeleton esperando a série da Meta, que nunca é pedida
    expect(within(dias).queryByLabelText("Carregando os dias")).toBeNull();
    const linhas = linhasDosDias("Search Lyrio");
    expect(linhas.map((l) => l.textContent?.slice(0, 10))).toEqual(["28/10/2026", "27/10/2026", "26/10/2026", "Σ dos dias"]);
    // o gasto do /daily, sem imposto (o imposto é da Meta); o dia sem linha é zerado
    expect(textoDa(linhas[0]!)).toContain("R$ 10,00");
    expect(textoDa(linhas[1]!)).toContain("R$ 0,00");
    expect(textoDa(linhas[2]!)).toContain("R$ 20,00");
    expect(textoDa(linhas[3]!)).toContain("R$ 30,00");
    expect(textoDa(linhas[3]!)).not.toMatch(/Δ/);
    // Vendas e Receita: "—" (o Google não informa a campanha), nunca "0", nos dias e na Σ
    for (const l of linhas) {
      const celulas = within(l).getAllByRole("cell");
      const [vendas, receita] = celulas.slice(-2);
      expect(vendas!.textContent).toBe("—");
      expect(receita!.textContent).toBe("—");
      expect(vendas!.getAttribute("title")).toBe(DICA_GOOGLE_SEM_VENDA);
      expect(receita!.getAttribute("title")).toBe(DICA_GOOGLE_SEM_VENDA);
    }
  });

  it("com uma linha da Meta aberta junto, a do Google não muda: segue do /daily, e a série da Meta é pedida uma vez", async () => {
    montar(GOOGLE);
    fireEvent.click(controle("Search Lyrio"));
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getAllByText("Σ dos dias")).toHaveLength(2));
    expect(daSerie()).toHaveLength(1);
    expect(textoDa(linhasDosDias("Search Lyrio")[0]!)).toContain("R$ 10,00");
    expect(textoDa(linhasDosDias("Campanha Um")[0]!)).toContain("R$ 100,00");
  });
});

describe("AC1c — trocar de janela ou de plataforma fecha todas (QA TEST-002)", () => {
  it("a janela (days) do cabeçalho muda → nenhuma linha aberta", async () => {
    const t = montar();
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    t.rerender({ days: 7 });
    await act(async () => {});
    expect(screen.queryByText("Σ dos dias")).toBeNull();
    expect(controle("Campanha Um").getAttribute("aria-expanded")).toBe("false");
  });

  it("a plataforma muda (Todas → Meta) → nenhuma linha aberta, mesmo com a dimensão igual", async () => {
    montar();
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Plataforma/ }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Meta" }));
    await act(async () => {});
    expect(screen.queryByText("Σ dos dias")).toBeNull();
    expect(controle("Campanha Um").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("AC1b / AC2a — o dia de HOJE é o de SP no componente (QA TEST-003)", () => {
  it("às 23:30 de SP (02:30Z do dia seguinte) a expansão começa no dia de SP, e a série vai até ele", async () => {
    vi.setSystemTime(new Date("2026-10-29T02:30:00Z"));
    montar();
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    const linhas = linhasDosDias("Campanha Um");
    expect(linhas[0]!.textContent?.slice(0, 10)).toBe("28/10/2026");
    expect(within(linhas[0]!).getByText("dia em andamento")).toBeTruthy();
    expect(daSerie()[0]).toMatch(/startDate=2026-10-26&endDate=2026-10-28&/);
  });
});

describe("AC4c — a Σ dos dias mostra a diferença contra a linha (QA TEST-005)", () => {
  it("série (cache) menor que a linha (ao vivo) → “Δ −R$ 20,00 vs. linha” no investimento da Σ", async () => {
    respostaDaSerie.mockImplementation(() => ({
      ...serie("campaign"),
      // 70,28 bruto → R$ 80,00 com o imposto; a linha é R$ 100,00
      rows: [{ entityId: "c1", entityName: "Campanha Um", dateStart: "2026-10-28", spend: 70.28, impressions: 1000, clicks: 12, linkClicks: 10 }],
    }));
    montar();
    fireEvent.click(controle("Campanha Um"));
    await waitFor(() => expect(screen.getByText("Σ dos dias")).toBeTruthy());
    const soma = linhasDosDias("Campanha Um").at(-1)!;
    expect(textoDa(soma)).toContain("R$ 80,00");
    expect(textoDa(soma)).toContain("Δ −R$ 20,00 vs. linha");
    // impressões e cliques batem: só o investimento declara a diferença
    expect(textoDa(soma).match(/Δ/g)).toHaveLength(1);
  });
});
