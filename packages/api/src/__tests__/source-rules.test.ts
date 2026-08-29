import { describe, expect, it } from "vitest";
import {
  agruparOrfaos,
  agruparParaClassificar,
  diagnosticar,
  montarOrigem,
  origemPorRegra,
  regraCasa,
  tipoDeTrafego,
  type RegraDeOrigem,
} from "../services/source-rules.js";

const regra = (p: Partial<RegraDeOrigem>): RegraDeOrigem => ({
  id: "r", campo: "utm_medium", operador: "igual", valor: "", origem: "organic_x",
  ordem: 0, ativa: true, ...p,
});

describe("regraCasa", () => {
  it("compara sem caixa e sem espaço — planilha preenchida à mão", () => {
    const r = regra({ operador: "igual", valor: "Instagram" });
    for (const v of ["instagram", " Instagram ", "INSTAGRAM"]) {
      expect(regraCasa(r, { utm_medium: v })).toBe(true);
    }
  });

  it("`vazio` casa a ausência, e só ela", () => {
    const r = regra({ operador: "vazio" });
    expect(regraCasa(r, { utm_medium: "" })).toBe(true);
    expect(regraCasa(r, { utm_medium: "   " })).toBe(true);
    expect(regraCasa(r, {})).toBe(true);
    expect(regraCasa(r, { utm_medium: "stories" })).toBe(false);
  });

  it("`contem` e `comeca_com` com valor vazio não casam tudo", () => {
    // Sem isto, uma regra salva pela metade classificaria a base inteira.
    expect(regraCasa(regra({ operador: "contem", valor: "" }), { utm_medium: "x" })).toBe(false);
    expect(regraCasa(regra({ operador: "comeca_com", valor: "" }), { utm_medium: "x" })).toBe(false);
  });
});

describe("origemPorRegra", () => {
  it("vence a de MENOR ordem quando duas casam", () => {
    const regras = [
      regra({ id: "b", ordem: 5, operador: "contem", valor: "insta", origem: "organic_instagram" }),
      regra({ id: "a", ordem: 1, operador: "contem", valor: "insta", origem: "paid_instagram" }),
    ];
    expect(origemPorRegra(regras, { utm_medium: "instagram-stories" })).toEqual({
      origem: "paid_instagram", regraId: "a",
    });
  });

  it("ignora regra inativa", () => {
    const regras = [regra({ id: "a", ativa: false, operador: "vazio", origem: "organic_x" })];
    expect(origemPorRegra(regras, { utm_medium: "" })).toBeNull();
  });
});

describe("tipoDeTrafego", () => {
  it("classifica pelo prefixo", () => {
    expect(tipoDeTrafego("paid_metaads")).toBe("pago");
    expect(tipoDeTrafego("organic_instagram")).toBe("organico");
  });

  it("origem fora do padrão é INDEFINIDO, não orgânico", () => {
    // Chutar orgânico aqui inflaria o orgânico com tudo que fugir da convenção.
    expect(tipoDeTrafego("instagram")).toBe("indefinido");
    expect(tipoDeTrafego("")).toBe("indefinido");
    expect(tipoDeTrafego(null)).toBe("indefinido");
  });
});

describe("montarOrigem", () => {
  it("aplica o prefixo e normaliza o canal", () => {
    expect(montarOrigem("pago", "Meta Ads")).toBe("paid_meta_ads");
    expect(montarOrigem("organico", " Instagram ")).toBe("organic_instagram");
    expect(montarOrigem("organico", "E-mail")).toBe("organic_e_mail");
  });

  it("tira acento — senão vira uma categoria nova e silenciosa", () => {
    expect(montarOrigem("organico", "orgânico")).toBe("organic_organico");
  });
});

