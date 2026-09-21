import { describe, expect, it } from "vitest";
import { COR_DO_EXPERT, corDaCampanha, expertDaCampanha } from "../cor-do-expert";

describe("expertDaCampanha", () => {
  it("pelo começo do nome, como o time nomeia", () => {
    expect(expertDaCampanha("PPA2 - ANSIEDADE")).toBe("PP");
    expect(expertDaCampanha("FZM3 - MFB")).toBe("FZ");
    expect(expertDaCampanha("DG-PG04-JUL-26")).toBe("DG");
    expect(expertDaCampanha("BBEPR2")).toBe("BBE");
    expect(expertDaCampanha("LYRIO A2 - ASSINATURA")).toBe("LYRIO");
    expect(expertDaCampanha("dgl3 - black cpdf")).toBe("DG");
  });

  it("MFB é da FZ e CPDF é do DG", () => {
    expect(expertDaCampanha("MFB Black")).toBe("FZ");
    expect(expertDaCampanha("CPDF Renovação")).toBe("DG");
  });

  it("sem prefixo, a agenda do Google decide", () => {
    expect(expertDaCampanha("Evento Presencial", "🥩 [BBE] Agenda Geral")).toBe("BBE");
    expect(expertDaCampanha("Agenda", "📆 [LL] Agenda Geral")).toBe("GERAL");
  });

  it("o resto é Geral (amarelo)", () => {
    expect(expertDaCampanha("☠️ Eleições")).toBe("GERAL");
    expect(corDaCampanha("☠️ Jogo do Brasil")).toBe(COR_DO_EXPERT.GERAL);
  });
});
