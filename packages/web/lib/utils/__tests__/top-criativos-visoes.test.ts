import { describe, it, expect } from "vitest";
import {
  VISOES,
  visaoPorId,
  presetModificado,
  chipsDeFiltro,
  limparCampo,
  ehVideo,
  aplicarBuscaEMidia,
  roasDoCriativo,
  ordenarPorMetrica,
  chaveDoCriativo,
  presetEfetivo,
  type FiltrosDaGaleria,
} from "../top-criativos-visoes";
import type { AggregatedCreative } from "../top-creatives";

/**
 * Story 18.74 — a aba é um preset (ordenação + filtros + agrupamento), não só
 * uma ordenação. O que estes testes protegem é a diferença entre "não tem a
 * métrica" e "tem a métrica valendo zero": tratada errada, ela põe o criativo
 * sem dado em primeiro lugar num ranking.
 */

const base = (over: Partial<AggregatedCreative>): AggregatedCreative =>
  ({
    name: "criativo",
    ids: ["a1"],
    spend: 100,
    impressions: 1000,
    clicks: 10,
    reach: 900,
    ctr: 1,
    cpc: 10,
    clicksTotais: 10,
    views75: null,
    holdRate: null,
    cpm: null,
    linkClicks: null,
    creative: null,
    hookRate: null,
    views3s: null,
    amostraBaixa: false,
    leadsPagos: 0,
    leadsOrg: 0,
    leadsSemTrack: 0,
    cplPago: null,
    cplQualified: null,
    leadsLegacy: 0,
    salesLegacy: 0,
    roasLegacy: null,
    ...over,
  }) as AggregatedCreative;

describe("VISOES — as seis abas do relato", () => {
  it("tem exatamente as seis abas, na ordem pedida", () => {
    expect(VISOES.map((v) => v.id)).toEqual(["todos", "hook", "cpl", "roas", "ctr", "spend"]);
  });

  it("'Todos' é a única que desagrega e solta o filtro de relevância", () => {
    const todos = visaoPorId("todos").preset;
    expect(todos.agrupamento).toBe("anuncio");
    expect(todos.incluirBaixoGasto).toBe(true);
    for (const v of VISOES.filter((v) => v.id !== "todos")) {
      expect(v.preset.agrupamento).toBe("nome");
      expect(v.preset.incluirBaixoGasto).toBe(false);
    }
  });

  it("id desconhecido cai em CPL — a visão default de antes da story", () => {
    expect(visaoPorId("inexistente").id).toBe("cpl");
  });
});

describe("presetModificado — a aba fica marcada, não é reescrita", () => {
  const preset = visaoPorId("cpl").preset;

  it("preset intocado não é modificado", () => {
    expect(presetModificado({ ...preset }, preset)).toBe(false);
  });

  it("qualquer campo alterado marca a aba", () => {
    expect(presetModificado({ ...preset, busca: "promo" }, preset)).toBe(true);
    expect(presetModificado({ ...preset, tipoDeMidia: "video" }, preset)).toBe(true);
    expect(presetModificado({ ...preset, agrupamento: "anuncio" }, preset)).toBe(true);
    expect(presetModificado({ ...preset, incluirBaixoGasto: true }, preset)).toBe(true);
    expect(presetModificado({ ...preset, metrica: "spend" }, preset)).toBe(true);
  });

  it("espaço em branco na busca não marca a aba", () => {
    expect(presetModificado({ ...preset, busca: "   " }, preset)).toBe(false);
  });
});

