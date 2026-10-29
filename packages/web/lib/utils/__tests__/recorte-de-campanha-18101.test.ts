/**
 * Story 18.101 — o recorte da planilha de vendas pelas campanhas da etapa.
 *
 * - AC1: a regra (`passaNoRecorteDasCampanhas`, módulo folha do shared), pelo
 *   subpath que o web usa (19.14). O shared não tem runner próprio: o teste mora
 *   aqui, onde o vitest do web coleta (`lib/utils/**`).
 * - AC3: o Hot/Cold de compradores com a composição do hook (recorte → janela →
 *   agregador), com as funções reais.
 * - AC2/AC5c: o FIO, lendo o fonte (o vitest do web roda em `node` e não monta
 *   hook), como em `planilhas-de-leads-fio-18100.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  passaNoRecorteDasCampanhas,
  type CampanhaDoRecorte,
} from "@loyola-x/shared/src/utm-value";
import { chaveDosDadosDaPlanilha } from "@/lib/hooks/use-planilhas-de-leads";
import { aggregateHotColdByUtmTerm } from "@/lib/utils/funnel-metrics";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import type {
  FunnelSpreadsheetData,
  FunnelSpreadsheetRow,
} from "@/lib/types/funnel-spreadsheet";

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

const ID_DA_ETAPA = "120249689901480208";
const ID_DE_OUTRA = "120249000000000000";
const NOME_DA_ETAPA = "dg-bf26 — Captação Gratuita — hot";
const ETAPA: CampanhaDoRecorte[] = [
  { id: ID_DA_ETAPA, name: NOME_DA_ETAPA },
  { id: "120249688590340208", name: "dg-bf26 — Captação Gratuita — cold" },
];

describe("Story 18.101 — AC1: o recorte tira só a linha de outra campanha", () => {
  const CASOS: [string, string | undefined, boolean][] = [
    ["id da etapa puro", ID_DA_ETAPA, true],
    ["id da etapa com `c:`", `c:${ID_DA_ETAPA}`, true],
    ["id da etapa com `_` (Sheets)", `_${ID_DA_ETAPA}`, true],
    ["id da etapa com `c:_`", `c:_${ID_DA_ETAPA}`, true],
    ["id da etapa com espaços nas pontas", `  ${ID_DA_ETAPA} `, true],
    ["id de outra campanha puro", ID_DE_OUTRA, false],
    ["id de outra campanha com `c:`", `c:${ID_DE_OUTRA}`, false],
    ["id de outra campanha com `_`", `_${ID_DE_OUTRA}`, false],
    ["nome da etapa", NOME_DA_ETAPA, true],
    ["nome da etapa com espaços nas pontas", `   ${NOME_DA_ETAPA}  `, true],
    ["tag do lançamento", "dgbf26", true],
    ["tag com hífen", "dg-pg04", true],
    ["vazio", "", true],
    ["só espaços", "   ", true],
    ["`utm_campaign` ausente", undefined, true],
    ["`c:abc` (resto não numérico, fica texto)", "c:abc", true],
    ["par entre chaves da n8n", '{"fzm3-set26","fzm3-set26"}', true],
  ];

  it.each(CASOS)("%s (`%s`) → passa? %s", (_nome, valor, esperado) => {
    expect(passaNoRecorteDasCampanhas(valor, ETAPA)).toBe(esperado);
  });

  it("valor só de dígitos é id pelo AC1, mesmo curto: sai se não for da etapa (T0: nenhum caso)", () => {
    expect(passaNoRecorteDasCampanhas("2026", ETAPA)).toBe(false);
    expect(passaNoRecorteDasCampanhas("dg2026", ETAPA)).toBe(true);
  });

  it("`null` vale como ausente: passa", () => {
    expect(passaNoRecorteDasCampanhas(null, ETAPA)).toBe(true);
  });

  it("etapa sem campanhas: não há recorte, todas as linhas passam (inclusive id)", () => {
    for (const [, valor] of CASOS) expect(passaNoRecorteDasCampanhas(valor, [])).toBe(true);
    expect(passaNoRecorteDasCampanhas(ID_DE_OUTRA, [])).toBe(true);
  });

  it("campanha com `id` vazio não cria o id `\"\"` no conjunto", () => {
    const comIdVazio: CampanhaDoRecorte[] = [{ id: "", name: "x" }, { id: "   ", name: "y" }, { name: "z" }, { id: null }];
    // Nenhum id cadastrado: qualquer id é de outra campanha.
    expect(passaNoRecorteDasCampanhas(ID_DA_ETAPA, comIdVazio)).toBe(false);
    expect(passaNoRecorteDasCampanhas("c:0", comIdVazio)).toBe(false);
    // Vazio continua passando pela regra 1, não por um id `""`.
    expect(passaNoRecorteDasCampanhas("", comIdVazio)).toBe(true);
    // O nome de uma delas segue passando.
    expect(passaNoRecorteDasCampanhas("x", comIdVazio)).toBe(true);
  });

  it("o id da campanha também é comparado por `normalizeNumericId` (`_` e espaços)", () => {
    const etapaComSublinhado: CampanhaDoRecorte[] = [{ id: ` _${ID_DA_ETAPA} `, name: "a" }];
    expect(passaNoRecorteDasCampanhas(ID_DA_ETAPA, etapaComSublinhado)).toBe(true);
    expect(passaNoRecorteDasCampanhas(`c:${ID_DA_ETAPA}`, etapaComSublinhado)).toBe(true);
  });

  it("nome com `trim` nos dois lados; nome de campanha vazio não casa com nada", () => {
    const etapa: CampanhaDoRecorte[] = [{ id: ID_DA_ETAPA, name: `  ${NOME_DA_ETAPA}  ` }, { id: "1", name: "" }];
    expect(passaNoRecorteDasCampanhas(NOME_DA_ETAPA, etapa)).toBe(true);
  });
});

/** Uma linha da rota `/data`: `named` com as chaves canônicas. */
function linha(utm_campaign: string | undefined, utm_term: string): FunnelSpreadsheetRow {
  const named: FunnelSpreadsheetRow["named"] = { utm_term };
  if (utm_campaign !== undefined) named.utm_campaign = utm_campaign;
  return { values: [], named } as FunnelSpreadsheetRow;
}

