import { describe, it, expect } from "vitest";
import { normalizeLpUrl } from "../lp-url";

describe("normalizeLpUrl — Story 29.40 (AC2)", () => {
  describe("os 4 casos que o AC2 exige", () => {
    it("mesma página com UTMs diferentes cai na mesma chave", () => {
      const a = normalizeLpUrl("https://omeufilhobilingue.com.br/club-english-for-kids/?utm_source=meta&utm_medium=abc");
      const b = normalizeLpUrl("https://omeufilhobilingue.com.br/club-english-for-kids/?utm_source=google&utm_campaign=xyz");
      const c = normalizeLpUrl("https://omeufilhobilingue.com.br/club-english-for-kids/");
      expect(a).toBe(c);
      expect(b).toBe(c);
      expect(c).toBe("omeufilhobilingue.com.br/club-english-for-kids");
    });

    it("paths diferentes produzem chaves diferentes", () => {
      expect(normalizeLpUrl("https://x.com.br/inscricao")).not.toBe(normalizeLpUrl("https://x.com.br/inscricao-b"));
    });

    it("http e https são a mesma página", () => {
      expect(normalizeLpUrl("http://x.com.br/lp")).toBe(normalizeLpUrl("https://x.com.br/lp"));
    });

    it("URL malformada não estoura — devolve null", () => {
      expect(normalizeLpUrl("não é uma url")).toBeNull();
      expect(normalizeLpUrl("")).toBeNull();
      expect(normalizeLpUrl("   ")).toBeNull();
      expect(normalizeLpUrl(null)).toBeNull();
      expect(normalizeLpUrl(undefined)).toBeNull();
    });
  });

  describe("o caso real que a amostra do AC0 trouxe", () => {
    // Macro da Meta não expandida. Sem descartar a query, esta URL viraria uma
    // LP própria concorrendo com a página da qual é só variante de rastreio.
    it("macro {{...}} não expandida não cria uma LP própria", () => {
      const comMacro = normalizeLpUrl(
        "https://omeufilhobilingue.com.br/club-english-for-kids/?utm_source=meta&utm_medium={{adset.name}}",
      );
      const limpa = normalizeLpUrl("https://omeufilhobilingue.com.br/club-english-for-kids/");
      expect(comMacro).toBe(limpa);
    });

    it("as três LPs reais do fz-a1 continuam distintas entre si", () => {
      const chaves = [
        "https://omeufilhobilingue.com.br/club-english-for-kids/",
        "https://omeufilhobilingue.com.br/sobrevivencia-da-mae-2/",
        "https://lp.omeufilhobilingue.com.br/fzm2jun26-captura-a/",
      ].map(normalizeLpUrl);
      expect(new Set(chaves).size).toBe(3);
    });
  });

  describe("normalização de host", () => {
    it("www. é removido", () => {
      expect(normalizeLpUrl("https://www.x.com.br/lp")).toBe("x.com.br/lp");
    });

    it("host em maiúsculas é normalizado", () => {
      expect(normalizeLpUrl("https://X.COM.BR/lp")).toBe("x.com.br/lp");
    });

    it("subdomínio distinto é LP distinta — lp.x.com.br não é x.com.br", () => {
      expect(normalizeLpUrl("https://lp.x.com.br/a")).not.toBe(normalizeLpUrl("https://x.com.br/a"));
    });
  });

  describe("path", () => {
    it("barra final não cria LP nova", () => {
      expect(normalizeLpUrl("https://x.com.br/lp/")).toBe(normalizeLpUrl("https://x.com.br/lp"));
    });

    it("múltiplas barras finais também não", () => {
      expect(normalizeLpUrl("https://x.com.br/lp///")).toBe("x.com.br/lp");
    });

    it("raiz do domínio é chave válida", () => {
      expect(normalizeLpUrl("https://x.com.br/")).toBe("x.com.br");
      expect(normalizeLpUrl("https://x.com.br")).toBe("x.com.br");
    });

    it("path profundo é preservado inteiro", () => {
      expect(normalizeLpUrl("https://x.com.br/a/b/c")).toBe("x.com.br/a/b/c");
    });

    it("case do path é preservado — servidores tratam /LP e /lp como distintos", () => {
      expect(normalizeLpUrl("https://x.com.br/LP")).toBe("x.com.br/LP");
    });
  });

  describe("fragmento e esquemas não navegáveis", () => {
    it("fragmento é descartado", () => {
      expect(normalizeLpUrl("https://x.com.br/lp#secao")).toBe("x.com.br/lp");
    });

    it("query e fragmento juntos são descartados", () => {
      expect(normalizeLpUrl("https://x.com.br/lp?a=1#b")).toBe("x.com.br/lp");
    });

    it("mailto/tel/deep link não são landing pages", () => {
      expect(normalizeLpUrl("mailto:a@b.com")).toBeNull();
      expect(normalizeLpUrl("tel:+5511999999999")).toBeNull();
      expect(normalizeLpUrl("myapp://produto/1")).toBeNull();
    });

    it("URL sem protocolo é aceita — digitação de humano, não dado corrompido", () => {
      expect(normalizeLpUrl("omeufilhobilingue.com.br/lp")).toBe("omeufilhobilingue.com.br/lp");
    });
  });

  describe("propriedade de agrupamento", () => {
    it("é idempotente: normalizar a chave devolve a própria chave", () => {
      const k = normalizeLpUrl("https://www.X.com.br/LP/?utm=1")!;
      expect(normalizeLpUrl(k)).toBe(k);
    });
  });
});