describe("diagnosticar", () => {
  const linhas = [
    { utm_source: "paid_metaads", utm_medium: "feed" },
    { utm_source: "organic_instagram", utm_medium: "bio" },
    { utm_source: "", utm_medium: "stories" },
    { utm_source: "", utm_medium: "stories" },
    { utm_source: "", utm_medium: "" },
    { utm_source: "instagram", utm_medium: "x" },
  ];

  it("sem regra: separa quem tem de quem não tem", () => {
    const d = diagnosticar(linhas, "utm_source", []);
    expect(d).toMatchObject({ total: 6, comOrigem: 3, semOrigem: 3, recuperadas: 0 });
    // "instagram" não segue a convenção: conta como indefinido, não orgânico.
    expect(d).toMatchObject({ pago: 1, organico: 1, indefinido: 1 });
  });

  it("com regra: recuperadas ficam SEPARADAS de comOrigem", () => {
    // Juntar as duas esconderia quanto do número depende de regra escrita à mão.
    const d = diagnosticar(linhas, "utm_source", [
      regra({ id: "a", operador: "igual", valor: "stories", origem: "organic_instagram" }),
    ]);
    expect(d).toMatchObject({ comOrigem: 3, recuperadas: 2, semOrigem: 1 });
    expect(d.organico).toBe(3);
  });
});

describe("agruparOrfaos", () => {
  const linhas = [
    { utm_source: "paid_x", utm_medium: "feed", email: "a@x.com" },
    { utm_source: "", utm_medium: "stories", email: "b@x.com" },
    { utm_source: "", utm_medium: "Stories", email: "c@x.com" },
    { utm_source: "", utm_medium: "", email: "d@x.com" },
  ];

  it("agrupa só os órfãos, maior primeiro, e junta variações de caixa", () => {
    const g = agruparOrfaos(linhas, "utm_source", "utm_medium", []);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ quantidade: 2, label: "stories" });
    expect(g[1]).toMatchObject({ quantidade: 1, label: "(em branco)" });
    expect(g[0].exemplos).toEqual(["b@x.com", "c@x.com"]);
  });

  it("linha já resolvida por regra sai do grupo de órfãos", () => {
    const g = agruparOrfaos(linhas, "utm_source", "utm_medium", [
      regra({ id: "a", operador: "igual", valor: "stories", origem: "organic_ig" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("(em branco)");
  });
});

describe("agruparParaClassificar", () => {
  // A base real: origens preenchidas que não dizem se são pagas ou orgânicas,
  // e o mesmo canal escrito de duas formas.
  const linhas = [
    { utm_source: "meta" },
    { utm_source: "meta" },
    { utm_source: "whatsapp" },
    { utm_source: "WhatsApp" },
    { utm_source: "paid_metaads" },
    { utm_source: "" },
  ];

  it("junta grafias do mesmo canal e usa a mais frequente como rótulo", () => {
    const g = agruparParaClassificar(linhas, "utm_source", []);
    const wpp = g.find((x) => x.valor === "whatsapp")!;
    expect(wpp.quantidade).toBe(2);
    expect(wpp.variacoes).toEqual(["whatsapp", "WhatsApp"]);
  });

  it("ignora quem já está classificado e quem não tem origem", () => {
    const g = agruparParaClassificar(linhas, "utm_source", []);
    expect(g.map((x) => x.valor).sort()).toEqual(["meta", "whatsapp"]);
  });

  it("origem vinda de regra também entra se não classificar", () => {
    const g = agruparParaClassificar(linhas, "utm_source", [
      regra({ id: "a", campo: "utm_source", operador: "vazio", origem: "indicacao" }),
    ]);
    expect(g.find((x) => x.valor === "indicacao")?.quantidade).toBe(1);
  });

  it("sai da lista quando a regra dá uma origem classificada", () => {
    const g = agruparParaClassificar(linhas, "utm_source", [
      regra({ id: "a", campo: "utm_source", operador: "vazio", origem: "organic_indicacao" }),
    ]);
    expect(g.some((x) => x.valor === "organic_indicacao")).toBe(false);
  });
});
