/**
 * Story 49.21 — o aviso de que o CPA por anúncio (só compradores atribuídos
 * pelo Ad ID) não se compara com o CAC do resumo (todos os compradores).
 *
 * Sobre a fixture da 49.18 (motores reais + `gerarDebriefing` com o relógio
 * fixado). Os SHA do AC4 foram medidos na `origin/main` @ `087c226d` (a base
 * do rebase, antes desta story), com o HTML INTEIRO e o payload; depois da
 * story, o HTML sem o aviso e o payload dão os MESMOS SHA.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MARCA_DA_MIDIA_POR_ANUNCIO, MARCA_DO_AVISO_CPA_CAC, renderDebriefing } from "../services/debriefing-render.js";
import { gerarDebriefing } from "../services/debriefing-generate.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { configSintetica } from "./fixtures/debriefing-payload-sintetico.js";
import { CENARIOS_DO_AC8, PARAMS_DA_MIDIA, depsDaMidia, payloadMidia, type CenarioDaMidia } from "./fixtures/debriefing-midia-anuncios-49-18.js";

const ROT = { projeto: "Expert", lancamento: "PG05", etapas: {}, funis: {} };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const RE_AVISO = new RegExp(`<div class="warn" ${MARCA_DO_AVISO_CPA_CAC}>[\\s\\S]*?</div>`, "g");

async function gerar(c: CenarioDaMidia) {
  const d = depsDaMidia(c, configSintetica());
  const r = await gerarDebriefing(d, PARAMS_DA_MIDIA);
  expect(r.status).toBe(200);
  return r.body as { html: string; payload: DebriefingPayload };
}
const final = () => payloadMidia(configSintetica());
const render = (p: DebriefingPayload, comparacao: Parameters<typeof renderDebriefing>[0]["comparacao"] = null) =>
  renderDebriefing({ payload: p, comparacao, rotulos: ROT, alertas: [] });

/** O bloco "Mídia por Anúncio" no HTML. */
function bloco(html: string): string {
  const i = html.indexOf(`<section ${MARCA_DA_MIDIA_POR_ANUNCIO}>`);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf("</section>", i) + "</section>".length);
}
/** O aviso (exatamente um) e o texto dele sem as tags. */
function aviso(html: string): { html: string; texto: string } {
  const achados = [...html.matchAll(RE_AVISO)].map((m) => m[0]);
  expect(achados).toHaveLength(1);
  return { html: achados[0]!, texto: achados[0]!.replace(/<[^>]+>/g, "") };
}

// ---------------------------------------------------------------------------
// AC1 — aviso visível logo acima da tabela do ranking
// ---------------------------------------------------------------------------

describe("AC1 — o aviso logo acima da tabela do ranking, com N de M, cada parcela e o CAC", () => {
  it("final: entre o título do ranking e a tabela, nunca no rodapé", async () => {
    const { html } = await gerar({ modo: "final", comparacao: null });
    const b = bloco(html);
    const iTitulo = b.indexOf("Ranking por nome de anúncio");
    const iAviso = b.indexOf(MARCA_DO_AVISO_CPA_CAC);
    const iTabela = b.indexOf("<table", iTitulo);
    expect(iTitulo).toBeGreaterThan(-1);
    expect(iAviso).toBeGreaterThan(iTitulo);
    expect(iTabela).toBeGreaterThan(iAviso);
    // O rodapé do ranking (tnote depois da tabela) segue sem o aviso.
    const rodape = b.slice(b.indexOf("</table>", iTabela), b.indexOf("Estático × vídeo"));
    expect(rodape).not.toContain(MARCA_DO_AVISO_CPA_CAC);
    expect(rodape).not.toContain("não se compara com o CAC");
  });

  it("o texto: CPA só pelos atribuídos, N de M, as três parcelas por extenso e o CAC por todos", async () => {
    const { texto, html: a } = aviso(bloco((await gerar({ modo: "final", comparacao: null })).html));
    expect(texto).toBe(
      "CPA por anúncio não se compara com o CAC do resumo. O CPA de cada anúncio divide o investimento dele só pelos compradores de captação atribuídos a ele pelo Ad ID do utm_content da venda. " +
        "No ranking estão 4 de 8 compradores de captação; os outros estão nas peças de escassez (2), sem Ad ID no utm_content (1) ou com Ad ID fora do ad-level de captação (1). " +
        "O CAC do resumo (R$ 28,60) divide o investimento de captação por todos os compradores de captação, então os dois números não se comparam diretamente.",
    );
    expect(a).toContain("<b data-n-de-m>4 de 8</b>");
    expect(a).toContain("<b data-cac>R$ 28,60</b>");
  });

  it("parcial: os números do corte (3 de 7, CAC do parcial)", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "parcial", comparacao: null })).html));
    expect(texto).toContain("No ranking estão 3 de 7 compradores de captação");
    expect(texto).toContain("O CAC do resumo (R$ 32,52)");
  });

  it("sem ad-level: sem ranking, sem aviso (o bloco é a lacuna)", async () => {
    const { html } = await gerar({ modo: "final", comparacao: null, semAdLevel: true });
    expect(html).not.toContain(MARCA_DO_AVISO_CPA_CAC);
  });
});