describe("chipsDeFiltro — o chip diz o valor, não só o nome", () => {
  const f: FiltrosDaGaleria = visaoPorId("cpl").preset;

  it("sem filtro ativo, nenhum chip", () => {
    expect(chipsDeFiltro(f)).toHaveLength(0);
  });

  it("busca vira chip com o termo", () => {
    expect(chipsDeFiltro({ ...f, busca: "promo" })[0].texto).toBe("Busca: promo");
  });

  it("a aba Todos mostra os dois chips que explicam por que ela traz mais cards", () => {
    const chips = chipsDeFiltro(visaoPorId("todos").preset);
    expect(chips.map((c) => c.campo).sort()).toEqual(["agrupamento", "incluirBaixoGasto"]);
  });

  it("limparCampo devolve o campo ao padrão da galeria", () => {
    expect(limparCampo({ ...f, busca: "x" }, "busca").busca).toBe("");
    expect(limparCampo({ ...f, tipoDeMidia: "video" }, "tipoDeMidia").tipoDeMidia).toBe("todos");
    expect(limparCampo({ ...f, agrupamento: "anuncio" }, "agrupamento").agrupamento).toBe("nome");
  });
});

describe("ehVideo — ausente não é estático", () => {
  it("VIDEO no objectType é vídeo", () => {
    expect(ehVideo("VIDEO")).toBe(true);
    expect(ehVideo("video")).toBe(true);
  });

  it("outro valor é estático", () => {
    expect(ehVideo("SHARE")).toBe(false);
    expect(ehVideo("PHOTO")).toBe(false);
  });

  it("ausente é indefinido — nem vídeo nem estático", () => {
    // Contar ausente como estático encheria o filtro de criativos que ninguém
    // classificou, e o gestor leria isso como "temos muito estático".
    expect(ehVideo(null)).toBeNull();
    expect(ehVideo(undefined)).toBeNull();
    expect(ehVideo("")).toBeNull();
  });
});

describe("aplicarBuscaEMidia", () => {
  const lista = [
    { name: "Promo Verão", creative: { objectType: "VIDEO" } },
    { name: "Institucional", creative: { objectType: "SHARE" } },
    { name: "Promo Inverno", creative: null },
  ];

  it("busca é substring, sem diferenciar maiúscula", () => {
    const f = { ...visaoPorId("cpl").preset, busca: "promo" };
    expect(aplicarBuscaEMidia(lista, f).map((c) => c.name)).toEqual(["Promo Verão", "Promo Inverno"]);
  });

  it("filtro de vídeo exclui quem não tem objectType", () => {
    const f = { ...visaoPorId("cpl").preset, tipoDeMidia: "video" as const };
    expect(aplicarBuscaEMidia(lista, f).map((c) => c.name)).toEqual(["Promo Verão"]);
  });

  it("filtro de estático exclui vídeo E indefinido", () => {
    const f = { ...visaoPorId("cpl").preset, tipoDeMidia: "estatico" as const };
    expect(aplicarBuscaEMidia(lista, f).map((c) => c.name)).toEqual(["Institucional"]);
  });
});

describe("roasDoCriativo — investimento zero não vai para o topo", () => {
  it("divide faturamento por investimento", () => {
    expect(roasDoCriativo(500, 100)).toBe(5);
  });

  it("investimento zero devolve null, não Infinity", () => {
    // Sem isto, o criativo com R$ 0 de gasto lidera o ranking de ROAS — o
    // oposto do que a aba promete.
    expect(roasDoCriativo(500, 0)).toBeNull();
  });

  it("faturamento zero com gasto positivo É ROAS zero, e entra no ranking", () => {
    expect(roasDoCriativo(0, 100)).toBe(0);
  });

  it("faturamento ausente devolve null — não medimos ≠ não vendeu", () => {
    expect(roasDoCriativo(null, 100)).toBeNull();
  });
});

