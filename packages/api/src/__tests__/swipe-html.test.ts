/**
 * A leitura de uma página HTML salva.
 *
 * O que protege: o CSS e o JS não entram no texto que vai ao modelo. Uma
 * página salva com estilos embutidos passa de um megabyte, quase tudo `<style>`
 * e `data:` URI — mandar isso gastaria o prompt inteiro em bytes que não dizem
 * nada sobre a oferta.
 */

import { describe, expect, it } from "vitest";
import { ehHtml, textoDoHtml } from "../services/swipe-analise.js";

describe("textoDoHtml", () => {
  it("tira o <style> inteiro — é ele que faz a página pesar", () => {
    const html = `<style>.a{color:red}.b{background:url(data:image/png;base64,AAAA)}</style><p>Oferta</p>`;
    const t = textoDoHtml(html);
    expect(t).toContain("Oferta");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("base64");
  });

  it("tira o <script> inteiro", () => {
    expect(textoDoHtml(`<script>var x = "COMPRE";</script><h1>Curso</h1>`)).not.toContain("var x");
  });

  it("põe o título e a descrição na frente — é a promessa resumida pelo autor", () => {
    const html = `<title>Método X</title><meta name="description" content="Aprenda em 30 dias"><p>corpo</p>`;
    const t = textoDoHtml(html);
    expect(t.indexOf("Método X")).toBeLessThan(t.indexOf("corpo"));
    expect(t).toContain("Aprenda em 30 dias");
  });

  it("separa blocos — sem isso a headline cola na frase seguinte", () => {
    expect(textoDoHtml("<h1>COMPRE AGORA</h1><p>Só hoje</p>")).toContain("COMPRE AGORA\nSó hoje");
  });

  it("resolve as entidades que aparecem em copy brasileira", () => {
    expect(textoDoHtml("<p>R$97 &amp; frete gr&aacute;tis&nbsp;hoje</p>")).toContain("R$97 &");
  });

  it("resolve entidade no TÍTULO também — senão ela chega assim ao acervo", () => {
    // Caso real: a landing page da Bloom tem "CRM &amp; workspace" no <title>.
    const t = textoDoHtml(`<title>CRM &amp; workspace</title><p>x</p>`);
    expect(t).toContain("CRM & workspace");
    expect(t).not.toContain("&amp;");
  });

  it("corta no limite — página inteira não cabe no prompt", () => {
    const html = `<p>${"palavra ".repeat(20000)}</p>`;
    expect(textoDoHtml(html, 500).length).toBeLessThanOrEqual(500);
  });

  it("página sem texto nenhum devolve string vazia, não lixo", () => {
    expect(textoDoHtml("<style>.a{color:red}</style>").trim()).toBe("");
  });
});

describe("ehHtml", () => {
  it("aceita o mime com charset — é como o navegador manda", () => {
    expect(ehHtml("text/html; charset=utf-8")).toBe(true);
    expect(ehHtml("text/html")).toBe(true);
    expect(ehHtml("TEXT/HTML")).toBe(true);
  });

  it("recusa o resto", () => {
    for (const m of ["text/plain", "application/pdf", "image/png", null, undefined, ""]) {
      expect(ehHtml(m)).toBe(false);
    }
  });
});
