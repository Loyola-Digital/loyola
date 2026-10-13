/**
 * Story 42.13 (AC1/AC6a) — o estado do Google Ads na etapa Lyrio: erro é erro,
 * não "sem entrega" nem R$ 0.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_SEM_CONTA_DO_GOOGLE,
  ORIENTACAO_DO_ERRO_DO_GOOGLE,
  avisoDoGoogle,
  avisoDoGoogleEmLinha,
  contaDoGoogle,
  estadoDoGoogle,
  estadoDoGoogleNaJanela,
  investimentoDoGoogle,
  memorialDoGoogleSemNumero,
  mensagemDoErroDoGoogle,
} from "../lyrio-google-ads";

const ids = new Set(["23978232455", "23982770287"]);
const camp = (id: string, spend: number) => ({ id, spend, impressions: 10, clicks: 1, conversions: 0 });

/** O erro como `lib/api-client.ts` monta: `message` = `error` do corpo, e o corpo inteiro em `body`. */
const erro502 = Object.assign(new Error("Erro ao buscar campanhas do Google Ads"), {
  status: 502,
  body: {
    error: "Erro ao buscar campanhas do Google Ads",
    details: 'Falha ao obter access token do Google: {\n  "error": "invalid_grant",\n  "error_description": "Bad Request"\n}',
  },
});

describe("estadoDoGoogle", () => {
  it("consulta em erro → erro com a mensagem e o details da API (o caso real: invalid_grant)", () => {
    const e = estadoDoGoogle({ isLoading: false, error: erro502, data: undefined }, ids);
    expect(e.tipo).toBe("erro");
    expect(e.tipo === "erro" && e.mensagem).toMatch(/^Erro ao buscar campanhas do Google Ads: Falha ao obter access token.*invalid_grant/s);
  });
  it("erro vale mesmo com dado antigo em cache", () => {
    expect(estadoDoGoogle({ isLoading: false, error: erro502, data: { campaigns: [camp("23978232455", 9)] } }, ids).tipo).toBe("erro");
  });
  it("respondeu sem nenhuma vinculada → sem_entrega (a frase antiga continua só aqui)", () => {
    expect(estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [camp("999", 50)] } }, ids)).toEqual({ tipo: "sem_entrega" });
    expect(estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [] } }, ids)).toEqual({ tipo: "sem_entrega" });
  });
  it("pronto → só as vinculadas", () => {
    const e = estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [camp("999", 50), camp("23982770287", 12.5)] } }, ids);
    expect(e).toEqual({ tipo: "pronto", vinculadas: [camp("23982770287", 12.5)] });
  });
  it("carregando, ou sem dado ainda → carregando", () => {
    expect(estadoDoGoogle({ isLoading: true, error: null, data: undefined }, ids)).toEqual({ tipo: "carregando" });
    expect(estadoDoGoogle({ isLoading: false, error: null, data: undefined }, ids)).toEqual({ tipo: "carregando" });
  });
});

describe("investimentoDoGoogle — o que o Resumo usa no ROAS e na Margem", () => {
  it("erro e carregando → null (desconhecido), nunca 0", () => {
    expect(investimentoDoGoogle({ tipo: "erro", mensagem: "x" })).toBeNull();
    expect(investimentoDoGoogle({ tipo: "carregando" })).toBeNull();
  });
  it("sem entrega → 0; pronto → soma das vinculadas", () => {
    expect(investimentoDoGoogle({ tipo: "sem_entrega" })).toBe(0);
    expect(investimentoDoGoogle({ tipo: "pronto", vinculadas: [camp("a", 10.25), camp("b", 4.75)] })).toBe(15);
  });
});

describe("mensagemDoErroDoGoogle", () => {
  it("sem body: a message; sem nada: genérica; details já contido não repete", () => {
    expect(mensagemDoErroDoGoogle(new Error("API error: 500"))).toBe("API error: 500");
    expect(mensagemDoErroDoGoogle(null)).toBe("Erro desconhecido");
    expect(mensagemDoErroDoGoogle({ message: "Conta nao encontrada", body: { error: "Conta nao encontrada", details: "Conta nao encontrada" } })).toBe("Conta nao encontrada");
  });
});

// ───────────── QA loop da 42.13 (TEST-001): a conta antes da consulta ─────────────

const picker = (p: Partial<{ isLoading: boolean; error: unknown; data: { accountLinked: boolean } }> = {}) => ({
  isLoading: false,
  error: null,
  data: { accountLinked: false },
  ...p,
});

describe("contaDoGoogle", () => {
  it("sem campanha vinculada → sem_campanha, qualquer que seja a conta", () => {
    expect(contaDoGoogle({ temCampanhas: false, accountId: "acc", picker: picker() })).toEqual({ tipo: "sem_campanha" });
    expect(contaDoGoogle({ temCampanhas: false, accountId: null, picker: picker() })).toEqual({ tipo: "sem_campanha" });
  });
  it("com campanha e conta (da etapa ou do picker) → conta", () => {
    expect(contaDoGoogle({ temCampanhas: true, accountId: "acc-1", picker: picker({ isLoading: true }) })).toEqual({ tipo: "conta", accountId: "acc-1" });
  });
  it("o caso de produção de 13/10: campanhas marcadas, conta removida, picker respondeu → sem_conta", () => {
    expect(contaDoGoogle({ temCampanhas: true, accountId: null, picker: picker() })).toEqual({ tipo: "sem_conta" });
    expect(contaDoGoogle({ temCampanhas: true, accountId: undefined, picker: picker() })).toEqual({ tipo: "sem_conta" });
  });
  it("picker carregando → carregando (sem piscar o aviso); picker em erro → erro com a mensagem", () => {
    expect(contaDoGoogle({ temCampanhas: true, accountId: null, picker: picker({ isLoading: true, data: undefined }) })).toEqual({ tipo: "carregando" });
    expect(contaDoGoogle({ temCampanhas: true, accountId: null, picker: picker({ data: undefined }) })).toEqual({ tipo: "carregando" });
    expect(contaDoGoogle({ temCampanhas: true, accountId: null, picker: picker({ error: new Error("API error: 500") }) })).toEqual({ tipo: "erro", mensagem: "API error: 500" });
  });
});

