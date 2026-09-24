/**
 * Story 29.79 (AC3/AC4/AC5/AC8) — o FIO: as rotas com `funil`/`oferta`, o
 * predicado que chega ao Drizzle e a guarda da lista vazia.
 *
 * ## Por que aqui o banco falso lê o SQL
 *
 * A lição do gate de 23/09: provas que só atacam funções puras deixam passar o
 * defeito no call site (o argumento errado, a guarda que falta, o predicado sem
 * `project_id`). O banco de `fixtures/perpetuo-funil-oferta.ts` renderiza cada
 * `where` com o `PgDialect` e aplica o `in (...)` de campanha como o Postgres
 * aplicaria — então repassar `[]` a um leitor devolve o PROJETO INTEIRO aqui
 * também (R1), e o número sai errado.
 *
 * As contas usam a fixture: gasto diário hamb 100 · legada 10 · DG 1 ·
 * [FZA1] 1000 · outro funil 10000 (ordens de grandeza distintas: a soma diz
 * quais campanhas entraram).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FORA_CAMPANHA_FORA_DA_ETAPA,
  FORA_MACRO_NAO_RESOLVIDA,
  FORA_SEM_OFERTA,
  FORA_SEM_UTM_CAMPAIGN,
  MOTIVO_SEM_CODIGO,
  MOTIVO_SEM_EXPERT,
} from "@loyola-x/shared";
import {
  metaCampaignInsightsDaily,
  metaEntityNamesCache,
  metaHourlyInsightsDaily,
  namingCampaigns,
  namingExperts,
  namingFunnels,
  namingOffers,
} from "../db/schema.js";
import {
  mockReadSheetData,
  popularTabelas,
  montarApp,
  consultasA,
  sqlDe,
  valoresDoIn,
  TABELAS,
  db,
  CABECALHO,
  LINHAS,
  LINHAS_COM_RECOMPRA,
  FUNIL,
  PROJ,
  DE,
  ATE,
  C,
} from "./fixtures/perpetuo-funil-oferta.js";
import { invalidarMapa } from "../services/nomenclatura/mapa-de-campanhas.js";

process.env.TZ = "America/Sao_Paulo";

vi.mock("../services/google-sheets.js", () => ({
  readSheetData: (...a: unknown[]) => mockReadSheetData(...a),
}));

const rotasInternas = await import("../routes/perpetual-sales-data.js");

const base = `/api/projects/${PROJ}/funnels/${FUNIL}/perpetual`;
const janela = `startDate=${DE}&endDate=${ATE}`;
const COM_IMPOSTO = 1 / (1 - 0.1215);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  mockReadSheetData.mockReset();
  mockReadSheetData.mockResolvedValue({ headers: CABECALHO, rows: LINHAS });
  popularTabelas();
  invalidarMapa();
});

afterEach(() => {
  vi.useRealTimers();
});

async function get(url: string, papel: "admin" | "guest" = "admin") {
  const app = await montarApp([rotasInternas], papel);
  const r = await app.inject({ method: "GET", url });
  await app.close();
  return r;
}
async function json(url: string) {
  const r = await get(url);
  expect(r.statusCode, url).toBe(200);
  return r.json();
}

// ── sales-data ──────────────────────────────────────────────────────────

describe("sales-data com filtro (AC4/AC5)", () => {
  it("a01 + of01 = só o hambúrguer; o resto que não é de outro funil vem no `foraDoFiltro`, com motivo e unidade", async () => {
    const r = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    // ana (100 + bump 50) e gus (250) — a compra de gus foi estornada, mas a
    // regra do card de "Todos" a mantém como receita e conta o estorno à parte.
    expect(r.totalVendas).toBe(2);
    expect(r.faturamentoBruto).toBe(400);
    expect(r.filtro).toEqual({ funil: "a01", oferta: "of01", campanhas: [C.hamb] });
    expect(r.foraDoFiltro).toEqual([
      // legada (bob 300, joe 70) e [FZA1] (hal 80): a01 sem oferta no nome
      { motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO, compradores: 3, faturamentoBruto: 450 },
      { motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null, compradores: 1, faturamentoBruto: 150 },
      { motivo: FORA_MACRO_NAO_RESOLVIDA, detalhe: null, compradores: 1, faturamentoBruto: 120 },
      // fay@ veio da campanha de outro funil do projeto (a do "hambúrguer na planilha do churrasco")
      { motivo: FORA_CAMPANHA_FORA_DA_ETAPA, detalhe: null, compradores: 1, faturamentoBruto: 90 },
    ]);
  });

  it("TEST-001 (gate) — o `foraDoFiltro` conta COMPRADORES: a recompra do bob na legada não vira um comprador a mais", async () => {
    mockReadSheetData.mockResolvedValue({ headers: CABECALHO, rows: LINHAS_COM_RECOMPRA });
    const r = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    // bob (300 + 40), joe (70), hal (80): 4 linhas pagas, 3 compradores distintos.
    expect(r.foraDoFiltro[0]).toEqual({ motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO, compradores: 3, faturamentoBruto: 490 });
    // o filtrado não muda
    expect(r.totalVendas).toBe(2);
    expect(r.faturamentoBruto).toBe(400);
  });

  it("invariante do DoD: filtrado + Σ foraDoFiltro + o que é de outro funil conhecido = 'Todos'", async () => {
    const todos = await json(`${base}/sales-data?${janela}`);
    const f = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    const dg = await json(`${base}/sales-data?${janela}&funil=a02`);
    const fora = f.foraDoFiltro.reduce((s: number, x: { faturamentoBruto: number }) => s + x.faturamentoBruto, 0);
    // No hambúrguer de produção 100 % do gasto está em a01/of01 e a parcela "de
    // outro funil" é zero; aqui a fixture tem o DG, que é a02.
    expect(f.faturamentoBruto + fora + dg.faturamentoBruto).toBe(todos.faturamentoBruto);
  });

  it("os cliques da análise de origem são só das campanhas do filtro", async () => {
    const r = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    expect(r.analiseDeOrigem.cliquesNoLink).toBe(20 * 7);
    const [leitura] = consultasA(metaCampaignInsightsDaily);
    expect(valoresDoIn(leitura.where, "campaign_id")).toEqual([C.hamb]);
  });

  it("R1/PO-03 — filtro sem campanha casada: vendas 0 e cliques 0, NUNCA o projeto inteiro", async () => {
    const r = await json(`${base}/sales-data?${janela}&oferta=of05`);
    expect(r.filtro.campanhas).toEqual([]);
    expect(r.totalVendas).toBe(0);
    expect(r.faturamentoBruto).toBe(0);
    expect(r.semDados).toBe(false);
    expect(r.analiseDeOrigem).toBeUndefined(); // o ramo "nenhuma venda" não tem análise — como em "Todos"
    // O aviso existe mesmo sem venda no filtro: é o caso do churrasco em `of01`.
    expect(r.foraDoFiltro[0]).toEqual({ motivo: FORA_SEM_OFERTA, detalhe: MOTIVO_SEM_CODIGO, compradores: 3, faturamentoBruto: 450 });
    // E o leitor de mídia NÃO foi chamado com a lista vazia.
    expect(consultasA(metaCampaignInsightsDaily)).toHaveLength(0);
  });

  it("sem nome atual no cache e sem vínculo: nenhuma campanha classificável — conjunto vazio, leitor não chamado", async () => {
    TABELAS.set(metaEntityNamesCache, []);
    const r = await json(`${base}/sales-data?${janela}&funil=a01`);
    expect(r.filtro.campanhas).toEqual([]);
    expect(r.foraDoFiltro[0]).toMatchObject({ motivo: "campanha sem funil identificado", detalhe: "nome atual não sincronizado" });
    expect(consultasA(metaCampaignInsightsDaily)).toHaveLength(0);
  });

  /**
   * ⚠️ Pela rota, o conjunto vazio nunca chega aos cliques: sem campanha no
   * filtro não há venda nele, e a função sai pelo ramo "nenhuma venda" antes
   * (o teste acima). A guarda do denominador só é alcançável se a etapa mudar
   * entre as duas leituras — então ela é provada AQUI, chamando o serviço com
   * um filtro cuja campanha não está mais na etapa. Sem a guarda, o leitor
   * recebe `[]` e devolve os cliques do PROJETO (inclusive os 2.000/dia do
   * outro funil).
   */
  it("R1 no denominador: filtro com venda mas sem campanha na etapa → cliques 0, não os do projeto", async () => {
    const { calcularVendasDoPerpetuo } = await import("../services/perpetual-sales.js");
    const { montarFiltroDeCampanhas } = await import("../services/funil-e-oferta.js");
    const filtro = montarFiltroDeCampanhas([], { funil: "a01" });
    filtro.campanhas.add(C.outroFunil); // a venda de fay@ passa; a campanha dela não é da etapa
    const r = await calcularVendasDoPerpetuo(db, { projectId: PROJ, funnelId: FUNIL, startDate: DE, endDate: ATE, filtro });
    expect(r.totalVendas).toBe(1);
    expect("analiseDeOrigem" in r ? r.analiseDeOrigem?.cliquesNoLink : undefined).toBe(0);
    expect(consultasA(metaCampaignInsightsDaily)).toHaveLength(0);
  });

  it("o caso DG: vendido com `utm_term` a01/of01, a campanha hoje é a02/of03 — cai em a02/of03", async () => {
    const a02 = await json(`${base}/sales-data?${janela}&funil=a02&oferta=of03`);
    expect(a02.totalVendas).toBe(2); // ana (200) e ivy (60)
    expect(a02.faturamentoBruto).toBe(260);
    // Nem a `utm_term` (a01/of01) nem o `name` gravado na etapa (a01/of01) levam o DG para o a01.
    const a01of01 = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    expect(a01of01.faturamentoBruto).toBe(400);
  });

  it("'tudo separado' (ii): quem comprou em a01 e em a02 conta nos DOIS, cada um com a sua compra", async () => {
    const todos = await json(`${base}/sales-data?${janela}`);
    const a01 = await json(`${base}/sales-data?${janela}&funil=a01`);
    const a02 = await json(`${base}/sales-data?${janela}&funil=a02`);
    // ana: 150 no hambúrguer (a01) e 200 no DG (a02). Filtrando DEPOIS da dedup,
    // os 350 dela iriam inteiros para a linha mais recente (o DG).
    expect(a01.faturamentoBruto).toBe(150 + 250 + 300 + 70 + 80);
    expect(a02.faturamentoBruto).toBe(200 + 60);
    const fora = a01.foraDoFiltro.reduce((s: number, x: { faturamentoBruto: number }) => s + x.faturamentoBruto, 0);
    // O FATURAMENTO fecha com "Todos"…
    expect(a01.faturamentoBruto + a02.faturamentoBruto + fora).toBe(todos.faturamentoBruto);
    // …e os COMPRADORES passam dele: ana está nos dois.
    const foraCompradores = a01.foraDoFiltro.reduce((s: number, x: { compradores: number }) => s + x.compradores, 0);
    expect(a01.totalVendas + a02.totalVendas + foraCompradores).toBeGreaterThan(todos.totalVendas);
  });

  it("PO-07 — o estorno em linha SEM `utm_campaign` pertence ao filtro da compra (pareado pela transação)", async () => {
    const hamb = await json(`${base}/sales-data?${janela}&funil=a01&oferta=of01`);
    expect(hamb.vendasReembolsadas).toBe(1);
    expect(hamb.reembolsoBruto).toBe(250);
    const dg = await json(`${base}/sales-data?${janela}&funil=a02`);
    expect(dg.vendasReembolsadas).toBe(0);
  });

  it("sem filtro, a leitura NÃO consulta a Nomenclatura nem classifica nada", async () => {
    await json(`${base}/sales-data?${janela}`);
    expect(consultasA(namingCampaigns)).toHaveLength(0);
    expect(consultasA(namingExperts)).toHaveLength(0);
  });

  it("código fora do formato do dicionário é 400, não 'Todos' calado", async () => {
    expect((await get(`${base}/sales-data?${janela}&funil=a1`)).statusCode).toBe(400);
    expect((await get(`${base}/sales-data?${janela}&oferta=ofmix`)).statusCode).toBe(400);
  });

  it("planilha sem coluna de UTM: toda venda fora, com 'planilha sem UTM'", async () => {
    mockReadSheetData.mockResolvedValue({
      headers: CABECALHO.map((h) => (h === "utm_campaign" ? "outra" : h)),
      rows: LINHAS,
    });
    const r = await json(`${base}/sales-data?${janela}&funil=a01`);
    expect(r.totalVendas).toBe(0);
    expect(r.foraDoFiltro).toHaveLength(1);
    expect(r.foraDoFiltro[0].motivo).toBe("planilha sem UTM — não filtrável");
    expect(r.foraDoFiltro[0].faturamentoBruto).toBe(1470);
  });
});

