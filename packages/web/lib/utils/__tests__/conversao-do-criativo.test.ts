import { describe, it, expect } from "vitest";
import {
  conversaoDoCriativo,
  custoPorConversao,
  motivoSemConversao,
  vendasDeduzidas,
  ingressosDoGrupo,
} from "../conversao-do-criativo";

/**
 * Story 18.75 — o card do Top Criativos mostra três coisas diferentes com o
 * mesmo layout, e o que decide qual delas é a etapa. Estes testes existem
 * porque o componente é compartilhado por três telas: um `if` errado aqui
 * troca "ingressos" por "leads" numa tela sem quebrar nada nas outras.
 */

describe("conversaoDoCriativo — a unidade é da tela, não do card", () => {
  it("Perpétuo conta vendas e chama o custo de CAC", () => {
    const c = conversaoDoCriativo("perpetual", null);
    expect(c.unidade).toBe("vendas");
    expect(c.rotulo).toBe("Vendas");
    expect(c.rotuloCusto).toBe("CAC");
  });

  it("Perpétuo ganha da etapa: funnelType decide primeiro", () => {
    // Um funil perpétuo com etapa marcada como `paid` continua contando vendas.
    expect(conversaoDoCriativo("perpetual", "paid").unidade).toBe("vendas");
  });

  it("Captação Paga conta ingressos e chama o custo de CPI", () => {
    const c = conversaoDoCriativo("launch", "paid");
    expect(c.unidade).toBe("ingressos");
    expect(c.rotuloCusto).toBe("CPI");
  });

  it("event_capture é Captação Paga — o tipo que a 19.14 deixou de fora", () => {
    // Este é o teste que falha se alguém trocar o helper compartilhado por
    // `stageType === "paid"`. A única etapa event_capture de produção abriu sem
    // faturamento exatamente por causa dessa comparação literal.
    expect(conversaoDoCriativo("launch", "event_capture").unidade).toBe("ingressos");
  });

  it("etapa gratuita conta leads", () => {
    const c = conversaoDoCriativo("launch", "free");
    expect(c.unidade).toBe("leads");
    expect(c.rotuloCusto).toBe("CPL");
  });

  it("sem stageType, o default é leads — o comportamento de antes da story", () => {
    expect(conversaoDoCriativo(undefined, undefined).unidade).toBe("leads");
    expect(conversaoDoCriativo("launch", null).unidade).toBe("leads");
  });
});

describe("custoPorConversao — sem denominador não há custo", () => {
  it("divide investimento pelas conversões", () => {
    expect(custoPorConversao(300, 12)).toBe(25);
  });

  it("zero conversões devolve null, nunca Infinity", () => {
    expect(custoPorConversao(300, 0)).toBeNull();
    expect(custoPorConversao(300, null)).toBeNull();
    expect(custoPorConversao(300, undefined)).toBeNull();
  });

  it("investimento zero devolve null, nunca R$ 0,00", () => {
    // "De graça" é uma leitura pior que "—": o criativo não teve gasto medido.
    expect(custoPorConversao(0, 5)).toBeNull();
  });
});

describe("motivoSemConversao — erro não pode virar ausência", () => {
  const paga = conversaoDoCriativo("launch", "paid");

  it("sem fonte ligada, o motivo aponta a configuração", () => {
    const m = motivoSemConversao(paga, false, null);
    expect(m).toContain("planilha de captação paga");
    expect(m).toContain("Sem");
  });

  it("com fonte e zero conversões, o motivo é resultado — não configuração", () => {
    const m = motivoSemConversao(paga, true, 0);
    expect(m).toContain("Nenhum registro");
    expect(m).not.toContain("Sem planilha");
  });

  it("com fonte e conversões, não há motivo: há número", () => {
    expect(motivoSemConversao(paga, true, 7)).toBeNull();
  });

  it("distingue 'não devolveu' de 'devolveu zero'", () => {
    expect(motivoSemConversao(paga, true, null)).not.toBe(motivoSemConversao(paga, true, 0));
  });
});

describe("vendasDeduzidas — o mesmo comprador em dois anúncios é uma venda", () => {
  const byAdId = {
    a1: { faturamentoBruto: 200, emails: ["joao@x.com", "maria@x.com"] },
    a2: { faturamentoBruto: 100, emails: ["joao@x.com"] },
  };

  it("conta o comprador uma vez só entre os ad_ids do grupo", () => {
    const r = vendasDeduzidas(["a1", "a2"], byAdId);
    // 3 linhas de venda, 2 compradores distintos.
    expect(r.vendas).toBe(2);
  });

  it("sem a dedup o número seria 3 — é isso que este teste protege", () => {
    const semDedup = ["a1", "a2"].reduce((s, id) => s + byAdId[id as "a1"].emails.length, 0);
    expect(semDedup).toBe(3);
    expect(vendasDeduzidas(["a1", "a2"], byAdId).vendas).toBeLessThan(semDedup);
  });

  it("o bruto sai do share por comprador, não da soma das entradas", () => {
    // a1: 200 / 2 e-mails = 100 por comprador (joão + maria = 200)
    // a2: joão já visto, não soma.
    expect(vendasDeduzidas(["a1", "a2"], byAdId).bruto).toBe(200);
  });

  it("mapa ausente não quebra", () => {
    expect(vendasDeduzidas(["a1"], undefined)).toEqual({ vendas: 0, bruto: 0 });
  });
});

describe("ingressosDoGrupo — ausência não é zero", () => {
  it("soma os ad_ids do grupo", () => {
    const m = new Map([["a1", 10], ["a2", 5]]);
    expect(ingressosDoGrupo(["a1", "a2"], m)).toBe(15);
  });

  it("devolve null quando nenhum ad_id do grupo está no mapa", () => {
    // Diferente de 0: 0 significaria "medimos e ninguém entrou".
    expect(ingressosDoGrupo(["zzz"], new Map([["a1", 10]]))).toBeNull();
  });

  it("devolve 0 quando o anúncio está no mapa com zero", () => {
    expect(ingressosDoGrupo(["a1"], new Map([["a1", 0]]))).toBe(0);
  });

  it("NÃO deduplica entre anúncios — o número tem que bater com a tabela", () => {
    // A rota já devolve o único por anúncio. Uma segunda dedup aqui faria o
    // card discordar da tabela de Desempenho de Criativos na mesma tela.
    const m = new Map([["a1", 10], ["a2", 10]]);
    expect(ingressosDoGrupo(["a1", "a2"], m)).toBe(20);
  });
});