describe("ordenarPorMetrica — ausência vai para o fim, nunca para o topo", () => {
  it("menor CPL primeiro, e quem não tem CPL fica por último", () => {
    const r = ordenarPorMetrica(
      [
        base({ name: "sem", cplPago: null }),
        base({ name: "caro", cplPago: 30 }),
        base({ name: "barato", cplPago: 10 }),
      ],
      "cpl",
    );
    expect(r.map((c) => c.name)).toEqual(["barato", "caro", "sem"]);
  });

  it("maior ROAS primeiro, e quem não tem ROAS fica por último", () => {
    const roas = new Map<string, number | null>([
      ["alto", 5],
      ["baixo", 1],
      ["sem", null],
    ]);
    const r = ordenarPorMetrica(
      [base({ name: "sem" }), base({ name: "baixo" }), base({ name: "alto" })],
      "roas",
      roas,
    );
    expect(r.map((c) => c.name)).toEqual(["alto", "baixo", "sem"]);
  });

  it("ROAS zero fica ACIMA de ROAS ausente", () => {
    // A diferença que este teste protege: 0 é medição, null é ausência.
    const roas = new Map<string, number | null>([["zerado", 0], ["sem", null]]);
    const r = ordenarPorMetrica([base({ name: "sem" }), base({ name: "zerado" })], "roas", roas);
    expect(r.map((c) => c.name)).toEqual(["zerado", "sem"]);
  });

  it("não muta a lista original", () => {
    const lista = [base({ name: "b", spend: 1 }), base({ name: "a", spend: 9 })];
    ordenarPorMetrica(lista, "spend");
    expect(lista.map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("chaveDoCriativo — achado do gate de QA (18.74)", () => {
  it("por nome, a chave é o nome", () => {
    expect(chaveDoCriativo({ name: "Promo", ids: ["ad1"] }, "nome")).toBe("Promo");
  });

  it("por anúncio, a chave é o ad_id — dois cards do MESMO nome não colidem", () => {
    // Este é o defeito que o gate pegou: na visão "Todos", dois anúncios com o
    // mesmo Ad Name liam o mesmo valor de um mapa chaveado por nome, e os dois
    // mostravam o ROAS de um anúncio que não era o deles.
    const a = chaveDoCriativo({ name: "Promo", ids: ["ad1"] }, "anuncio");
    const b = chaveDoCriativo({ name: "Promo", ids: ["ad2"] }, "anuncio");
    expect(a).not.toBe(b);
  });

  it("sem ad_id, cai no nome em vez de virar undefined", () => {
    expect(chaveDoCriativo({ name: "Promo", ids: [] }, "anuncio")).toBe("Promo");
  });
});

describe("ordenarPorMetrica por ROAS na visão por anúncio", () => {
  it("cada anúncio lê o SEU ROAS, mesmo com nomes iguais", () => {
    const lista = [
      base({ name: "Promo", ids: ["ad1"] }),
      base({ name: "Promo", ids: ["ad2"] }),
    ];
    const porChave = new Map<string, number | null>([
      ["ad1", 1],
      ["ad2", 9],
    ]);
    const r = ordenarPorMetrica(lista, "roas", porChave, "anuncio");
    // O de ROAS 9 vem primeiro. Com o mapa por nome, a ordem seria arbitrária
    // e os dois leriam o mesmo valor.
    expect(r[0].ids[0]).toBe("ad2");
    expect(r[1].ids[0]).toBe("ad1");
  });

  it("no agrupamento por nome, continua lendo por nome", () => {
    const lista = [base({ name: "A", ids: ["ad1"] }), base({ name: "B", ids: ["ad2"] })];
    const porChave = new Map<string, number | null>([["A", 1], ["B", 9]]);
    expect(ordenarPorMetrica(lista, "roas", porChave, "nome")[0].name).toBe("B");
  });
});

describe("presetEfetivo — o Perpétuo não nasce com a aba marcada", () => {
  it("absorve o default de mostrar baixo gasto", () => {
    const cpl = visaoPorId("cpl");
    expect(presetEfetivo(cpl, true).incluirBaixoGasto).toBe(true);
    expect(presetEfetivo(cpl, false).incluirBaixoGasto).toBe(false);
  });

  it("com o default ligado, o estado inicial NÃO conta como modificado", () => {
    // Sem isto, o `•` de "você mexeu aqui" apareceria no primeiro render de
    // todo funil perpétuo — e viraria enfeite permanente.
    const cpl = visaoPorId("cpl");
    const inicial = presetEfetivo(cpl, true);
    expect(presetModificado(inicial, presetEfetivo(cpl, true))).toBe(false);
  });

  it("a aba Todos não perde o que já tinha", () => {
    expect(presetEfetivo(visaoPorId("todos"), false).incluirBaixoGasto).toBe(true);
  });
});
