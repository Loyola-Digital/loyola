/**
 * A cadeia do mini-funil por LP.
 *
 * Estes testes existem porque a primeira versão do card errou exatamente aqui:
 * montou uma cadeia fixa (lead → aplicação → pesquisa → compra) e o resultado no
 * dash foi "1 aplicação e 300 vendas" na Captação Paga — a linha de aplicação
 * lia o formulário do comercial, que não pertence àquele funil, e a pesquisa
 * aparecia antes da compra que a origina.
 */

import { describe, expect, it } from "vitest";
import {
  baseDoFunil,
  montarEtapasLpFunnel,
  type ContagensLpFunnel,
} from "@/lib/utils/lp-funnel-steps";

const CONTAGENS: ContagensLpFunnel = {
  leads: 3210,
  aplicacoes: 1,
  pesquisas: 288,
  compras: 410,
};

const TODAS_AS_FONTES = { aplicacao: true, pesquisa: true };

const rotulos = (params: Parameters<typeof montarEtapasLpFunnel>[0]) =>
  montarEtapasLpFunnel(params).map((e) => e.label);

describe("montarEtapasLpFunnel — Captação Paga", () => {
  const base = {
    stageType: "paid" as const,
    lpViews: 12430,
    funil: CONTAGENS,
    temFonte: TODAS_AS_FONTES,
  };

  it("fecha a cadeia na pesquisa, porque quem responde já comprou o ingresso", () => {
    expect(rotulos(base)).toEqual([
      "LP View",
      "Leads Popup",
      "Compraram ingresso",
      "Responderam pesquisa",
    ]);
  });

  it("nunca inclui 'Aplicaram' — o formulário de aplicação é de outra etapa", () => {
    // Mesmo com fonte de aplicação conectada ao funil, ela não entra na Paga.
    expect(rotulos(base)).not.toContain("Aplicaram");
    expect(rotulos({ ...base, temFonte: { aplicacao: true, pesquisa: false } })).not.toContain(
      "Aplicaram",
    );
  });

  it("chama o lead de 'Leads Popup', como o resto do dash", () => {
    expect(rotulos(base)[1]).toBe("Leads Popup");
  });

  it("omite a pesquisa quando a etapa não tem pesquisa conectada", () => {
    const r = rotulos({ ...base, temFonte: { aplicacao: true, pesquisa: false } });
    expect(r).toEqual(["LP View", "Leads Popup", "Compraram ingresso"]);
  });
});

describe("montarEtapasLpFunnel — Captação Gratuita", () => {
  const base = {
    stageType: "free" as const,
    lpViews: 8120,
    funil: CONTAGENS,
    temFonte: TODAS_AS_FONTES,
  };

  it("põe a pesquisa ANTES da compra, porque lá quem responde é o lead", () => {
    expect(rotulos(base)).toEqual([
      "LP View",
      "Leads",
      "Aplicaram",
      "Responderam pesquisa",
      "Compraram",
    ]);
  });

  it("tira da cadeia a etapa sem planilha conectada", () => {
    expect(rotulos({ ...base, temFonte: { aplicacao: false, pesquisa: true } })).toEqual([
      "LP View",
      "Leads",
      "Responderam pesquisa",
      "Compraram",
    ]);
    expect(rotulos({ ...base, temFonte: { aplicacao: false, pesquisa: false } })).toEqual([
      "LP View",
      "Leads",
      "Compraram",
    ]);
  });
});

describe("montarEtapasLpFunnel — valores e tooltip", () => {
  it("zera as contagens quando a LP não tem linha de planilha, sem quebrar", () => {
    const etapas = montarEtapasLpFunnel({
      stageType: "paid",
      lpViews: 500,
      funil: null,
      temFonte: TODAS_AS_FONTES,
    });
    expect(etapas.map((e) => e.valor)).toEqual([500, 0, 0, 0]);
  });

  it("nomeia a planilha real no tooltip", () => {
    const etapas = montarEtapasLpFunnel({
      stageType: "paid",
      lpViews: 1,
      funil: CONTAGENS,
      temFonte: TODAS_AS_FONTES,
      fontesPorEtapa: {
        captacao: ["Leads popup · n8n-leads-captacao"],
        aplicacao: [],
        pesquisa: ["Pesquisa · Respostas"],
      },
    });
    expect(etapas[1].fonte).toContain("n8n-leads-captacao");
    expect(etapas[3].fonte).toContain("Respostas");
  });

  it("não deixa o tooltip com sobra quando não há planilha nomeada", () => {
    const etapas = montarEtapasLpFunnel({
      stageType: "free",
      lpViews: 1,
      funil: CONTAGENS,
      temFonte: TODAS_AS_FONTES,
    });
    expect(etapas[1].fonte).not.toContain("—");
  });
});

describe("baseDoFunil", () => {
  it("usa a primeira etapa com volume, não o LP View cegamente", () => {
    // Sem Meta conectada o LP View vem 0; ancorar nele apagaria todas as barras.
    const etapas = montarEtapasLpFunnel({
      stageType: "paid",
      lpViews: 0,
      funil: CONTAGENS,
      temFonte: TODAS_AS_FONTES,
    });
    expect(baseDoFunil(etapas)).toBe(CONTAGENS.leads);
  });

  it("devolve 0 quando o funil inteiro está vazio", () => {
    const etapas = montarEtapasLpFunnel({
      stageType: "paid",
      lpViews: 0,
      funil: { leads: 0, aplicacoes: 0, pesquisas: 0, compras: 0 },
      temFonte: TODAS_AS_FONTES,
    });
    expect(baseDoFunil(etapas)).toBe(0);
  });
});