/** A composição do hook (`use-crossed-funnel-metrics.ts`): recorte → janela → agregador. */
function hotColdDoHook(dados: FunnelSpreadsheetData, campanhas: CampanhaDoRecorte[], days = 90) {
  const recortada = {
    ...dados,
    rows: dados.rows.filter((r) => passaNoRecorteDasCampanhas(r.named.utm_campaign, campanhas)),
  };
  return aggregateHotColdByUtmTerm(filterSheetRowsByDays(recortada, days));
}

describe("Story 18.101 — AC3: o Hot/Cold de compradores só perde a linha de outra campanha", () => {
  const vendas: FunnelSpreadsheetData = {
    headers: ["c=", "t="],
    mapping: { utm_campaign: "c=", utm_term: "t=" },
    totalRows: 10,
    rows: [
      linha(ID_DA_ETAPA, "hot-lal"), // id da etapa → entra (hot)
      linha(`c:${ID_DA_ETAPA}`, "cold-int"), // `c:` da etapa → entra (cold)
      linha(`_${ID_DA_ETAPA}`, "aberto"), // `_` da etapa → entra (outros)
      linha(`  ${NOME_DA_ETAPA} `, "HOT"), // nome da etapa → entra (hot)
      linha("dgbf26", "cold"), // tag → entra (cold)
      linha("", "org"), // vazio → entra (outros)
      linha(undefined, "hot"), // ausente → entra (hot)
      linha(ID_DE_OUTRA, "hot"), // id de outra campanha → SAI
      linha(`c:${ID_DE_OUTRA}`, "cold"), // `c:` de outra campanha → SAI
      linha("c:abc", "x"), // texto → entra (outros)
    ],
  } as FunnelSpreadsheetData;

  it("resultado exato por categoria (hot, cold, outros)", () => {
    const r = hotColdDoHook(vendas, ETAPA);
    expect({ hot: r.hot, cold: r.cold, outros: r.outros, total: r.total }).toEqual({
      hot: 3,
      cold: 2,
      outros: 3,
      total: 8,
    });
  });

  it("a diferença para a planilha inteira é exatamente as 2 linhas de id de outra campanha", () => {
    const inteira = aggregateHotColdByUtmTerm(filterSheetRowsByDays(vendas, 90));
    const recortada = hotColdDoHook(vendas, ETAPA);
    expect(inteira.total - recortada.total).toBe(2);
    expect(inteira.hot - recortada.hot).toBe(1);
    expect(inteira.cold - recortada.cold).toBe(1);
    expect(inteira.outros - recortada.outros).toBe(0);
  });

  it("não zera onde a venda só traz tag ou vazio (o 43 e o 68 da T0)", () => {
    const soTagEVazio = {
      ...vendas,
      rows: [linha("dgpg02", "hot"), linha("", "cold"), linha("", "x"), linha('{"org","org"}', "y")],
    } as FunnelSpreadsheetData;
    expect(hotColdDoHook(soTagEVazio, ETAPA).total).toBe(4);
  });

  it("etapa sem campanhas: o mesmo número da planilha inteira", () => {
    expect(hotColdDoHook(vendas, [])).toEqual(aggregateHotColdByUtmTerm(filterSheetRowsByDays(vendas, 90)));
  });
});

const hook = ler("../../hooks/use-crossed-funnel-metrics.ts");
const hookDeDados = ler("../../hooks/use-funnel-spreadsheets.ts");
const indiceDoShared = ler("../../../../shared/src/index.ts");
const moduloDoShared = ler("../../../../shared/src/utm-value.ts");

