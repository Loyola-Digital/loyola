/**
 * Story 18.84 — os textos da etapa de Vendas com a página pelo link do anúncio
 * (PO-03: o texto da tela é a documentação da fórmula), e o fio no gráfico e na
 * lista (componentes de `components/funnels` não são coletados — lê o fonte).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TEXTO_PAGINAS_PELO_LINK,
  descreverSemLinkDaAplicacao,
  textoAplicacoesSemLink,
  textoPaginasOrfas,
  tooltipDaPaginaDaAplicacao,
} from "@/lib/utils/aplicacoes-por-link";

const fonte = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf-8");

describe("textos da regra nova — nenhum fala do utm_term como fonte da página", () => {
  it("explicação, avisos e tooltips citam o link do anúncio", () => {
    const textos = [
      TEXTO_PAGINAS_PELO_LINK,
      textoAplicacoesSemLink(23),
      textoPaginasOrfas(["lps.danilogato.com.br/dgpg04-vendas-d"], 23),
      tooltipDaPaginaDaAplicacao({ lp: "p.com/v", lpCausa: null, adId: "120" }),
      tooltipDaPaginaDaAplicacao({ lp: null, lpCausa: "sem_anuncio" }),
    ];
    for (const t of textos) expect(t).not.toMatch(/utm_term/);
    expect(TEXTO_PAGINAS_PELO_LINK).toMatch(/utm_content → anúncio → link/);
  });

  it("série sem link: cada causa com a sua ação (PO-02)", () => {
    const t = descreverSemLinkDaAplicacao({ semAnuncio: 18, foraDoCache: 1, cacheDesatualizado: 2, semLinkNaMeta: 3 });
    expect(t).toContain("18 aplicação(ões) sem anúncio de origem");
    expect(t).toContain("1 de anúncio fora do cache de criativos");
    expect(t).toContain("2 de anúncio com cache desatualizado");
    expect(t).toContain("3 de anúncio sem link na Meta");
  });

  it("tooltip da lista: a evidência é o anúncio; a causa quando não há página", () => {
    expect(tooltipDaPaginaDaAplicacao({ lp: "p.com/v", lpCausa: null, adId: "120247" })).toContain("anúncio 120247");
    expect(tooltipDaPaginaDaAplicacao({ lp: null, lpCausa: "cache_desatualizado", adId: "9" })).toBe(
      "Sem link resolvido — anúncio 9 com cache desatualizado",
    );
  });

  it("aviso de órfã com ressalva quando há aplicação sem link", () => {
    expect(textoPaginasOrfas(["a.com/x"], 0)).not.toMatch(/Sem link resolvido/);
    expect(textoPaginasOrfas(["a.com/x"], 2)).toMatch(/Há 2 aplicações em "Sem link resolvido"/);
  });
});

describe("gráfico de aplicações — o fio", () => {
  const grafico = fonte("components/funnels/applications-daily-chart.tsx");

  it("o rótulo da série é o link (hiperlinkado) ou a sem link com as causas", () => {
    expect(grafico).toMatch(/<RotuloDaSerie form=\{f\} \/>/);
    expect(grafico).toMatch(/href=\{form\.url\}/);
    expect(grafico).toMatch(/title=\{descreverSemLinkDaAplicacao\(form\.semLink\)\}/);
  });

  it("os textos da regra nova só aparecem com a resposta nova — e os do utm_term só com a antiga", () => {
    // Mutação: mostrar o texto do utm_term com a API nova → a tela afirma uma
    // regra que deixou de valer. O gatilho dele segue `paginasVieramDoUtmTerm`,
    // que a API nova manda sempre `false`.
    expect(grafico).toMatch(/\{data\.paginasPeloLinkDoAnuncio && \(\s*<div[^>]*>\s*<p[^>]*>\{TEXTO_PAGINAS_PELO_LINK\}<\/p>/);
    expect(grafico).toMatch(/\{data\.paginasPeloLinkDoAnuncio && data\.lpsOrfas\?\.length > 0 && \(/);
    expect(grafico).toMatch(/\{!data\.paginasPeloLinkDoAnuncio && data\.lpsOrfas\?\.length > 0 && \(/);
    expect(grafico).toMatch(/\{textoAplicacoesSemLink\(data\.aplicacoesSemPagina\)\}/);
  });
});

describe("lista de aplicações — o fio", () => {
  const lista = fonte("components/funnels/applications-list-table.tsx");

  it("com a resposta nova, a coluna LP é o link pelo anúncio (PaginaPeloLink)", () => {
    expect(lista).toMatch(/\{l\.lpCausa !== undefined \? \(\s*<PaginaPeloLink linha=\{l\} \/>/);
    expect(lista).toMatch(/const titulo = tooltipDaPaginaDaAplicacao\(linha\);/);
    expect(lista).toMatch(/href=\{linha\.lpUrl\}/);
  });

  it("a paginação de 6 por página não mudou (AC3)", () => {
    expect(lista).toMatch(/const POR_PAGINA = 6;/);
  });
});
