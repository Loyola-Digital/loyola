import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  comoEstadoDoGoogle,
  diasDaConsultaDoGoogle,
  investimentoDoGoogleNaRegua,
  somaNaRegua,
  trafegoDoGoogleNaRegua,
  trafegoNaRegua,
  valorDoGoogleNaRegua,
} from "../google-ads-na-regua";
import { hojeNoNegocio } from "../janela-dos-cards-lyrio";

/**
 * Story 42.14 (D17, AC4f) — o Google na régua da Meta: N dias de calendário de
 * SP terminando hoje. Hoje fixo: 16/10/2026.
 */
const HOJE = "2026-10-16";
const conta = { tipo: "conta" as const, accountId: "acc" };
const pronta = (data: { date: string; spend: number }[]) => ({ isLoading: false, error: null, data });

describe("somaNaRegua — o recorte dos dias", () => {
  it("7 dias = 10/10 a 16/10, inclusive nas duas pontas; o dia anterior (N + 1 da API em UTC) fica FORA", () => {
    const linhas = [
      { date: "2026-10-09", spend: 1000 }, // o 8º dia: a API em UTC (hoje − days) o devolve; a régua não
      { date: "2026-10-10", spend: 10 },
      { date: "2026-10-13", spend: 20.05 },
      { date: "2026-10-16", spend: 3.1 },
    ];
    expect(somaNaRegua(linhas, 7, HOJE)).toBe(33.15);
  });
  it("1 dia é só hoje", () => {
    expect(somaNaRegua([{ date: "2026-10-15", spend: 5 }, { date: "2026-10-16", spend: 2 }], 1, HOJE)).toBe(2);
  });
  it("soma em centavos: 0,1 + 0,2 = 0,30 exato", () => {
    expect(somaNaRegua([{ date: "2026-10-16", spend: 0.1 }, { date: "2026-10-15", spend: 0.2 }], 7, HOJE)).toBe(0.3);
  });
  it("um dia DEPOIS de hoje (o 'amanhã' em UTC da API) também fica fora", () => {
    expect(somaNaRegua([{ date: "2026-10-17", spend: 9 }], 7, HOJE)).toBe(0);
  });
});

describe("investimentoDoGoogleNaRegua — erro nunca vira número parcial", () => {
  it("as campanhas vinculadas somadas na régua", () => {
    const r = investimentoDoGoogleNaRegua(conta, [pronta([{ date: "2026-10-16", spend: 10 }]), pronta([{ date: "2026-10-15", spend: 5 }, { date: "2026-09-01", spend: 99 }])], 7, HOJE);
    expect(r).toEqual({ tipo: "pronto", spend: 15 });
    expect(valorDoGoogleNaRegua(r)).toBe(15);
  });
  it("UMA consulta em erro → erro com a mensagem (somar só as outras daria um número menor com cara de medido)", () => {
    const erro = Object.assign(new Error("Erro ao buscar insights diarios do Google Ads"), { body: { error: "Erro ao buscar insights diarios do Google Ads", details: "invalid_grant" } });
    const r = investimentoDoGoogleNaRegua(conta, [pronta([{ date: "2026-10-16", spend: 10 }]), { isLoading: false, error: erro, data: undefined }], 7, HOJE);
    expect(r).toEqual({ tipo: "erro", mensagem: "Erro ao buscar insights diarios do Google Ads: invalid_grant" });
    expect(valorDoGoogleNaRegua(r)).toBeNull();
  });
  it("carregando enquanto alguma não respondeu", () => {
    expect(investimentoDoGoogleNaRegua(conta, [pronta([]), { isLoading: true, error: null, data: undefined }], 7, HOJE)).toEqual({ tipo: "carregando" });
  });
  it("a conta decide primeiro (42.13): sem campanha = 0; sem conta / erro do picker = desconhecido", () => {
    expect(valorDoGoogleNaRegua(investimentoDoGoogleNaRegua({ tipo: "sem_campanha" }, [], 7, HOJE))).toBe(0);
    expect(valorDoGoogleNaRegua(investimentoDoGoogleNaRegua({ tipo: "sem_conta" }, [], 7, HOJE))).toBeNull();
    expect(investimentoDoGoogleNaRegua({ tipo: "erro", mensagem: "x" }, [], 7, HOJE)).toEqual({ tipo: "erro", mensagem: "x" });
  });
  it("a ponte para o estado da 42.13 só mantém erro e sem conta (os que têm memorial de causa)", () => {
    expect(comoEstadoDoGoogle({ tipo: "erro", mensagem: "x" })).toEqual({ tipo: "erro", mensagem: "x" });
    expect(comoEstadoDoGoogle({ tipo: "sem_conta" })).toEqual({ tipo: "sem_conta" });
    expect(comoEstadoDoGoogle({ tipo: "pronto", spend: 1 })).toEqual({ tipo: "sem_entrega" });
  });
  it("uma consulta de max(N, 28) dias cobre o filtro e os 28 fixos; teto 365", () => {
    expect(diasDaConsultaDoGoogle(7, 28)).toBe(28);
    expect(diasDaConsultaDoGoogle(90, 28)).toBe(90);
    expect(diasDaConsultaDoGoogle(400, 28)).toBe(365);
  });
});