describe("estadoDoGoogleNaJanela + investimentoDoGoogle", () => {
  const ok = { isLoading: false, error: null, data: { campaigns: [camp("23978232455", 7)] } };
  it("sem conta e sem campanha passam direto, sem olhar a consulta", () => {
    expect(estadoDoGoogleNaJanela({ tipo: "sem_conta" }, ok, ids)).toEqual({ tipo: "sem_conta" });
    expect(estadoDoGoogleNaJanela({ tipo: "sem_campanha" }, ok, ids)).toEqual({ tipo: "sem_campanha" });
    expect(estadoDoGoogleNaJanela({ tipo: "carregando" }, ok, ids)).toEqual({ tipo: "carregando" });
    expect(estadoDoGoogleNaJanela({ tipo: "erro", mensagem: "m" }, ok, ids)).toEqual({ tipo: "erro", mensagem: "m" });
  });
  it("com conta, a consulta manda", () => {
    expect(estadoDoGoogleNaJanela({ tipo: "conta", accountId: "a" }, ok, ids)).toEqual({ tipo: "pronto", vinculadas: [camp("23978232455", 7)] });
    expect(estadoDoGoogleNaJanela({ tipo: "conta", accountId: "a" }, { isLoading: false, error: erro502, data: undefined }, ids).tipo).toBe("erro");
  });
  it("sem conta → investimento desconhecido (null); sem campanha → 0", () => {
    expect(investimentoDoGoogle({ tipo: "sem_conta" })).toBeNull();
    expect(investimentoDoGoogle({ tipo: "sem_campanha" })).toBe(0);
  });
});

describe("os textos dos alertas e do memorial (QA Q2–Q4, Q7, Q8)", () => {
  const erro = { tipo: "erro" as const, mensagem: "Erro ao buscar campanhas do Google Ads: invalid_grant" };
  it("erro: título, a mensagem da API e a orientação de reconectar", () => {
    expect(avisoDoGoogle(erro)).toEqual({ titulo: "Não foi possível buscar os dados do Google Ads.", detalhe: erro.mensagem, orientacao: ORIENTACAO_DO_ERRO_DO_GOOGLE });
    expect(ORIENTACAO_DO_ERRO_DO_GOOGLE).toMatch(/reconecte a conta Google Ads/);
  });
  it("sem conta: diz que falta a conta e onde conectar", () => {
    expect(avisoDoGoogle({ tipo: "sem_conta" })).toEqual({ titulo: "Nenhuma conta Google Ads conectada ao projeto.", detalhe: null, orientacao: AVISO_SEM_CONTA_DO_GOOGLE });
    expect(AVISO_SEM_CONTA_DO_GOOGLE).toMatch(/campanhas do Google Ads vinculadas.*não tem conta Google Ads conectada.*configurações do projeto/);
  });
  it("estados com número (ou a caminho) não têm aviso", () => {
    for (const e of [{ tipo: "carregando" as const }, { tipo: "sem_entrega" as const }, { tipo: "sem_campanha" as const }, { tipo: "pronto" as const, vinculadas: [] }]) {
      expect(avisoDoGoogle(e)).toBeNull();
      expect(avisoDoGoogleEmLinha(e)).toBeNull();
      expect(memorialDoGoogleSemNumero(e, "últimos 28 dias")).toBeUndefined();
    }
  });
  it("em linha (Detalhamento): os três pedaços, nessa ordem; sem conta não tem detalhe vazio", () => {
    expect(avisoDoGoogleEmLinha(erro)).toBe(`Não foi possível buscar os dados do Google Ads. ${erro.mensagem} ${ORIENTACAO_DO_ERRO_DO_GOOGLE}`);
    expect(avisoDoGoogleEmLinha({ tipo: "sem_conta" })).toBe(`Nenhuma conta Google Ads conectada ao projeto. ${AVISO_SEM_CONTA_DO_GOOGLE}`);
  });
  it("memorial do card: o porquê do \"—\", a mensagem e o aviso de que ROAS e Margem também ficam \"—\"", () => {
    const m = memorialDoGoogleSemNumero(erro, "últimos 28 dias")!;
    expect(m).toMatchObject({ expression: "Google Ads API indisponível", result: "—", period: "últimos 28 dias" });
    expect(m.values).toEqual([{ label: "Erro", value: erro.mensagem, source: "GET /api/google-ads/analytics/:accountId/campaigns" }]);
    expect(m.note).toMatch(/^Se o erro fala em token.*o ROAS e a Margem de Contribuição ficam "—"/);
    const s = memorialDoGoogleSemNumero({ tipo: "sem_conta" }, "últimos 28 dias")!;
    expect(s).toMatchObject({ expression: "Sem conta Google Ads conectada", result: "—" });
    expect(s.values[0]).toMatchObject({ label: "Conta", value: "nenhuma conectada ao projeto" });
    expect(s.note).toContain(AVISO_SEM_CONTA_DO_GOOGLE);
  });
});
