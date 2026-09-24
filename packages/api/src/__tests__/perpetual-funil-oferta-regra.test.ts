/**
 * Story 29.79 (AC2/AC3/AC5) — a regra pura: precedência nome > vínculo, onde
 * cai cada linha de venda, e a montagem da resposta da rota `funil-oferta`.
 *
 * O fio (rotas, predicados do Drizzle, guarda de lista vazia) está em
 * `perpetual-funil-oferta-filtro.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  MOTIVO_MAIS_DE_UM_CODIGO,
  MOTIVO_NOME_NAO_SINCRONIZADO,
  MOTIVO_OFERTA_MISTA,
  MOTIVO_SEM_CODIGO,
  MOTIVO_SEM_EXPERT,
  FORA_CAMPANHA_FORA_DA_ETAPA,
  FORA_MACRO_NAO_RESOLVIDA,
  FORA_PLANILHA_SEM_UTM,
  FORA_SEM_FUNIL,
  FORA_SEM_OFERTA,
  FORA_SEM_UTM_CAMPAIGN,
  lerFunilDoNome,
  lerOfertaDoNome,
} from "@loyola-x/shared";
import {
  acumuladorForaDoFiltro,
  campanhasParaMidia,
  classificarCampanhas,
  decidirLinhaNoFiltro,
  montarFiltroDeCampanhas,
  montarFunilOferta,
  resolverDimensao,
} from "../services/funil-e-oferta.js";
import type { DimensaoDeCampanha, MapaDeDimensoes } from "../services/nomenclatura/mapa-de-campanhas.js";

const vinculo = (over: Partial<DimensaoDeCampanha>): DimensaoDeCampanha => ({
  expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", year: "2026", temperature: "hot",
  auction: "cbo", format: "videos", lp: "na", origin: "legado", name: "bbe_a01_churrasco_of01_perpetuo_2026_hot_cbo_videos_na",
  metaCampaignName: null, namingCampaignId: "n1", ...over,
});

describe("AC2 — nome atual > vínculo > null (decisão (i) do Danilo)", () => {
  it("o nome traz o código: o vínculo NÃO é lido, mesmo divergente", () => {
    const r = resolverDimensao("funil", lerFunilDoNome("bbe_a02_x"), "a01");
    expect(r).toEqual({ codigo: "a02", origem: "nome", motivo: null });
  });

  it("o nome não traz a dimensão: o vínculo preenche (a oferta das legadas)", () => {
    const r = resolverDimensao("oferta", lerOfertaDoNome("bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos"), "of02");
    expect(r).toEqual({ codigo: "of02", origem: "vinculo", motivo: null });
  });

  it("nenhum dos dois: null com o motivo do NOME", () => {
    expect(resolverDimensao("oferta", lerOfertaDoNome("bbe-a1-jul-26"), undefined)).toEqual({ codigo: null, origem: null, motivo: MOTIVO_SEM_CODIGO });
    expect(resolverDimensao("funil", lerFunilDoNome("x_a01_a02"), null)).toEqual({ codigo: null, origem: null, motivo: MOTIVO_MAIS_DE_UM_CODIGO });
  });

  it("`ofmix` do vínculo é null com 'oferta mista' — nunca 'não cadastrado' (PO-08)", () => {
    expect(resolverDimensao("oferta", lerOfertaDoNome("bbe-a1-jul-26"), "ofmix")).toEqual({ codigo: null, origem: null, motivo: MOTIVO_OFERTA_MISTA });
  });

  it("valor de vínculo fora do formato do dicionário é ignorado (nunca chute)", () => {
    expect(resolverDimensao("funil", lerFunilDoNome("sem"), "churrasco").codigo).toBeNull();
    expect(resolverDimensao("oferta", lerOfertaDoNome("sem"), "").codigo).toBeNull();
  });

  it("sem nome atual no cache: o vínculo ainda preenche; sem vínculo, o motivo diz que o nome não foi sincronizado", () => {
    expect(resolverDimensao("funil", null, "a03")).toEqual({ codigo: "a03", origem: "vinculo", motivo: null });
    expect(resolverDimensao("funil", null, undefined)).toEqual({ codigo: null, origem: null, motivo: MOTIVO_NOME_NAO_SINCRONIZADO });
  });
});

describe("classificarCampanhas — pelo nome ATUAL, com o vínculo preenchendo só o que falta", () => {
  const nomes = new Map([
    ["333", "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa"],
    ["222", "bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos"],
  ]);
  const mapa: MapaDeDimensoes = new Map([
    // O vínculo da DG diz a01/of01 (a classificação antiga): o NOME vence.
    ["333", vinculo({ funnel: "a01", offer: "of01" })],
    // A legada tem vínculo com a01/of02: o funil vem do nome, a OFERTA do vínculo.
    ["222", vinculo({ funnel: "a02", offer: "of02" })],
  ]);

  it("o caso DG cai em a02/of03 (o nome de hoje), não no vínculo nem na etapa", () => {
    const [dg] = classificarCampanhas(["333"], nomes, mapa);
    expect(dg.funil).toEqual({ codigo: "a02", origem: "nome", motivo: null });
    expect(dg.oferta).toEqual({ codigo: "of03", origem: "nome", motivo: null });
  });

  it("a legada: funil a01 do NOME (o vínculo diz a02 e perde), oferta of02 do VÍNCULO", () => {
    const [legada] = classificarCampanhas(["222"], nomes, mapa);
    expect(legada.funil).toEqual({ codigo: "a01", origem: "nome", motivo: null });
    expect(legada.oferta).toEqual({ codigo: "of02", origem: "vinculo", motivo: null });
  });

  it("deduplica por id preservando a ordem da etapa", () => {
    const r = classificarCampanhas(["222", "333", "222"], nomes, new Map());
    expect(r.map((c) => c.campaignId)).toEqual(["222", "333"]);
  });

  it("campanha sem nome no cache: nome null, motivo 'nome atual não sincronizado'", () => {
    const [x] = classificarCampanhas(["777"], nomes, new Map());
    expect(x.nome).toBeNull();
    expect(x.funil.motivo).toBe(MOTIVO_NOME_NAO_SINCRONIZADO);
  });
});

describe("montarFiltroDeCampanhas e decidirLinhaNoFiltro (AC4/AC5)", () => {
  const nomes = new Map([
    ["111", "bbe_a01_hamburguer_of01_perpetuo"],
    ["222", "bbe-a1-jul-26--venda--perpetuo"],
    ["333", "dg_a02_x_of03"],
    ["444", "[FZA1][FB/IG]"],
    ["555", "bbe_a01_x_a02_of01"],
  ]);
  const classificadas = classificarCampanhas(["111", "222", "333", "444", "555"], nomes, new Map());

  it("E entre as duas dimensões", () => {
    expect([...montarFiltroDeCampanhas(classificadas, { funil: "a01", oferta: "of01" }).campanhas]).toEqual(["111"]);
    expect([...montarFiltroDeCampanhas(classificadas, { funil: "a01" }).campanhas].sort()).toEqual(["111", "222", "444"]);
    expect([...montarFiltroDeCampanhas(classificadas, { oferta: "of03" }).campanhas]).toEqual(["333"]);
  });

  it("nenhuma casada → conjunto VAZIO (e é isso que o lado Meta tem de respeitar)", () => {
    const f = montarFiltroDeCampanhas(classificadas, { oferta: "of09" });
    expect(f.campanhas.size).toBe(0);
    expect(campanhasParaMidia(["111", "222"], f)).toBeNull();
  });

  it("sem filtro, a lista de mídia é a original, intacta", () => {
    const ids = ["111", "222"];
    expect(campanhasParaMidia(ids, undefined)).toBe(ids);
  });

  const f = montarFiltroDeCampanhas(classificadas, { funil: "a01", oferta: "of01" });

  it("linha do filtro entra", () => {
    expect(decidirLinhaNoFiltro("111", f, true)).toEqual({ dentro: true });
  });

  it("os quatro motivos da planilha", () => {
    expect(decidirLinhaNoFiltro(null, f, true)).toEqual({ dentro: false, motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null });
    expect(decidirLinhaNoFiltro("{{campaign.id}}", f, true)).toEqual({ dentro: false, motivo: FORA_MACRO_NAO_RESOLVIDA, detalhe: null });
    expect(decidirLinhaNoFiltro("999", f, true)).toEqual({ dentro: false, motivo: FORA_CAMPANHA_FORA_DA_ETAPA, detalhe: null });
    expect(decidirLinhaNoFiltro("111", f, false)).toEqual({ dentro: false, motivo: FORA_PLANILHA_SEM_UTM, detalhe: null });
  });

  it("campanha da etapa sem a dimensão pedida: fora, com o motivo do AC2", () => {
    // 222 e 444 são a01 sem oferta: é o churrasco em `of01`.
    expect(decidirLinhaNoFiltro("222", f, true)).toEqual({ dentro: false, motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO });
    expect(decidirLinhaNoFiltro("555", f, true)).toEqual({ dentro: false, motivo: FORA_SEM_FUNIL, detalhe: MOTIVO_MAIS_DE_UM_CODIGO });
  });

  it("venda de OUTRO funil conhecido não é perda: não entra no aviso", () => {
    expect(decidirLinhaNoFiltro("333", f, true)).toEqual({ dentro: false, motivo: null });
  });

  it("dimensão conhecida e diferente decide, mesmo que a outra falte", () => {
    const soOferta = montarFiltroDeCampanhas(classificadas, { funil: "a02", oferta: "of01" });
    // 222 é a01 (≠ a02) e sem oferta: é do a01, não uma perda do a02.
    expect(decidirLinhaNoFiltro("222", soOferta, true)).toEqual({ dentro: false, motivo: null });
  });
});

describe("acumuladorForaDoFiltro — unidades do aviso (PO-10)", () => {
  it("compradores DISTINTOS e faturamento BRUTO somado, por motivo", () => {
    const a = acumuladorForaDoFiltro();
    a.somar({ motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null }, "email|ana", 100);
    a.somar({ motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null }, "email|ana", 50);
    a.somar({ motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null }, "email|bob", 30);
    a.somar({ motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO }, "email|bob", 500);
    expect(a.lista()).toEqual([
      { motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO, compradores: 1, faturamentoBruto: 500 },
      { motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null, compradores: 2, faturamentoBruto: 180 },
    ]);
  });
});

describe("montarFunilOferta (AC3)", () => {
  const nomes = new Map([
    ["111", "bbe_a01_hamburguer_of01"],
    ["222", "bbe-a1-jul-26--venda--perpetuo"],
    ["666", "bbe_a07_x_of09"],
  ]);
  const classificadas = classificarCampanhas(["111", "222", "666"], nomes, new Map());
  const gasto = new Map([["111", 500], ["222", 900]]);
  const janela = { since: "2026-09-01", until: "2026-09-07" };

  it("sem expert: motivo declarado, opções vazias, nada acusado de 'não cadastrado'", () => {
    const r = montarFunilOferta({ classificadas, gasto, expert: null, dicionario: null, janela });
    expect(r.expert).toBeNull();
    expect(r.motivoSemExpert).toBe(MOTIVO_SEM_EXPERT);
    expect(r.opcoes).toEqual({ funis: [], ofertas: [] });
    expect(r.naoCadastrados).toEqual([]);
  });

  it("todas as campanhas, com gasto (0 quando não gastou) e a origem de cada dimensão", () => {
    const r = montarFunilOferta({ classificadas, gasto, expert: null, dicionario: null, janela });
    expect(r.campanhas.map((c) => [c.campaignId, c.funil, c.oferta, c.gasto])).toEqual([
      ["111", "a01", "of01", 500],
      ["222", "a01", null, 900],
      ["666", "a07", "of09", 0],
    ]);
    expect(r.campanhas[0]).not.toHaveProperty("motivoSemOferta");
    expect(r.campanhas[1].motivoSemOferta).toBe(MOTIVO_SEM_CODIGO);
    expect(r.campanhas[1].origemFunil).toBe("nome");
  });

  it("semOferta: com gasto e motivo, a de maior gasto primeiro", () => {
    const r = montarFunilOferta({ classificadas, gasto, expert: null, dicionario: null, janela });
    expect(r.semOferta).toEqual([{ campaignId: "222", nome: "bbe-a1-jul-26--venda--perpetuo", gasto: 900, motivo: MOTIVO_SEM_CODIGO }]);
    expect(r.semFunil).toEqual([]);
  });

  it("opções: ativos sempre; inativo só se aparece em campanha (PO-09); não cadastrado com as campanhas", () => {
    const r = montarFunilOferta({
      classificadas,
      gasto,
      expert: { id: "e1", code: "bbe", name: "Barbecue" },
      dicionario: {
        funis: [
          { code: "a01", description: "VSL direto", active: false }, // inativo EM USO: fica
          { code: "a02", description: "Quiz", active: true },
          { code: "a03", description: "Antigo", active: false }, // inativo sem uso: some
        ],
        ofertas: [{ code: "of01", description: "R$ 97", active: true }],
      },
      janela,
    });
    expect(r.opcoes.funis).toEqual([
      { codigo: "a01", descricao: "VSL direto", ativo: false },
      { codigo: "a02", descricao: "Quiz", ativo: true },
    ]);
    expect(r.opcoes.ofertas).toEqual([{ codigo: "of01", descricao: "R$ 97", ativo: true }]);
    expect(r.naoCadastrados).toEqual([
      { dimensao: "funil", codigo: "a07", campanhas: [{ campaignId: "666", nome: "bbe_a07_x_of09" }] },
      { dimensao: "oferta", codigo: "of09", campanhas: [{ campaignId: "666", nome: "bbe_a07_x_of09" }] },
    ]);
  });
});