/**
 * Story 42.16 (AC2b, AC5b) — impressões e cliques do Google no MESMO recorte do
 * gasto, no total (bloco Google) e por campanha (Detalhamento). Relógio e fuso
 * fixos: às 23:30 de SP o dia em UTC já virou, e o "hoje" é o de SP.
 */
describe.each(["UTC", "America/Sao_Paulo", "Asia/Tokyo"])("Story 42.16 — trafegoDoGoogleNaRegua com TZ=%s", (tz) => {
  const tzOriginal = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = tz;
    vi.useFakeTimers();
    // 16/10/2026 23:30 em SP = 17/10/2026 02:30 em UTC
    vi.setSystemTime(new Date("2026-10-17T02:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = tzOriginal;
  });

  const linhas = (base: number) => [
    { date: "2026-10-09", spend: 1000 + base, impressions: 90_000, clicks: 900 }, // a borda de BAIXO: o 8º dia, fora
    { date: "2026-10-10", spend: 10, impressions: 1_000, clicks: 10 }, // o primeiro dia da régua
    { date: "2026-10-16", spend: 2.5, impressions: 500, clicks: 5 }, // hoje em SP
    { date: "2026-10-17", spend: 77, impressions: 7_700, clicks: 77 }, // a borda de CIMA: "hoje" em UTC, fora
  ];

  it("às 23:30 de SP, hoje é 16/10 (não o 17/10 de UTC)", () => {
    expect(hojeNoNegocio()).toBe("2026-10-16");
  });

  it("a soma de impressões e cliques no recorte, com um dia de fora em cada borda", () => {
    expect(trafegoNaRegua(linhas(0), 7, hojeNoNegocio())).toEqual({ spend: 12.5, impressions: 1_500, clicks: 15 });
  });

  it("total e por campanha, a partir das consultas de cada campanha vinculada", () => {
    const hoje = hojeNoNegocio();
    const r = trafegoDoGoogleNaRegua(
      conta,
      [
        { campaignId: "g-1", isLoading: false, error: null, data: linhas(0) },
        { campaignId: "g-2", isLoading: false, error: null, data: [{ date: "2026-10-15", spend: 0.1, impressions: 3, clicks: 1 }] },
      ],
      7,
      hoje,
    );
    expect(r).toMatchObject({ tipo: "pronto", spend: 12.6, impressions: 1_503, clicks: 16 });
    if (r.tipo !== "pronto") throw new Error("esperava pronto");
    expect(r.porCampanha.get("g-1")).toEqual({ spend: 12.5, impressions: 1_500, clicks: 15 });
    expect(r.porCampanha.get("g-2")).toEqual({ spend: 0.1, impressions: 3, clicks: 1 });
    // Story 42.19 (AC2e): os dias da linha expansível são as linhas DA MESMA consulta, só as da régua
    const diasG1 = r.diasPorCampanha.get("g-1")!;
    expect(diasG1.every((d) => d.date >= "2026-10-10" && d.date <= hoje)).toBe(true);
    expect(diasG1.length).toBe(linhas(0).length - 2); // um dia de fora em cada borda
    expect(trafegoNaRegua(diasG1, 7, hoje)).toEqual(r.porCampanha.get("g-1"));
    expect(r.diasPorCampanha.get("g-2")).toEqual([{ date: "2026-10-15", spend: 0.1, impressions: 3, clicks: 1 }]);
    // o investimento do Resumo (42.14) é o gasto deste mesmo tráfego
    expect(investimentoDoGoogleNaRegua(conta, [{ isLoading: false, error: null, data: linhas(0) }], 7, hoje)).toEqual({ tipo: "pronto", spend: 12.5 });
  });

  it("1 dia é só hoje de SP: o 17/10 de UTC fica fora", () => {
    expect(trafegoNaRegua(linhas(0), 1, hojeNoNegocio())).toEqual({ spend: 2.5, impressions: 500, clicks: 5 });
  });

  it("erro em UMA consulta → erro (nunca soma parcial de impressões e cliques); a conta decide antes", () => {
    const erro = new Error("invalid_grant");
    expect(trafegoDoGoogleNaRegua(conta, [{ isLoading: false, error: null, data: linhas(0) }, { isLoading: false, error: erro, data: undefined }], 7, hojeNoNegocio())).toEqual({ tipo: "erro", mensagem: "invalid_grant" });
    expect(trafegoDoGoogleNaRegua({ tipo: "sem_conta" }, [], 7, hojeNoNegocio())).toEqual({ tipo: "sem_conta" });
    expect(trafegoDoGoogleNaRegua(conta, [{ isLoading: true, error: null, data: undefined }], 7, hojeNoNegocio())).toEqual({ tipo: "carregando" });
  });
});