// ── sales-data-daily ─────────────────────────────────────────────────────

describe("sales-data-daily com filtro", () => {
  it("PO-07 — a compra estornada numa linha sem `utm_campaign` NÃO volta como receita no filtro", async () => {
    const r = await json(`${base}/sales-data-daily?${janela}&funil=a01&oferta=of01`);
    // gus (250, 05/09) foi estornado; se o pareamento visse só as linhas do
    // filtro, o estorno (sem utm_campaign) sairia antes e a compra voltaria.
    expect(r.byDay).toEqual({ "2026-09-01": 150 });
    expect(r.salesByDay).toEqual({ "2026-09-01": 1 });
    expect(r.filtro.campanhas).toEqual([C.hamb]);
    expect(r.foraDoFiltro.map((x: { motivo: string }) => x.motivo)).toEqual([
      FORA_SEM_OFERTA, FORA_SEM_UTM_CAMPAIGN, FORA_MACRO_NAO_RESOLVIDA, FORA_CAMPANHA_FORA_DA_ETAPA,
    ]);
  });

  it("com `groupBy`, só as entidades do filtro", async () => {
    const r = await json(`${base}/sales-data-daily?${janela}&groupBy=campaign&funil=a01`);
    expect(Object.keys(r.byEntity).sort()).toEqual([C.hamb, C.legada, C.fza1].sort());
  });

  it("filtro sem campanha: série vazia e o aviso", async () => {
    const r = await json(`${base}/sales-data-daily?${janela}&oferta=of05`);
    expect(r.byDay).toEqual({});
    expect(r.semDados).toBe(false);
    expect(r.foraDoFiltro.length).toBeGreaterThan(0);
  });
});

