/**
 * Story 49.21 — o aviso de que o CPA por anúncio (só compradores atribuídos
 * pelo Ad ID) não se compara com o CAC do resumo (todos os compradores).
 *
 * Sobre a fixture da 49.18 (motores reais + `gerarDebriefing` com o relógio
 * fixado). Os SHA do AC4 foram medidos na `origin/main` @ `493df285` (a 49.18
 * mergeada, antes desta story), com o HTML INTEIRO e o payload; depois da
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
 * SHA do HTML INTEIRO e do payload na `origin/main` @ `493df285` (antes da
 * story), pelo `gerarDebriefing` sobre a fixture da 49.18 com o relógio fixado.
 */
const SHA_DO_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "40f729badc29181914b081a16bf2594a66460e1f8258a3b57d2c48db29bef89b", payload: "a255bdd943cbad73aff692a3da411b3f69310283870c4b32a9bfaaec7270e40d" },
  "final-comparacao-recalculada": { html: "5ee49ca791dbfaff9506ea32faa94d4d88df53daae19dda12878335e3bc5fb18", payload: "014d71165ff1db858363ca1c421f9c015ddc01b35f5094944796b201e452a19f" },
  "final-comparacao-salva-antiga": { html: "7b1b9aa3bf879093aaa52007eeea1ea5aba51add14a8da4feb40e46f09bd9804", payload: "e53620dfd89bc7a85b5184bb1bc79a6689bc23473042b2008695a2b1221e453c" },
  "parcial-edicao-unica": { html: "c44aab80115789d7547de881b76ae0d0c1eb20b85790765c296519419147b496", payload: "3c7b0e32013da2f92d78f92894b707564431a2c1949bd25a97fb77fa52ce9630" },
  "parcial-comparacao-recalculada": { html: "d7ec947e5519db71ecfe8b21060489371c4af7393971f12989a4c089a87fffe0", payload: "a85cc987cb600e2945956908aaa593379d19ae17c3a5ed7321682b5d0891d474" },
  "parcial-comparacao-salva": { html: "ab2cfce70dcd8f2e8c568998e1a6b4c4c49359dc53cc1d6987393e739e9eb803", payload: "2b8051c8bcc397eaa13d2b1af9e9bdf0b4ea5350e376d675da9aa62688e424dc" },
  "final-sem-ad-level": { html: "613ebdab38aeea56cbfe267821fc96013cce41e5dd93229bf621a68f8638b8f9", payload: "f0dbc72fa14ade29bab4b9a90625548f3487628adb77949ff1d779faa895b78b" },
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
