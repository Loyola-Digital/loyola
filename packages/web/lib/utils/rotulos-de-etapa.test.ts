import { describe, it, expect } from "vitest";
import { rotuloDoTipoDeEtapa } from "./rotulos-de-etapa";

describe("rotuloDoTipoDeEtapa", () => {
  describe("free — o único que depende do funil", () => {
    it("num funil perpétuo, é Perpétuo", () => {
      const r = rotuloDoTipoDeEtapa("free", "perpetual");
      expect(r.titulo).toBe("Perpétuo");
      expect(r.descricao).toBe("Aquisição contínua");
      expect(r.placeholder).toBe("ex: Aquisição");
    });

    it("num funil de lançamento, continua Gratuita", () => {
      const r = rotuloDoTipoDeEtapa("free", "launch");
      expect(r.titulo).toBe("Gratuita");
      expect(r.descricao).toBe("Captação orgânica");
    });

    it("num funil mobile, continua Gratuita", () => {
      // `mobile` cai no mesmo ramo que `perpetual` na escolha do DASHBOARD
      // (`funnelType === "launch" ? ... : ...`), mas não aqui: o rótulo é do
      // perpétuo, não do "tudo que não é lançamento".
      expect(rotuloDoTipoDeEtapa("free", "mobile").titulo).toBe("Gratuita");
    });

    it("sem funnelType, continua Gratuita", () => {
      expect(rotuloDoTipoDeEtapa("free", undefined).titulo).toBe("Gratuita");
      expect(rotuloDoTipoDeEtapa("free", null).titulo).toBe("Gratuita");
    });
  });

  describe("os outros dez não mudam com o funil", () => {
    const outros = [
      "paid", "application", "sales", "cpl", "event",
      "event_capture", "debriefing", "mapa", "comercial", "lyrio",
    ];

    it.each(outros)("%s responde igual em perpétuo e em lançamento", (tipo) => {
      expect(rotuloDoTipoDeEtapa(tipo, "perpetual")).toEqual(
        rotuloDoTipoDeEtapa(tipo, "launch"),
      );
    });

    it("mantém os rótulos que as telas já mostravam", () => {
      expect(rotuloDoTipoDeEtapa("paid", "launch").titulo).toBe("Paga");
      expect(rotuloDoTipoDeEtapa("sales", "launch").titulo).toBe("Vendas");
      expect(rotuloDoTipoDeEtapa("comercial", "perpetual").titulo).toBe("Comercial");
    });

    it("unifica a descrição de application, que divergia entre as duas telas", () => {
      // Criar dizia "Formulário + venda"; editar, "Formulário + venda por UTM".
      expect(rotuloDoTipoDeEtapa("application", "launch").descricao).toBe(
        "Formulário + venda por UTM",
      );
    });
  });

  describe("fallback — AC7", () => {
    it("tipo desconhecido devolve o próprio valor, NUNCA Gratuita", () => {
      const r = rotuloDoTipoDeEtapa("tipo_que_nao_existe", "launch");
      expect(r.titulo).toBe("tipo_que_nao_existe");
      expect(r.titulo).not.toBe("Gratuita");
      expect(r.descricao).toBe("");
    });

    it("tipo desconhecido em funil perpétuo também não vira Perpétuo", () => {
      expect(rotuloDoTipoDeEtapa("outro", "perpetual").titulo).toBe("outro");
    });

    it("stageType vazio ou nulo devolve travessão", () => {
      expect(rotuloDoTipoDeEtapa(null, "launch").titulo).toBe("—");
      expect(rotuloDoTipoDeEtapa("", "perpetual").titulo).toBe("—");
    });
  });
});