// ── hourly ──────────────────────────────────────────────────────────────

describe("hourly com filtro", () => {
  const somaInvest = (xs: { investimento: number }[]) => xs.reduce((s, x) => s + x.investimento, 0);

  it("o investimento é só das campanhas do filtro — o predicado leva o id certo", async () => {
    const r = await json(`${base}/hourly?${janela}&funil=a02`);
    expect(somaInvest(r.porHora)).toBeCloseTo(7 * 1 * COM_IMPOSTO, 6);
    expect(somaInvest(r.porDiaDaSemana)).toBeCloseTo(7 * 1 * COM_IMPOSTO, 6);
    expect(valoresDoIn(consultasA(metaHourlyInsightsDaily)[0].where, "campaign_id")).toEqual([C.dg]);
    expect(valoresDoIn(consultasA(metaCampaignInsightsDaily)[0].where, "campaign_id")).toEqual([C.dg]);
    // vendas: ana (200) e ivy (60)
    expect(r.cobertura.totalVendas).toBe(2);
    expect(r.filtro).toEqual({ funil: "a02", oferta: null, campanhas: [C.dg] });
  });

  it("R1/PO-03 — filtro sem campanha: investimento ZERO e os leitores NÃO são chamados", async () => {
    const r = await json(`${base}/hourly?${janela}&oferta=of05`);
    expect(somaInvest(r.porHora)).toBe(0);
    expect(somaInvest(r.porDiaDaSemana)).toBe(0);
    expect(consultasA(metaHourlyInsightsDaily)).toHaveLength(0);
    expect(consultasA(metaCampaignInsightsDaily)).toHaveLength(0);
    expect(r.cobertura.totalVendas).toBe(0);
  });

  it("PO-07 também na horária: gus (estornado) não entra na receita do filtro", async () => {
    const r = await json(`${base}/hourly?${janela}&funil=a01&oferta=of01`);
    // ana 100 + 50 às 10h; gus (21h) fica de fora pelo estorno.
    expect(r.porHora[10].faturamentoBruto).toBe(150);
    expect(r.porHora[21].faturamentoBruto).toBe(0);
  });
});