/** O texto da chamada `nome(` até o `);` que a fecha. */
function chamada(fonte: string, nome: string, aPartirDe = 0): string {
  const i = fonte.indexOf(`${nome}(`, aPartirDe);
  expect(i, `${nome}( não encontrado`).toBeGreaterThanOrEqual(0);
  return fonte.slice(i, fonte.indexOf(");", i) + 2);
}

describe("Story 18.101 — AC2: nenhuma leitura de planilha manda filtro ao servidor", () => {
  it("o hook não passa `campaignNames` a `useFunnelSpreadsheetData`", () => {
    expect(hook).not.toMatch(/campaignNames/);
    const primeira = chamada(hook, "useFunnelSpreadsheetData");
    const segunda = chamada(hook, "useFunnelSpreadsheetData", hook.indexOf(primeira) + primeira.length);
    for (const c of [primeira, segunda]) expect(c).not.toMatch(/campaignName/);
    expect(segunda).toMatch(/salesSheet\?\.id\);/);
  });

  it("`useFunnelSpreadsheetData` não tem o parâmetro e não monta `campaignName` na URL", () => {
    const i = hookDeDados.indexOf("export function useFunnelSpreadsheetData(");
    expect(i).toBeGreaterThanOrEqual(0);
    const corpo = hookDeDados.slice(i);
    expect(corpo).not.toMatch(/campaignName|URLSearchParams/);
    expect(corpo).toMatch(
      /\(\s*projectId: string,\s*funnelId: string,\s*id: string \| null \| undefined,\s*\)/,
    );
    expect(corpo).toMatch(/`\/api\/projects\/\$\{projectId\}\/funnels\/\$\{funnelId\}\/spreadsheets\/\$\{id\}\/data`/);
  });

  it("a chave segue `dataKey(id)`, igual a `chaveDosDadosDaPlanilha`", () => {
    expect(hookDeDados).toMatch(/queryKey: dataKey\(projectId, funnelId, id \?\? ""\),/);
    expect(hookDeDados).toMatch(
      /function dataKey\(projectId: string, funnelId: string, id: string\) \{\s*return \["funnel-spreadsheets", projectId, funnelId, id, "data"\] as const;/,
    );
    expect(chaveDosDadosDaPlanilha("p", "f", "i")).toEqual(["funnel-spreadsheets", "p", "f", "i", "data"]);
  });

  it("as invalidações seguem pela mesma `dataKey`", () => {
    expect(hookDeDados).toMatch(/qc\.invalidateQueries\(\{ queryKey: dataKey\(projectId, funnelId, variables\.id\) \}\);/);
    expect(hookDeDados).toMatch(/qc\.invalidateQueries\(\{ queryKey: dataKey\(projectId, funnelId, id\) \}\);/);
  });
});

describe("Story 18.101 — AC1/AC5c: o hook recorta vendas e fallback em memória; leads não", () => {
  const RECORTE = /\.rows\.filter\(\(r\) =>\s*passaNoRecorteDasCampanhas\(r\.named\.utm_campaign, funnel\.campaigns\),?\s*\)/;

  it("importa a regra pelo subpath do shared (19.14)", () => {
    expect(hook).toMatch(/import \{ passaNoRecorteDasCampanhas \} from "@loyola-x\/shared\/src\/utm-value";/);
  });

  it("a de vendas é recortada antes de chegar à janela e aos agregadores", () => {
    expect(hook).toMatch(new RegExp(`const salesSheetData = useMemo\\([\\s\\S]*?salesBruto${RECORTE.source}`));
    expect(hook).not.toMatch(/filterSheetRowsByDays\(salesBruto/);
    expect(hook).toMatch(/filterSheetRowsByDays\(salesSheetData, days\)/);
  });

  it("o fallback (etapa sem `leads`) aplica a mesma regra (AC5c)", () => {
    expect(hook).toMatch(new RegExp(`const fallbackData = useMemo\\([\\s\\S]*?fallbackBruto${RECORTE.source}`));
    expect(hook).toMatch(/const sheetData = semPlanilhaDeLeads \? fallbackData : leadsDaEtapa\.data;/);
  });

  it("as planilhas de leads não são recortadas (AC5a, 18.100 P-6 (y))", () => {
    expect(chamada(hook, "useDadosDasPlanilhasDeLeads")).toMatch(/semPlanilhaDeLeads \? \[\] : planilhasDosLeads/);
    expect(hook.match(/passaNoRecorteDasCampanhas\(/g)).toHaveLength(2);
    expect(hook).not.toMatch(/leadsDaEtapa\.data\.rows\.filter/);
  });
});

describe("Story 18.101 — o lugar da regra: módulo folha do shared (AC1, 19.14)", () => {
  it("`utm-value.ts` segue sem nenhum import", () => {
    expect(moduloDoShared).not.toMatch(/^\s*import\s/m);
  });

  it("o índice do shared reexporta a regra", () => {
    expect(indiceDoShared).toMatch(/passaNoRecorteDasCampanhas,[\s\S]*?\} from "\.\/utm-value\.js";/);
  });
});
