/**
 * Links no texto do mapa.
 *
 * O que estes testes protegem: o texto que a pessoa escreveu tem de sobreviver
 * inteiro. Um pedaço perdido no meio do parsing some da tela sem erro nenhum —
 * e o dado continua no banco, o que faz parecer que o mapa corrompeu.
 */

import { describe, expect, it } from "vitest";
import {
  comEsquema,
  ehUrl,
  encurtar,
  linkAoColar,
  pedacosDoTexto,
} from "../texto-com-links";

/** O texto reconstruído a partir dos pedaços, para conferir que nada sumiu. */
function remontar(pedacos: ReturnType<typeof pedacosDoTexto>): string {
  return pedacos
    .map((p) => (p.tipo === "texto" ? p.valor : p.rotulo === p.url ? p.url : `[${p.rotulo}](${p.url})`))
    .join("");
}

describe("pedacosDoTexto", () => {
  it("texto sem link vira um pedaço só", () => {
    const r = pedacosDoTexto("captação começa dia 12");
    expect(r).toEqual([{ tipo: "texto", valor: "captação começa dia 12" }]);
  });

  it("acha o markdown com rótulo", () => {
    const r = pedacosDoTexto("ver a [página de vendas](https://exemplo.com/lp) antes");
    expect(r).toEqual([
      { tipo: "texto", valor: "ver a " },
      { tipo: "link", rotulo: "página de vendas", url: "https://exemplo.com/lp" },
      { tipo: "texto", valor: " antes" },
    ]);
  });

  it("acha a URL colada solta", () => {
    const r = pedacosDoTexto("olha https://exemplo.com/x aqui");
    expect(r[1]).toEqual({ tipo: "link", rotulo: "https://exemplo.com/x", url: "https://exemplo.com/x" });
  });

  it("não parte a marcação ao meio", () => {
    // Dentro de `[a](url)` existe uma URL solta. Casá-la primeiro quebraria o
    // link em três pedaços e o rótulo apareceria solto na tela.
    const r = pedacosDoTexto("[clique aqui](https://exemplo.com/a)");
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ tipo: "link", rotulo: "clique aqui", url: "https://exemplo.com/a" });
  });

  it("não engole a pontuação que fecha a frase", () => {
    // "acesse https://x.com." — o ponto é da frase, não do endereço.
    const r = pedacosDoTexto("acesse https://exemplo.com/lp.");
    expect(r[1]!.tipo === "link" && r[1]!.url).toBe("https://exemplo.com/lp");
    expect(r[2]).toEqual({ tipo: "texto", valor: "." });
  });

  it("preserva o texto inteiro, com vários links", () => {
    const original =
      "topo https://a.com/1 meio [rótulo](https://b.com/2) e https://c.com/3 fim";
    expect(remontar(pedacosDoTexto(original))).toBe(original);
  });

  it("texto vazio não vira pedaço nenhum", () => {
    expect(pedacosDoTexto("")).toEqual([]);
  });
});

describe("linkAoColar", () => {
  it("colar URL sobre a seleção vira link", () => {
    const r = linkAoColar("ver a página de vendas", 6, 22, "https://exemplo.com/lp");
    expect(r?.texto).toBe("ver a [página de vendas](https://exemplo.com/lp)");
    // Cursor no fim do que foi inserido, para continuar digitando.
    expect(r?.cursor).toBe(r!.texto.length);
  });

  it("sem seleção, deixa o colar normal acontecer", () => {
    // Interceptar tudo faria o Ctrl+V comum parar de funcionar na nota.
    expect(linkAoColar("texto", 3, 3, "https://exemplo.com")).toBeNull();
  });

  it("colar algo que não é URL não vira link", () => {
    expect(linkAoColar("texto qualquer", 0, 5, "outra coisa")).toBeNull();
  });

  it("colar URL sobre URL é substituição, não link", () => {
    // `[https://a](https://b)` não quer dizer nada.
    expect(linkAoColar("https://a.com", 0, 13, "https://b.com")).toBeNull();
  });
});

describe("ehUrl", () => {
  it("aceita http e https, recusa o resto", () => {
    expect(ehUrl("https://exemplo.com")).toBe(true);
    expect(ehUrl("  http://exemplo.com/x  ")).toBe(true);
    expect(ehUrl("exemplo.com")).toBe(false);
    expect(ehUrl("javascript:alert(1)")).toBe(false);
    expect(ehUrl("")).toBe(false);
  });
});

describe("encurtar", () => {
  it("mantém o que já cabe", () => {
    expect(encurtar("https://a.com/x")).toBe("https://a.com/x");
  });

  it("tira o esquema e o www do que não cabe", () => {
    const longa = `https://www.exemplo.com.br/${"a".repeat(60)}`;
    const r = encurtar(longa);
    expect(r.startsWith("exemplo.com.br/")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(40);
  });
});

describe("comEsquema", () => {
  it("completa o endereço digitado sem http", () => {
    // Sem esquema o navegador trata como caminho relativo, e o link abre
    // DENTRO do app numa rota que não existe.
    expect(comEsquema("exemplo.com/lp")).toBe("https://exemplo.com/lp");
  });

  it("não mexe no que já tem esquema", () => {
    expect(comEsquema("https://exemplo.com")).toBe("https://exemplo.com");
    expect(comEsquema("http://exemplo.com")).toBe("http://exemplo.com");
  });

  it("apara antes de decidir", () => {
    expect(comEsquema("  exemplo.com  ")).toBe("https://exemplo.com");
  });

  it("string vazia continua vazia", () => {
    // Devolver "https://" para um campo em branco criaria um link para lugar
    // nenhum no bloco.
    expect(comEsquema("   ")).toBe("");
  });
});
