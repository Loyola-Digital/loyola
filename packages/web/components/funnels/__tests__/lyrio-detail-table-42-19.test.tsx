// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TrafegoDoGoogleNaRegua } from "@/lib/utils/google-ads-na-regua";
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

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LyrioDetailTable
        projectId="p1"
        funnelId="f1"
        stageId="s1"
        brlRate={5}
        revenuecatConectado
        campaignIds={["c1", "c2"]}
        googleAccountId={null}
        googleCampaignIds={new Set()}
        googleCampanhas={[]}
        googleTrafego={googleTrafego}
        days={3}
      />
    </QueryClientProvider>,
  );
}

const controle = (nome: string) => screen.getByRole("button", { name: new RegExp(`os dias de ${nome}$`) });
const daSerie = () => pedidos.filter((p) => p.includes("/entity-daily"));

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
