import { describe, it, expect } from "vitest";
import {
  temperaturaDoNome,
  classificarPelaCascata,
  montarMapasDeTemperatura,
  type LinhaComHierarquia,
} from "../utils/temperatura-de-publico.js";
import { classifyTemperatura } from "../utils/lead-origin.js";

/** Nomes REAIS de produção (`meta_ad_insights_daily`, 2026-08-25). */
const CAMPANHA_FRIA =
  "dg-pg04-ago-26--vendas-captacao--2026-07-09--cold--cbo--videos--lote00--lpa";
const ANUNCIO_SEM_TEMPERATURA =
  "ad21-dg-pg04-jul26--delegue-60_-da-sua-produção";
const CONJUNTO_SEM_TEMPERATURA = "00_FD-ST_INTERESSES|adv10";

const linha = (p: Partial<LinhaComHierarquia>): LinhaComHierarquia => ({
  adId: "ad1", adName: null, adsetId: "as1", adsetName: null,
  campaignId: "c1", campaignName: null, ...p,
});

describe("temperaturaDoNome", () => {
  it("reconhece cold e frio", () => {
    expect(temperaturaDoNome(CAMPANHA_FRIA)).toBe("frio");
    expect(temperaturaDoNome("campanha-FRIO-01")).toBe("frio");
  });

  it("reconhece hot e quente", () => {
    expect(temperaturaDoNome("bbe--hot--remarketing")).toBe("quente");
    expect(temperaturaDoNome("publico QUENTE")).toBe("quente");
  });

  it("nome sem termo não é classificado", () => {
    expect(temperaturaDoNome(ANUNCIO_SEM_TEMPERATURA)).toBeNull();
    expect(temperaturaDoNome(CONJUNTO_SEM_TEMPERATURA)).toBeNull();
    expect(temperaturaDoNome(null)).toBeNull();
    expect(temperaturaDoNome("")).toBeNull();
  });

  it("concorda com `classifyTemperatura`, que classifica a VENDA", () => {
    // As duas telas precisam dizer a mesma coisa sobre a mesma palavra. Se a
    // convenção mudar num lado e não no outro, a tabela por público e o
    // Detalhamento passam a discordar sem que nada acuse.
    for (const termo of ["cold", "frio", "hot", "quente", "xyz", ""]) {
      const daVenda = classifyTemperatura(termo);
      const doNome = temperaturaDoNome(termo);
      const equivalente = daVenda === "quente" ? "quente" : daVenda === "frio" ? "frio" : null;
      expect(doNome).toBe(equivalente);
    }
  });
});

describe("classificarPelaCascata", () => {
  it("o nome do próprio anúncio ganha", () => {
    const c = classificarPelaCascata(linha({
      adName: "ad-hot-01", adsetName: "conj-cold", campaignName: CAMPANHA_FRIA,
    }));
    expect(c).toEqual({ temperatura: "quente", nivel: "anuncio" });
  });

  it("sem o do anúncio, vale o do conjunto", () => {
    const c = classificarPelaCascata(linha({ adsetName: "conj-hot", campaignName: CAMPANHA_FRIA }));
    expect(c).toEqual({ temperatura: "quente", nivel: "conjunto" });
  });

  it("sem os dois, vale o da campanha — o caso de 99,7% dos anúncios", () => {
    const c = classificarPelaCascata(linha({
      adName: ANUNCIO_SEM_TEMPERATURA, adsetName: CONJUNTO_SEM_TEMPERATURA,
      campaignName: CAMPANHA_FRIA,
    }));
    expect(c).toEqual({ temperatura: "frio", nivel: "campanha" });
  });

  it("nenhum nome diz nada → não classificado", () => {
    // Vira o grupo que o AC4 exige declarar. Chutar um lado aqui inventaria
    // dado — e 119 das 242 vendas do bbe não têm rastreio nenhum.
    expect(classificarPelaCascata(linha({
      adName: ANUNCIO_SEM_TEMPERATURA, adsetName: CONJUNTO_SEM_TEMPERATURA, campaignName: "bbe-geral",
    }))).toBeNull();
  });
});

describe("montarMapasDeTemperatura", () => {
  const LINHAS = [
    linha({ adId: "a1", adsetId: "s1", campaignId: "c1", campaignName: CAMPANHA_FRIA,
            adsetName: CONJUNTO_SEM_TEMPERATURA, adName: ANUNCIO_SEM_TEMPERATURA }),
    linha({ adId: "a2", adsetId: "s2", campaignId: "c2", campaignName: "bbe--hot--rmkt",
            adsetName: "conj-x", adName: "ad-y" }),
    linha({ adId: "a3", adsetId: "s3", campaignId: "c3", campaignName: "campanha-neutra",
            adsetName: "conj-z", adName: "ad-w" }),
  ];

  it("o anúncio herda a campanha", () => {
    const m = montarMapasDeTemperatura(LINHAS);
    expect(m.ad.a1).toEqual({ temperatura: "frio", nivel: "campanha" });
    expect(m.ad.a2).toEqual({ temperatura: "quente", nivel: "campanha" });
  });

  it("o conjunto também herda a campanha", () => {
    const m = montarMapasDeTemperatura(LINHAS);
    expect(m.adset.s1).toEqual({ temperatura: "frio", nivel: "campanha" });
  });

  it("a campanha NÃO herda de baixo", () => {
    // A cascata só desce. Um conjunto frio dentro de uma campanha sem termo não
    // torna a campanha inteira fria — o conjunto é parte dela, não o contrário.
    const m = montarMapasDeTemperatura([
      linha({ adId: "a9", adsetId: "s9", campaignId: "c9",
              campaignName: "campanha-sem-termo", adsetName: "conj-cold-01" }),
    ]);
    expect(m.adset.s9).toEqual({ temperatura: "frio", nivel: "conjunto" });
    expect(m.campaign.c9).toBeUndefined();
  });

  it("o que não é classificável fica FORA dos mapas", () => {
    const m = montarMapasDeTemperatura(LINHAS);
    expect(m.ad.a3).toBeUndefined();
    expect(m.campaign.c3).toBeUndefined();
  });

  it("os três níveis são preenchidos", () => {
    const m = montarMapasDeTemperatura(LINHAS);
    expect(Object.keys(m.campaign).sort()).toEqual(["c1", "c2"]);
    expect(Object.keys(m.adset).sort()).toEqual(["s1", "s2"]);
    expect(Object.keys(m.ad).sort()).toEqual(["a1", "a2"]);
  });
});
