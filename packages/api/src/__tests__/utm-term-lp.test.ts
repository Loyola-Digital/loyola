/**
 * Identificação da LP a partir das UTMs de uma linha de planilha.
 *
 * É a peça que decide de qual página cada lead/aplicação/venda veio no mini-funil
 * por LP. Errar aqui não quebra nada visivelmente — só move gente de uma coluna
 * para a outra e faz o time escolher a página errada como vencedora.
 */

import { describe, expect, it } from "vitest";
import { chaveLp, lpDoRegistro, rotuloLp } from "../services/utm-term.js";

describe("rotuloLp", () => {
  it("normaliza caixa e devolve o rótulo canônico", () => {
    expect(rotuloLp("lpa")).toBe("LPA");
    expect(rotuloLp("LPA")).toBe("LPA");
    expect(rotuloLp(" lpaa ")).toBe("LPAA");
    expect(rotuloLp("lp")).toBe("LP");
  });

  it("recusa o que não é rótulo de LP", () => {
    expect(rotuloLp("lp-a")).toBeNull();
    expect(rotuloLp("helpdesk")).toBeNull();
    expect(rotuloLp("")).toBeNull();
    expect(rotuloLp(null)).toBeNull();
    expect(rotuloLp(undefined)).toBeNull();
  });
});

describe("chaveLp", () => {
  it("funde a variante fina na mesma chave da tabela de LPs", () => {
    expect(chaveLp("LPA")).toBe("LPA");
    // A tabela lê o campaign_name com /lp([a-z])/ e mostra "LPA" — se aqui
    // "LPAA" virasse chave própria, o card não casaria com a linha.
    expect(chaveLp("LPAA")).toBe("LPA");
    expect(chaveLp("LPB2")).toBe("LPB");
  });

  it("devolve o rótulo intacto quando não há letra depois de LP", () => {
    expect(chaveLp("LP")).toBe("LP");
  });
});

describe("lpDoRegistro", () => {
  it("extrai a LP de um utm_term estruturado do Meta", () => {
    const term =
      "Instagram_Reels_dg-pg04-ago-26--vendas-principal-leads--2026-08-03--hot--cbo--videos--lpa" +
      "|01_FD-ST_ALLINONE30D|adv03--ia--pg04--vendas--g03-b03-f01--is_ia";
    expect(lpDoRegistro(term, "")).toEqual({ rotulo: "LPA", fonte: "term" });
  });

  it("preserva a variante fina do term (a fusão é decisão do chaveLp)", () => {
    const term =
      "Instagram_Feed_dg-pg04-ago-26--vendas-captacao--2026-07-11--cold--cbo--videos--lote00--lpaa" +
      "|00_FD-ST_LaL1-ALLINONE|adv11--ia--pg04--cap-ads-claude";
    expect(lpDoRegistro(term, "")).toEqual({ rotulo: "LPAA", fonte: "term" });
  });

  it("acha a LP solta num term não estruturado", () => {
    expect(lpDoRegistro("campanha-lpb-agosto", "")).toEqual({ rotulo: "LPB", fonte: "term" });
    expect(lpDoRegistro("lpc", "")).toEqual({ rotulo: "LPC", fonte: "term" });
  });

  it("cai na campanha quando o term não tem LP", () => {
    expect(lpDoRegistro("vendas", "dg-pg04-ago-26-lpd")).toEqual({
      rotulo: "LPD",
      fonte: "campanha",
    });
    expect(lpDoRegistro("", "campanha-LPE-teste")).toEqual({
      rotulo: "LPE",
      fonte: "campanha",
    });
  });

  it("prefere o term à campanha quando os dois têm LP", () => {
    // O term é escrito pelo time no anúncio; a campanha é o nome do agrupador e
    // pode estar desatualizada depois de uma duplicação.
    expect(lpDoRegistro("algo--lpb--outro", "campanha-lpa")).toEqual({
      rotulo: "LPB",
      fonte: "term",
    });
  });

  it("devolve null quando nada identifica a LP", () => {
    expect(lpDoRegistro("", "")).toBeNull();
    expect(lpDoRegistro("recuperacao-carrinho", "vendas-agosto")).toBeNull();
    expect(lpDoRegistro("120247829052320208", "")).toBeNull();
    expect(lpDoRegistro(null, undefined)).toBeNull();
  });

  it("não confunde 'lp' colado numa palavra do term", () => {
    // "helpdesk" no TERM não vira LPD: a busca no term exige separador.
    expect(lpDoRegistro("suporte-helpdesk-agosto", "")).toBeNull();
  });

  it("herda o falso positivo da campanha, de propósito", () => {
    // A tabela de LPs usa exatamente esta regra sobre o campaign_name. Divergir
    // aqui faria os dois números brigarem na mesma tela; o teste existe para
    // que a escolha seja deliberada, e não uma surpresa em produção.
    expect(lpDoRegistro("", "campanha-helpdesk")).toEqual({
      rotulo: "LPD",
      fonte: "campanha",
    });
  });
});