// ---------------------------------------------------------------------------
// AC2 — números do payload, nunca recalculados; sem o dado, diz o que falta
// ---------------------------------------------------------------------------

describe("AC2 — todo número do aviso sai do payload; sem CAC ou sem atribuição, diz o que falta", () => {
  it("render a partir do payload completo: N, M, cada parcela e o CAC trocados no payload aparecem no aviso", () => {
    const p = final();
    p.publico.midiaPorAnuncio!.atribuicao = { compradores: 215, noRanking: 90, naEscassez: 14, adIdForaDoAdLevel: 3, semAdId: 108, memoria: "x" };
    p.dinheiroTempo.cac = { ...p.dinheiroTempo.cac!, valor: 46.09 };
    const { texto, html: a } = aviso(render(p));
    expect(a).toContain("<b data-n-de-m>90 de 215</b>");
    expect(texto).toContain("os outros estão nas peças de escassez (14), sem Ad ID no utm_content (108) ou com Ad ID fora do ad-level de captação (3).");
    expect(a).toContain("<b data-cac>R$ 46,09</b>");
    // Os números não vêm do ranking: a soma das linhas é outra.
    const somaDoRanking = p.publico.midiaPorAnuncio!.ranking.reduce((s, l) => s + l.compradores, 0);
    expect(somaDoRanking).not.toBe(90);
  });

  it("sem CAC no payload (relatório anterior ao resumo macro): diz que falta, sem número", () => {
    const p = final();
    delete p.dinheiroTempo.cac;
    const { texto, html: a } = aviso(render(p));
    expect(a).not.toContain("data-cac");
    expect(texto).toContain("O CAC do resumo divide o investimento de captação por todos os compradores de captação");
    expect(texto).toContain("O CAC não está neste relatório (gerado antes do resumo macro).");
    expect(texto).not.toMatch(/CAC do resumo \(R\$/);
  });

  it("CAC nulo com motivo: o motivo do payload, sem número", () => {
    const p = final();
    p.dinheiroTempo.cac = { ...p.dinheiroTempo.cac!, valor: null, motivo: "SEM_COMPRADORES_DE_CAPTACAO: compradores de captação = 0" };
    const { texto, html: a } = aviso(render(p));
    expect(a).not.toContain("data-cac");
    expect(texto).toContain("O CAC não foi calculado: SEM_COMPRADORES_DE_CAPTACAO: compradores de captação = 0.");
  });

  it("vendas sem utm_content: nenhum atribuído, CPA não medido — sem N de M inventado", () => {
    const p = final();
    p.publico.midiaPorAnuncio!.vendasComConteudo = false;
    const { texto, html: a } = aviso(render(p));
    expect(a).not.toContain("data-n-de-m");
    expect(texto).toContain("As planilhas de venda não trazem utm_content: nenhum dos 8 compradores de captação foi atribuído a anúncio, e o CPA por anúncio não foi medido.");
  });
});

// ---------------------------------------------------------------------------
// AC3 — a comparação principal
// ---------------------------------------------------------------------------

describe("AC3 — o N de M da comparação principal, ou \"—\" com nota", () => {
  it("final, comparação recalculada: o N de M dela", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "final", comparacao: "recalculada" })).html));
    expect(texto).toContain("Comparação, PG04: 2 de 6 compradores de captação no ranking.");
  });

  it("parcial, comparação recalculada: com o rótulo do mesmo D+N", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "parcial", comparacao: "recalculada" })).html));
    expect(texto).toContain("Comparação, PG04 (mesmo D+N: até 21/04/26 (D+4 dele)): 2 de 6 compradores de captação no ranking.");
  });

  it("o N de M da comparação sai do payload DELA", () => {
    const atual = final();
    const comp = payloadMidia({ ...configSintetica(), funnelId: "fb" }, { lado: "comparacao" });
    comp.publico.midiaPorAnuncio!.atribuicao = { ...comp.publico.midiaPorAnuncio!.atribuicao, compradores: 300, noRanking: 120 };
    const { html: a } = aviso(render(atual, { funnelId: "fb", nome: "PG02", payload: comp, origem: { tipo: "recalculada" } }));
    expect(a).toContain("<b data-n-de-m>4 de 8</b>");
    expect(a).toContain("Comparação, PG02: <b data-n-de-m-comparacao>120 de 300</b>");
  });

  it("relatório salvo antes da 49.18: \"—\" com o motivo", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "final", comparacao: "salva-antiga" })).html));
    expect(texto).toContain("Comparação, PG04: — (o relatório de PG04 usado na comparação foi gerado antes da mídia por anúncio existir (não traz o dado)).");
  });

  it("parcial com comparação só de relatório salvo: \"—\" com a nota do mesmo D+N", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "parcial", comparacao: "salva-antiga" })).html));
    expect(texto).toContain("Comparação, PG04: — (sem comparação no mesmo D+N: só tem relatório salvo, com os totais fechados).");
  });

  it("comparação sem ad-level ou sem utm_content: \"—\" com o motivo", () => {
    const atual = final();
    const semAd = payloadMidia({ ...configSintetica(), funnelId: "fb" }, { lado: "comparacao", semAdLevel: true });
    const t1 = aviso(render(atual, { funnelId: "fb", nome: "PG02", payload: semAd, origem: { tipo: "recalculada" } })).texto;
    expect(t1).toContain("Comparação, PG02: — (PG02 não tem ad-level no banco para o período (meta_ad_insights_daily)).");
    const semCont = payloadMidia({ ...configSintetica(), funnelId: "fb" }, { lado: "comparacao" });
    semCont.publico.midiaPorAnuncio!.vendasComConteudo = false;
    const t2 = aviso(render(atual, { funnelId: "fb", nome: "PG02", payload: semCont, origem: { tipo: "recalculada" } })).texto;
    expect(t2).toContain("Comparação, PG02: — (as planilhas de venda de PG02 não trazem utm_content — nenhum comprador atribuído a anúncio).");
  });

  it("sem comparação: o aviso não fala de comparação", async () => {
    const { texto } = aviso(bloco((await gerar({ modo: "final", comparacao: null })).html));
    expect(texto).not.toContain("Comparação");
  });
});