// ── a rota funil-oferta ─────────────────────────────────────────────────

describe("GET …/perpetual/funil-oferta (AC3)", () => {
  it("sem expert ligado ao projeto (produção em 23/09): campanhas classificadas pelo nome e o motivo", async () => {
    const r = await json(`${base}/funil-oferta?${janela}`);
    expect(r.expert).toBeNull();
    expect(r.motivoSemExpert).toBe(MOTIVO_SEM_EXPERT);
    const porId = Object.fromEntries(r.campanhas.map((c: { campaignId: string }) => [c.campaignId, c]));
    expect(Object.keys(porId).sort()).toEqual([C.hamb, C.legada, C.dg, C.fza1].sort());
    expect(porId[C.dg]).toMatchObject({ funil: "a02", oferta: "of03", origemFunil: "nome", nome: "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa" });
    expect(porId[C.legada]).toMatchObject({ funil: "a01", oferta: null, motivoSemOferta: MOTIVO_SEM_CODIGO });
    expect(porId[C.fza1]).toMatchObject({ funil: "a01", oferta: null });
    expect(porId[C.hamb].gasto).toBeCloseTo(7 * 100 * COM_IMPOSTO, 6);
    expect(r.semOferta.map((c: { campaignId: string }) => c.campaignId)).toEqual([C.fza1, C.legada]); // maior gasto primeiro
    expect(r.janela).toEqual({ since: DE, until: ATE });
  });

  it("o nome atual vem do cache de nomes, filtrado por projeto e tipo — nunca de `funnel_stages.campaigns`", async () => {
    await json(`${base}/funil-oferta?${janela}`);
    const [nomes] = consultasA(metaEntityNamesCache);
    const { sql, params } = sqlDe(nomes.where);
    expect(sql).toMatch(/"meta_entity_names_cache"."project_id" = \$1/);
    expect(sql).toMatch(/"entity_type" = \$2/);
    expect(params.slice(0, 2)).toEqual([PROJ, "campaign"]);
    expect(valoresDoIn(nomes.where, "entity_id")?.sort()).toEqual([C.hamb, C.legada, C.dg, C.fza1].sort());
  });

  it("o gasto: projeto, campanhas da etapa e a janela, no predicado", async () => {
    await json(`${base}/funil-oferta?${janela}`);
    const [gasto] = consultasA(metaCampaignInsightsDaily);
    const { sql, params } = sqlDe(gasto.where);
    expect(sql).toMatch(/"project_id" = \$1/);
    expect(params[0]).toBe(PROJ);
    expect(sql).toMatch(/"date_start" >= /);
    expect(sql).toMatch(/"date_start" <= /);
    expect(params).toContain(DE);
    expect(params).toContain(ATE);
    expect(valoresDoIn(gasto.where, "campaign_id")?.sort()).toEqual([C.hamb, C.legada, C.dg, C.fza1].sort());
  });

  it("o expert é o do PROJETO (predicado por `project_id`), e o dicionário é o DELE", async () => {
    TABELAS.set(namingExperts, [{ id: "e1", code: "bbe", name: "Barbecue" }]);
    TABELAS.set(namingFunnels, [
      { code: "a01", description: "VSL direto", active: true },
      { code: "a02", description: "Quiz", active: false }, // inativo, mas o DG gasta nele
      { code: "a05", description: "Antigo", active: false }, // inativo sem uso: some
    ]);
    TABELAS.set(namingOffers, [{ code: "of01", description: "R$ 97", active: true }]);
    const r = await json(`${base}/funil-oferta?${janela}`);

    const exp = sqlDe(consultasA(namingExperts)[0].where);
    expect(exp.sql).toMatch(/"naming_experts"."project_id" = \$1/);
    expect(exp.params).toEqual([PROJ]);
    const fun = sqlDe(consultasA(namingFunnels)[0].where);
    expect(fun.sql).toMatch(/"expert_id" = \$1/);
    expect(fun.params).toEqual(["e1"]);
    const ofe = sqlDe(consultasA(namingOffers)[0].where);
    expect(ofe.params).toEqual(["e1"]);

    expect(r.expert).toEqual({ id: "e1", code: "bbe", name: "Barbecue" });
    expect(r.motivoSemExpert).toBeNull();
    expect(r.opcoes.funis).toEqual([
      { codigo: "a01", descricao: "VSL direto", ativo: true },
      { codigo: "a02", descricao: "Quiz", ativo: false },
    ]);
    expect(r.naoCadastrados).toEqual([
      { dimensao: "oferta", codigo: "of03", campanhas: [{ campaignId: C.dg, nome: "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa" }] },
    ]);
  });

  it("o vínculo da Nomenclatura preenche SÓ a dimensão que o nome não traz (e o filtro o usa)", async () => {
    // A legada foi classificada como a02/of02 — o nome diz a01, e o nome vence.
    TABELAS.set(namingCampaigns, [
      {
        c: {
          id: "n1", expertId: "e1", productId: "p1", funnelId: "f1", offerId: "o1", offerValue: "of02", year: "2026",
          temperature: "hot", auction: "cbo", format: "estaticos", landingPageId: null, lpValue: "na", suffix: null,
          name: "bbe_a02_churrasco_of02_perpetuo_2026_hot_cbo_estaticos_na", publishedAt: null, metaCampaignId: C.legada,
          origin: "legado", metaCampaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos", notes: null,
          createdBy: null, createdAt: new Date(), updatedAt: new Date(),
        },
      },
    ]);
    const r = await json(`${base}/funil-oferta?${janela}`);
    const legada = r.campanhas.find((c: { campaignId: string }) => c.campaignId === C.legada);
    expect(legada).toMatchObject({ funil: "a01", origemFunil: "nome", oferta: "of02", origemOferta: "vinculo" });

    invalidarMapa();
    const vendas = await json(`${base}/sales-data?${janela}&oferta=of02`);
    expect(vendas.filtro.campanhas).toEqual([C.legada]);
    expect(vendas.faturamentoBruto).toBe(300 + 70); // bob e joe
  });

  it("guest que não é membro do projeto: 404, como nas vizinhas", async () => {
    expect((await get(`${base}/funil-oferta?${janela}`, "guest")).statusCode).toBe(404);
  });

  it("a rota não recebe filtro e não depende dele: `days` sem datas usa a janela até hoje", async () => {
    const r = await json(`${base}/funil-oferta?days=7`);
    expect(r.janela).toEqual({ since: "2026-09-02", until: "2026-09-08" });
  });
});
