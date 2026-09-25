/**
 * Story 29.80 (AC8) — a regra dos filtros de Funil e Oferta do perpétuo.
 *
 * O fio (o componente e os hooks usando esta regra) está em
 * `filtro-funil-oferta-fio.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { CampanhaComFunilEOferta, FunilOfertaDoFunil } from "@loyola-x/shared";
import {
  FRASE_API_SEM_FILTRO,
  FRASE_CARREGANDO_PLANILHA,
  FRASE_ERRO_PLANILHA,
  FRASE_SEM_EXPERT,
  REGRA_TUDO_SEPARADO,
  SEM_FILTRO,
  estadoDaPlanilhaDeVendas,
  estreitarCampanhas,
  idsDaMidia,
  montarAvisoDoFiltro,
  planoDoFiltro,
  sinalizacaoDaCampanhaSemDimensao,
  sinalizacoesDoCadastro,
  sufixoDoRecorte,
  vendasRespeitaramORecorte,
  type EstadoDaPlanilhaDeVendas,
} from "../filtro-funil-oferta";

const camp = (over: Partial<CampanhaComFunilEOferta>): CampanhaComFunilEOferta => ({
  campaignId: "x",
  nome: "x",
  funil: null,
  oferta: null,
  origemFunil: null,
  origemOferta: null,
  gasto: 0,
  ...over,
});

// A etapa: hambúrguer (a01/of01), legada do churrasco (a01, sem oferta),
// DG (a02/of03), [FZA1] (a01, sem oferta).
const CAMPANHAS = [
  camp({ campaignId: "111", nome: "bbe_a01_hamburguer_of01_perpetuo", funil: "a01", oferta: "of01", gasto: 700 }),
  camp({ campaignId: "222", nome: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos", funil: "a01", motivoSemOferta: "sem código no nome", gasto: 70 }),
  camp({ campaignId: "333", nome: "dg_a02_claude-negocios_of03_perpetuo", funil: "a02", oferta: "of03", gasto: 7 }),
  camp({ campaignId: "444", nome: "[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]", funil: "a01", motivoSemOferta: "sem código no nome", gasto: 7000 }),
];
const DA_ETAPA = ["111", "222", "333", "444"];

const dados = (over: Partial<FunilOfertaDoFunil> = {}): FunilOfertaDoFunil => ({
  expert: { id: "e1", code: "bbe", name: "Barbecue" },
  motivoSemExpert: null,
  opcoes: {
    funis: [{ codigo: "a01", descricao: "VSL", ativo: true }],
    ofertas: [{ codigo: "of01", descricao: "R$ 97", ativo: true }],
  },
  campanhas: CAMPANHAS,
  naoCadastrados: [],
  semFunil: [],
  semOferta: [],
  janela: { since: "2026-09-01", until: "2026-09-07" },
  ...over,
});

describe("estreitarCampanhas (AC2)", () => {
  it("'Todos' devolve a lista original IGUAL — a mesma referência", () => {
    const r = estreitarCampanhas(DA_ETAPA, CAMPANHAS, SEM_FILTRO);
    expect(r).toEqual({ tipo: "todos", ids: DA_ETAPA });
    expect(r.tipo === "todos" && r.ids).toBe(DA_ETAPA);
    expect(estreitarCampanhas(DA_ETAPA, CAMPANHAS, null).tipo).toBe("todos");
  });

  it("funil e oferta combinam (E), na ordem da etapa", () => {
    expect(estreitarCampanhas(DA_ETAPA, CAMPANHAS, { funil: "a01", oferta: null })).toEqual({ tipo: "filtrado", ids: ["111", "222", "444"] });
    expect(estreitarCampanhas(DA_ETAPA, CAMPANHAS, { funil: "a01", oferta: "of01" })).toEqual({ tipo: "filtrado", ids: ["111"] });
    expect(estreitarCampanhas(DA_ETAPA, CAMPANHAS, { funil: null, oferta: "of03" })).toEqual({ tipo: "filtrado", ids: ["333"] });
  });

  it("R1/PO-02 — nenhuma casada é um 'vazio' EXPLÍCITO, sem lista para repassar", () => {
    const r = estreitarCampanhas(DA_ETAPA, CAMPANHAS, { funil: "a01", oferta: "of02" });
    expect(r).toEqual({ tipo: "vazio" });
    expect(r).not.toHaveProperty("ids");
    // e o que os blocos Meta recebem é `null`, nunca `[]` (o projeto inteiro)
    expect(idsDaMidia(r)).toBeNull();
  });

  it("só campanhas DA ETAPA — a classificação de outra campanha não entra", () => {
    const r = estreitarCampanhas(["111"], CAMPANHAS, { funil: "a01", oferta: null });
    expect(r).toEqual({ tipo: "filtrado", ids: ["111"] });
  });

  it("com filtro e sem a lista classificada: vazio (nunca a etapa inteira passando por filtrada)", () => {
    expect(estreitarCampanhas(DA_ETAPA, undefined, { funil: "a01", oferta: null })).toEqual({ tipo: "vazio" });
  });
});

describe("planoDoFiltro (AC1/AC5/AC7)", () => {
  const base = {
    tipoDoFunil: "perpetual",
    campaignIdsDaEtapa: DA_ETAPA,
    pedido: { funil: "a01", oferta: "of01" },
    consulta: { dados: dados(), carregando: false, erroStatus: null },
    planilhaDeVendas: "com-utm-campaign" as EstadoDaPlanilhaDeVendas,
  };

  it("só no funil perpétuo (o `mobile` e o `launch` não mostram nada)", () => {
    for (const tipo of ["launch", "mobile"]) {
      const p = planoDoFiltro({ ...base, tipoDoFunil: tipo });
      expect(p.mostrar).toBe(false);
      expect(p.recorteDeVendas).toEqual({});
      expect(p.midia).toEqual({ tipo: "todos", ids: DA_ETAPA });
    }
  });

  it("AC7 — API sem a rota (404): desabilitado com a frase, NADA vai para as vendas, mídia intacta", () => {
    const p = planoDoFiltro({ ...base, consulta: { dados: undefined, carregando: false, erroStatus: 404 } });
    expect(p.mostrar).toBe(true);
    expect(p.desabilitado).toBe(FRASE_API_SEM_FILTRO);
    expect(p.filtro).toBeNull();
    expect(p.recorteDeVendas).toEqual({});
    expect(p.midia).toEqual({ tipo: "todos", ids: DA_ETAPA });
  });

  it("AC7 — enquanto a rota não respondeu, o parâmetro não vai", () => {
    const p = planoDoFiltro({ ...base, consulta: { dados: undefined, carregando: true, erroStatus: null } });
    expect(p.recorteDeVendas).toEqual({});
    expect(p.filtro).toBeNull();
  });

  it("outro erro: desabilitado com o status, sem recorte", () => {
    const p = planoDoFiltro({ ...base, consulta: { dados: undefined, carregando: false, erroStatus: 500 } });
    expect(p.desabilitado).toMatch(/erro 500/);
    expect(p.recorteDeVendas).toEqual({});
  });

  it("AC5 — sem expert vinculado: desabilitado, sem recorte", () => {
    const p = planoDoFiltro({ ...base, consulta: { dados: dados({ expert: null, motivoSemExpert: "projeto sem expert vinculado" }), carregando: false, erroStatus: null } });
    expect(p.desabilitado).toBe(FRASE_SEM_EXPERT);
    expect(p.recorteDeVendas).toEqual({});
    expect(p.filtro).toBeNull();
  });

  it("habilitado e com pedido: o recorte vai para as vendas e a mídia se estreita", () => {
    const p = planoDoFiltro(base);
    expect(p.desabilitado).toBeNull();
    expect(p.filtro).toEqual({ funil: "a01", oferta: "of01" });
    expect(p.recorteDeVendas).toEqual({ funil: "a01", oferta: "of01" });
    expect(p.midia).toEqual({ tipo: "filtrado", ids: ["111"] });
    expect(p.vendasNaoFiltraveis).toBe(false);
  });

  it("só a dimensão pedida vai na query", () => {
    expect(planoDoFiltro({ ...base, pedido: { funil: null, oferta: "of03" } }).recorteDeVendas).toEqual({ oferta: "of03" });
  });

  it("sem pedido: habilitado e 'Todos' — nada muda", () => {
    const p = planoDoFiltro({ ...base, pedido: SEM_FILTRO });
    expect(p.desabilitado).toBeNull();
    expect(p.filtro).toBeNull();
    expect(p.recorteDeVendas).toEqual({});
    expect(p.midia.tipo === "todos" && p.midia.ids).toBe(DA_ETAPA);
  });

  it("AC3 — planilha sem utm_campaign (dg-a1): vendas NÃO filtradas (sem recorte, com selo); a mídia se estreita", () => {
    const p = planoDoFiltro({ ...base, planilhaDeVendas: "sem-utm-campaign" });
    expect(p.vendasNaoFiltraveis).toBe(true);
    expect(p.recorteDeVendas).toEqual({});
    expect(p.midia.tipo).toBe("filtrado");
  });

  it("REQ-001 — funil SEM planilha: sem selo (as vendas são do pixel, filtrado) e o recorte vai", () => {
    const p = planoDoFiltro({ ...base, planilhaDeVendas: "sem-planilha" });
    expect(p.filtro).toEqual({ funil: "a01", oferta: "of01" });
    expect(p.vendasNaoFiltraveis).toBe(false);
    expect(p.recorteDeVendas).toEqual({ funil: "a01", oferta: "of01" });
    expect(p.midia).toEqual({ tipo: "filtrado", ids: ["111"] });
  });

  it("REQ-001 — planilha carregando: filtro ainda não liga — sem selo, sem recorte, mídia intacta", () => {
    const p = planoDoFiltro({ ...base, planilhaDeVendas: "carregando" });
    expect(p.desabilitado).toBe(FRASE_CARREGANDO_PLANILHA);
    expect(p.filtro).toBeNull();
    expect(p.vendasNaoFiltraveis).toBe(false);
    expect(p.recorteDeVendas).toEqual({});
    expect(p.midia).toEqual({ tipo: "todos", ids: DA_ETAPA });
  });

  it("REQ-001 — a consulta da planilha falhou: desabilitado com a frase, sem selo", () => {
    const p = planoDoFiltro({ ...base, planilhaDeVendas: "erro" });
    expect(p.desabilitado).toBe(FRASE_ERRO_PLANILHA);
    expect(p.filtro).toBeNull();
    expect(p.vendasNaoFiltraveis).toBe(false);
  });
});

describe("estadoDaPlanilhaDeVendas (REQ-001)", () => {
  it("`undefined` é carregando — ou erro, se a consulta falhou", () => {
    expect(estadoDaPlanilhaDeVendas({ dados: undefined, falhou: false })).toBe("carregando");
    expect(estadoDaPlanilhaDeVendas({ dados: undefined, falhou: true })).toBe("erro");
  });

  it("`null` (a API disse que o funil não tem planilha) é SEM planilha, não 'sem utm_campaign'", () => {
    expect(estadoDaPlanilhaDeVendas({ dados: null, falhou: false })).toBe("sem-planilha");
  });

  it("planilha com e sem a coluna utm_campaign mapeada", () => {
    expect(estadoDaPlanilhaDeVendas({ dados: { columnMapping: { utm_campaign: "UTM Campaign" } }, falhou: false })).toBe("com-utm-campaign");
    expect(estadoDaPlanilhaDeVendas({ dados: { columnMapping: {} }, falhou: false })).toBe("sem-utm-campaign");
    expect(estadoDaPlanilhaDeVendas({ dados: { columnMapping: { utm_campaign: "" } }, falhou: false })).toBe("sem-utm-campaign");
  });

  it("dado anterior vence a falha de um refetch", () => {
    expect(estadoDaPlanilhaDeVendas({ dados: { columnMapping: { utm_campaign: "c" } }, falhou: true })).toBe("com-utm-campaign");
  });
});

describe("a query das vendas", () => {
  it("sem recorte a URL é a de sempre", () => {
    expect(sufixoDoRecorte(undefined)).toBe("");
    expect(sufixoDoRecorte({})).toBe("");
  });
  it("com recorte, os dois parâmetros da 29.79", () => {
    expect(sufixoDoRecorte({ funil: "a01", oferta: "of01" })).toBe("&funil=a01&oferta=of01");
    expect(sufixoDoRecorte({ oferta: "of03" })).toBe("&oferta=of03");
  });
  it("R2 — resposta sem o eco `filtro` quando o recorte foi pedido: a API não aplicou", () => {
    expect(vendasRespeitaramORecorte({}, { funil: "a01" })).toBe(false);
    expect(vendasRespeitaramORecorte({ filtro: { funil: "a02", oferta: null } }, { funil: "a01" })).toBe(false);
    expect(vendasRespeitaramORecorte({ filtro: { funil: "a01", oferta: null } }, { funil: "a01" })).toBe(true);
    expect(vendasRespeitaramORecorte({}, {})).toBe(true);
    expect(vendasRespeitaramORecorte(undefined, { funil: "a01" })).toBe(true);
  });
});

describe("sinalizações com link para o cadastro (AC5)", () => {
  it("sem expert → 'Vincular o expert a este projeto' → Dicionário › Experts", () => {
    const [s, ...resto] = sinalizacoesDoCadastro(dados({ expert: null }), true);
    expect(resto).toEqual([]);
    expect(s.acao).toBe("Vincular o expert a este projeto");
    expect(s.href).toBe("/settings/nomenclatura?secao=dicionario&aba=experts");
  });

  it("expert sem funis / sem ofertas → Funis/Ofertas com o expert já escolhido", () => {
    const r = sinalizacoesDoCadastro(dados({ opcoes: { funis: [], ofertas: [] } }), true);
    expect(r.map((s) => [s.acao, s.href])).toEqual([
      ["Cadastrar funis do Barbecue", "/settings/nomenclatura?secao=dicionario&aba=funis&expertId=e1"],
      ["Cadastrar ofertas do Barbecue", "/settings/nomenclatura?secao=dicionario&aba=ofertas&expertId=e1"],
    ]);
  });

  it("código achado nas campanhas e não cadastrado → texto com N campanhas e link para a aba certa", () => {
    const r = sinalizacoesDoCadastro(
      dados({
        naoCadastrados: [
          { dimensao: "oferta", codigo: "of03", campanhas: [{ campaignId: "333", nome: "dg" }] },
          { dimensao: "funil", codigo: "a02", campanhas: [{ campaignId: "333", nome: "dg" }, { campaignId: "334", nome: "dg2" }] },
        ],
      }),
      true,
    );
    expect(r).toEqual([
      { chave: "nao-cadastrado-oferta-of03", texto: "of03 aparece em 1 campanha e não está no Dicionário", acao: "cadastrar", href: "/settings/nomenclatura?secao=dicionario&aba=ofertas&expertId=e1" },
      { chave: "nao-cadastrado-funil-a02", texto: "a02 aparece em 2 campanhas e não está no Dicionário", acao: "cadastrar", href: "/settings/nomenclatura?secao=dicionario&aba=funis&expertId=e1" },
    ]);
  });

  it("guest (PO-03) recebe o texto, sem href — o Dicionário é rota global", () => {
    for (const d of [dados({ expert: null }), dados({ opcoes: { funis: [], ofertas: [] } })]) {
      for (const s of sinalizacoesDoCadastro(d, false)) expect(s.href).toBeNull();
    }
  });

  it("campanha sem oferta que ENTRA na fila de Legadas → link para Campanhas › Legadas", () => {
    const s = sinalizacaoDaCampanhaSemDimensao(CAMPANHAS[1], true);
    expect(s.acao).toBe("Classificar em Campanhas › Legadas");
    expect(s.href).toBe("/settings/nomenclatura?secao=campanhas&aba=legadas");
    expect(sinalizacaoDaCampanhaSemDimensao(CAMPANHAS[1], false).href).toBeNull();
  });

  it("47.17 — `[FZA1]…` ENTRA na fila (era o R3 da 29.79): leva o link para Campanhas › Legadas", () => {
    const s = sinalizacaoDaCampanhaSemDimensao(CAMPANHAS[3], true);
    expect(s.acao).toBe("Classificar em Campanhas › Legadas");
    expect(s.href).toBe("/settings/nomenclatura?secao=campanhas&aba=legadas");
  });

  it("PO-08 — campanha que não entra na fila: o texto diz isso e NÃO leva link", () => {
    const s = sinalizacaoDaCampanhaSemDimensao(camp({ campaignId: "666", nome: "[30-14-7-5A1] captação" }), true);
    expect(s.href).toBeNull();
    expect(s.acao).toBeNull();
    expect(s.texto).toMatch(/Não entra na fila de Legadas/);
  });
});

describe("montarAvisoDoFiltro (AC4)", () => {
  const fora = [
    { motivo: "campanha sem oferta identificada" as const, detalhe: "sem código no nome" as const, compradores: 3, faturamentoBruto: 450 },
    { motivo: "sem utm_campaign" as const, detalhe: null, compradores: 1, faturamentoBruto: 150 },
  ];

  it("as vendas fora, por motivo, com a unidade declarada e o total", () => {
    const a = montarAvisoDoFiltro({ filtro: { funil: "a01", oferta: "of01" }, foraDoFiltro: fora, campanhas: CAMPANHAS, comLink: true });
    expect(a.vendas).toEqual([
      { rotulo: "campanha sem oferta identificada — sem código no nome", compradores: 3, faturamentoBruto: 450 },
      { rotulo: "sem utm_campaign", compradores: 1, faturamentoBruto: 150 },
    ]);
    expect(a.totalCompradoresFora).toBe(4);
    expect(a.totalFaturamentoFora).toBe(600);
    expect(a.unidades).toMatch(/compradores distintos e faturamento bruto/);
  });

  it("o gasto das campanhas sem a dimensão, com o nome — só as que PODERIAM ser do filtro", () => {
    // 555 é a02 SEM oferta: falta-lhe a oferta, mas o funil conhecido já a põe
    // no a02 — o gasto dela não é perda do a01 + of01.
    const a02SemOferta = camp({ campaignId: "555", nome: "bbe_a02_x", funil: "a02", motivoSemOferta: "sem código no nome", gasto: 99 });
    const a = montarAvisoDoFiltro({ filtro: { funil: "a01", oferta: "of01" }, foraDoFiltro: fora, campanhas: [...CAMPANHAS, a02SemOferta], comLink: true });
    // [FZA1] (7.000) e a legada (70): a01 sem oferta. O DG é a02 — tem dono, não entra.
    expect(a.campanhas.map((c) => [c.campaignId, c.gasto])).toEqual([["444", 7000], ["222", 70]]);
    expect(a.gastoSemDimensao).toBe(7070);
    expect(a.campanhas[0].motivo).toBe("sem oferta identificada — sem código no nome");
    expect(a.campanhas[0].sinalizacao.href).toBe("/settings/nomenclatura?secao=campanhas&aba=legadas"); // [FZA1] na fila desde a 47.17
    expect(a.campanhas[1].sinalizacao.href).toBe("/settings/nomenclatura?secao=campanhas&aba=legadas");
  });

  it("declara a regra 'tudo separado' (decisão (ii) do Danilo)", () => {
    const a = montarAvisoDoFiltro({ filtro: { funil: "a01", oferta: null }, foraDoFiltro: [], campanhas: CAMPANHAS, comLink: true });
    expect(a.regra).toBe(REGRA_TUDO_SEPARADO);
    expect(a.regra).toMatch(/soma dos compradores dos filtros pode passar a de "Todos"; a do faturamento, não/);
    // Funil a01 sem oferta pedida: nenhuma campanha "sem a dimensão".
    expect(a.campanhas).toEqual([]);
  });

  it("sem `foraDoFiltro` (API ainda respondendo), o aviso não inventa linha", () => {
    const a = montarAvisoDoFiltro({ filtro: { funil: "a01", oferta: null }, foraDoFiltro: undefined, campanhas: [], comLink: true });
    expect(a.vendas).toEqual([]);
    expect(a.totalFaturamentoFora).toBe(0);
  });
});