// ---------------------------------------------------------------------------
// AC4 — nada muda fora do aviso
// ---------------------------------------------------------------------------

/**
 * SHA do HTML INTEIRO e do payload na `origin/main` @ `087c226d` (antes da
 * story), pelo `gerarDebriefing` sobre a fixture da 49.18 com o relógio fixado.
 * Remedidos no rebase: na `493df285` os 14 eram outros porque a 49.19
 * acrescentou ao payload `publico.testeDeLp` e a 49.20
 * `publico.recompraPorOrigem` e `resumoMacro.pesquisaPorPergunta` (só campos
 * novos; nenhum campo antigo mudou), e ao HTML os blocos deles. A fatia C da
 * 49.17 não muda nada nesta fixture (não há testes pré-lançamento nela).
 */
const SHA_DO_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "91009048a51e6ea5d849253a4bd1270297d8344c5c6c62c139614529f9175749", payload: "42e13e92af8fdf72e251e6abf57077e2dedef3c2e31caff860cb6f006da483b3" },
  "final-comparacao-recalculada": { html: "f849833a02899893e8896ad1df596516ad7ad89436e561e308c09a63081860a7", payload: "7d643fb79bb273ffb8749ec91b1e5da9ad37be4a00cc6820f3b91042c2247835" },
  "final-comparacao-salva-antiga": { html: "c9259f290489773bbcc6860dc0d973db7cd84cf9de0c99dc21e22c10e7268f42", payload: "4bb763d5c4261798f9ecca86ebcffeb91cf362c610b33da206aacaaf296a7f49" },
  "parcial-edicao-unica": { html: "e9b10175bdd53a5bd992336f3ab87df4e7094b30db0792622899ed57ab915e96", payload: "d087c2a01dcca144ffa868483f4472e848724c6ee381c65ad7e9bad969467c08" },
  "parcial-comparacao-recalculada": { html: "d4295186729fb5741139ffdb08f2475234c0c8edee0cbb412b4aa0dde22eca31", payload: "c1da247dc3797d76437f5bc349805290d167b1d8fc5f76f23b209fefe8ca1282" },
  "parcial-comparacao-salva": { html: "33d8fddce9fb3a2dfc3656c876d8279a6fbcc2399c8492c62b1b4397202849db", payload: "137ef4e92ad57a9a1f2bedf896e270a878aed2f07e1cf8d691a192f1ef6c90f7" },
  "final-sem-ad-level": { html: "1631e7efccc42438d6b1e0d5bc30d5b90d10f784e57dd5c71db38afe3f576b48", payload: "b2540cc7c89489557013b7effff2d570ab64f4e89999eef33882ab663a77bee0" },
};

describe("AC4 — o HTML sem o aviso e o payload saem idênticos aos da base", () => {
  it.each(Object.keys(CENARIOS_DO_AC8))("%s", async (nome) => {
    const { html, payload } = await gerar(CENARIOS_DO_AC8[nome]!);
    const comAviso = nome !== "final-sem-ad-level";
    if (comAviso) expect(sha(html)).not.toBe(SHA_DO_BASE[nome]!.html);
    expect(sha(html.replace(RE_AVISO, ""))).toBe(SHA_DO_BASE[nome]!.html);
    expect(sha(JSON.stringify(payload))).toBe(SHA_DO_BASE[nome]!.payload);
  });
});
