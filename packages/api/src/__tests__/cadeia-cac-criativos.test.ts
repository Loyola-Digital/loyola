import { describe, it, expect } from "vitest";
import {
  agruparCriativos,
  distribuicaoDoHook,
  normalizarNomeDeCriativo,
  type CriativoBruto,
} from "@loyola-x/shared";

/**
 * Story 44.11 — o bloco de criativos.
 *
 * O que estes testes travam não é aritmética: é a regra de que **taxa de grupo
 * se re-deriva dos somatórios**, e a de que ausência de vídeo é ausência, não
 * zero. As duas já foram violadas antes neste produto.
 */

const cru = (over: Partial<CriativoBruto> & { adId: string }): CriativoBruto => ({
  adName: "Criativo A",
  spend: 100,
  impressions: 1000,
  linkClicks: 20,
  views3s: null,
  p75: null,
  ...over,
});

describe("agruparCriativos — taxas re-derivadas, nunca média de médias", () => {
  it("um Ad ID pequeno com taxa absurda NÃO arrasta o CTR do grupo", () => {
    // O caso que a regra existe para impedir. Ad pequeno com CTR de 50%,
    // ad grande com 1%. Média de médias daria 25,5%; a resposta certa é
    // 1.005 / 101.000 = ~0,995%.
    const r = agruparCriativos([
      cru({ adId: "a1", impressions: 100_000, linkClicks: 1_000 }),
      cru({ adId: "a2", impressions: 1_000, linkClicks: 500 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].ctr).toBeCloseTo(1_500 / 101_000, 9);
    // E longe da média de médias (25,5%).
    expect(r[0].ctr!).toBeLessThan(0.02);
  });

  it("CPC do grupo é Σ spend ÷ Σ cliques", () => {
    const r = agruparCriativos([
      cru({ adId: "a1", spend: 300, linkClicks: 100 }),
      cru({ adId: "a2", spend: 100, linkClicks: 300 }),
    ]);
    expect(r[0].cpc).toBeCloseTo(400 / 400, 9);
  });

  it("agrupa cópias da Meta sob o mesmo nome, e lista os ids", () => {
    const r = agruparCriativos([
      cru({ adId: "a1", adName: "Vídeo Depoimento" }),
      cru({ adId: "a2", adName: "Vídeo Depoimento - Copy" }),
      cru({ adId: "a3", adName: "Vídeo Depoimento — Cópia 2" }),
      cru({ adId: "a4", adName: "Vídeo Depoimento (1)" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("Vídeo Depoimento");
    expect(r[0].adIds.sort()).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("ordena por investimento — onde o dinheiro está", () => {
    const r = agruparCriativos([
      cru({ adId: "a1", adName: "Barato", spend: 10 }),
      cru({ adId: "a2", adName: "Caro", spend: 900 }),
      cru({ adId: "a3", adName: "Médio", spend: 100 }),
    ]);
    expect(r.map((x) => x.nome)).toEqual(["Caro", "Médio", "Barato"]);
  });
});

describe("agruparCriativos — vídeo ausente é ausência, não zero", () => {
  it("criativo de imagem devolve Hook e Hold `null`, jamais 0", () => {
    // ⚠️ `0` afirmaria "é vídeo e ninguém passou de 3 segundos" — que é um
    // criativo péssimo, não um criativo que não é vídeo. A tela esconde a
    // coluna no primeiro caso e mostra zero no segundo.
    const r = agruparCriativos([cru({ adId: "a1", views3s: null, p75: null })]);
    expect(r[0].hookRate).toBeNull();
    expect(r[0].holdRate).toBeNull();
  });

  it("vídeo que ninguém assistiu devolve 0, não `null`", () => {
    const r = agruparCriativos([cru({ adId: "a1", views3s: 0, p75: 0 })]);
    expect(r[0].hookRate).toBe(0);
    expect(r[0].holdRate).toBeNull(); // 0 ÷ 0 não é zero, é indefinido
  });

  it("grupo MISTO usa só as impressões dos ids de vídeo no denominador do Hook", () => {
    // Um nome com um vídeo e uma imagem. Somar a impressão da imagem no
    // denominador afundaria o Hook de um vídeo bom — o criativo pareceria
    // ruim por causa de um irmão que nem é vídeo.
    const r = agruparCriativos([
      cru({ adId: "video", impressions: 1_000, views3s: 300, p75: 150 }),
      cru({ adId: "imagem", impressions: 9_000, views3s: null, p75: null }),
    ]);
    expect(r[0].hookRate).toBeCloseTo(300 / 1_000, 9); // não 300/10.000
    expect(r[0].holdRate).toBeCloseTo(150 / 300, 9);
    // Mas o investimento e as impressões do GRUPO somam os dois.
    expect(r[0].impressions).toBe(10_000);
  });
});

describe("agruparCriativos — nome que não resolve", () => {
  it("sem `adName`, o id vira o nome e é declarado como id", () => {
    const r = agruparCriativos([cru({ adId: "1207", adName: null })]);
    expect(r[0].nome).toBe("1207");
    expect(r[0].ehId).toBe(true);
  });

  it("ids sem nome NÃO se agrupam entre si", () => {
    // Dois anúncios diferentes sem nome são dois anúncios, não um grupo.
    const r = agruparCriativos([cru({ adId: "1", adName: null }), cru({ adId: "2", adName: null })]);
    expect(r).toHaveLength(2);
  });
});

describe("distribuicaoDoHook — a AC4, que é onde está o valor", () => {
  const comHook = (nome: string, hook: number): CriativoBruto =>
    cru({ adId: nome, adName: nome, impressions: 1_000, views3s: hook * 1_000, p75: 0 });

  it("distingue duas etapas que a MÉDIA deixaria idênticas", () => {
    /**
     * O caso que motiva a AC. As duas têm média 25%:
     *   homogênea — todos em 25%: o problema é a oferta
     *   polarizada — metade em 45%, metade em 5%: mate metade dos criativos
     * As ações são opostas, e uma média sozinha não distingue.
     */
    const homogenea = distribuicaoDoHook(
      agruparCriativos([comHook("a", 0.25), comHook("b", 0.25), comHook("c", 0.25), comHook("d", 0.25)]),
    )!;
    const polarizada = distribuicaoDoHook(
      agruparCriativos([comHook("a", 0.45), comHook("b", 0.45), comHook("c", 0.05), comHook("d", 0.05)]),
    )!;

    expect(homogenea.abaixoDeMetadeDaMediana).toBe(0);
    expect(polarizada.abaixoDeMetadeDaMediana).toBe(2);
    expect(polarizada.melhor.valor).toBeCloseTo(0.45, 9);
    expect(polarizada.pior.valor).toBeCloseTo(0.05, 9);
  });

  it("usa MEDIANA, não média — o criativo de volume alto não decide sozinho", () => {
    // Três em 10% e um outlier em 90%. Média = 30%; mediana = 10%.
    const d = distribuicaoDoHook(
      agruparCriativos([comHook("a", 0.1), comHook("b", 0.1), comHook("c", 0.1), comHook("d", 0.9)]),
    )!;
    expect(d.mediana).toBeCloseTo(0.1, 9);
  });

  it("nomeia os extremos — sem nome, o número não vira ação", () => {
    const d = distribuicaoDoHook(agruparCriativos([comHook("Campeão", 0.6), comHook("Fraco", 0.02)]))!;
    expect(d.melhor.nome).toBe("Campeão");
    expect(d.pior.nome).toBe("Fraco");
  });

  it("etapa sem nenhum vídeo devolve `null`, não uma distribuição vazia", () => {
    expect(distribuicaoDoHook(agruparCriativos([cru({ adId: "a1" })]))).toBeNull();
  });

  it("conta só os criativos de vídeo", () => {
    const d = distribuicaoDoHook(
      agruparCriativos([comHook("v1", 0.3), comHook("v2", 0.2), cru({ adId: "img", adName: "Imagem" })]),
    )!;
    expect(d.criativosDeVideo).toBe(2);
  });
});

describe("normalizarNomeDeCriativo", () => {
  it("não come nome legítimo que termina em número", () => {
    // `Aula 3` é o nome do criativo, não a terceira cópia.
    expect(normalizarNomeDeCriativo("Aula 3")).toBe("Aula 3");
    expect(normalizarNomeDeCriativo("VSL 2026")).toBe("VSL 2026");
  });

  it("tira sufixo de cópia em qualquer das formas da Meta", () => {
    expect(normalizarNomeDeCriativo("X - Copy")).toBe("X");
    expect(normalizarNomeDeCriativo("X — Cópia")).toBe("X");
    expect(normalizarNomeDeCriativo("X (2)")).toBe("X");
  });
});
