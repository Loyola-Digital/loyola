import { describe, expect, it } from "vitest";
import {
  comoEstadoDoGoogle,
  diasDaConsultaDoGoogle,
  investimentoDoGoogleNaRegua,
  somaNaRegua,
  valorDoGoogleNaRegua,
} from "../google-ads-na-regua";

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
