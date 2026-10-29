/**
 * Story 18.100 — o FIO: os sete pontos de leitura do web usando a regra.
 *
 * O vitest do web roda em `node` e só coleta `lib/utils/**`; hook e componente
 * não montam aqui. Lê-se o FONTE, como em `filtro-funil-oferta-fio.test.ts`:
 * pega exatamente a troca que faria a tela voltar a ler uma planilha só.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chaveDosDadosDaPlanilha } from "@/lib/hooks/use-planilhas-de-leads";

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
const ponto1 = ler("../../hooks/use-crossed-funnel-metrics.ts");
const ponto2 = ler("../../../components/funnels/leads-by-utm-table.tsx");
const galeria = ler("../../../components/funnels/top-creatives-gallery.tsx");
const desempenho = ler("../../hooks/useStageCreativePerformance.ts");
const ponto4 = ler("../../hooks/useCrossReferenceLeads.ts");
const ponto5 = ler("../../hooks/use-survey-aggregation.ts");
const hookDeDados = ler("../../hooks/use-funnel-spreadsheets.ts");
const hookNovo = ler("../../hooks/use-planilhas-de-leads.ts");

/** O texto da chamada `nome(` até o `);` que a fecha. */
function chamada(fonte: string, nome: string, aPartirDe = 0): string {
  const i = fonte.indexOf(`${nome}(`, aPartirDe);
  expect(i, `${nome}( não encontrado`).toBeGreaterThanOrEqual(0);
  return fonte.slice(i, fonte.indexOf(");", i) + 2);
}

describe("Story 18.100 — a leitura de N planilhas divide o cache com a de hoje", () => {
  it("a chave é a mesma de `useFunnelSpreadsheetData` sem filtro", () => {
    expect(hookDeDados).toMatch(
      /function dataKey\(projectId: string, funnelId: string, id: string\) \{\s*return \["funnel-spreadsheets", projectId, funnelId, id, "data"\] as const;/,
    );
    expect(chaveDosDadosDaPlanilha("p", "f", "i")).toEqual(["funnel-spreadsheets", "p", "f", "i", "data"]);
    expect(hookNovo).toMatch(/queryKey: chaveDosDadosDaPlanilha\(projectId, funnelId, p\.id\),/);
  });

  it("a URL é a da rota `/data`, SEM `campaignName` (AC4b)", () => {
    expect(hookNovo).toMatch(/`\/api\/projects\/\$\{projectId\}\/funnels\/\$\{funnelId\}\/spreadsheets\/\$\{p\.id\}\/data`/);
    const leitura = chamada(hookNovo, "apiClient<FunnelSpreadsheetData>");
    expect(leitura).not.toMatch(/campaignName|\?/);
  });
});

describe("Story 18.100 — ponto 1: a planilha de leads sem filtro de campanha (AC4b)", () => {
  it("as `leads` vêm pela união, sem `campaignNames`", () => {
    const leads = chamada(ponto1, "useDadosDasPlanilhasDeLeads");
    expect(leads).not.toMatch(/campaignNames/);
    expect(leads).toMatch(/semPlanilhaDeLeads \? \[\] : planilhasDosLeads/);
  });

  // Story 18.101 (AC2): este era o fio que a 18.100 deixou para a 18.101 — as
  // duas chamadas tinham `campaignNames`. Invertido: nenhuma das duas manda
  // filtro ao servidor; o recorte é em memória (ver `recorte-de-campanha-18101`).
  it("o fallback (etapa sem `leads`) e a de vendas são lidos SEM `campaignNames` (Story 18.101, AC2)", () => {
    const primeira = chamada(ponto1, "useFunnelSpreadsheetData");
    expect(primeira).toMatch(/semPlanilhaDeLeads \? planilhasDosLeads\[0\]\.id : undefined,\s*\);/);
    expect(primeira).not.toMatch(/campaignNames|campaignName/);
    const segunda = chamada(ponto1, "useFunnelSpreadsheetData", ponto1.indexOf(primeira) + primeira.length);
    expect(segunda).toMatch(/useFunnelSpreadsheetData\(projectId, funnel\.id, salesSheet\?\.id\);/);
    expect(segunda).not.toMatch(/campaignNames|campaignName/);
  });

  it("o card lê a união; o fallback só quando não há `leads`", () => {
    expect(ponto1).toMatch(/const sheetData = semPlanilhaDeLeads \? fallbackData : leadsDaEtapa\.data;/);
    expect(ponto1).toMatch(/escolherPlanilhasDeLeads\(spreadsheetsData\?\.spreadsheets\)/);
  });

  it("AC4e: o pixel decide pela guarda `lpsParaOPixel`, não pelo `lpsDaPlanilha` cru", () => {
    expect(ponto1).toMatch(/campanhasSemFormulario\(funnel\.campaigns, lpsParaOPixel\(sheetData\.rows\)\)/);
    expect(ponto1).not.toMatch(/lpsDaPlanilha\(/);
  });
});

describe("Story 18.100 — os pontos 2 a 5 usam a mesma escolha (AC1, AC2)", () => {
  it("nenhum deles volta a pegar só a primeira `leads`", () => {
    for (const [nome, fonte] of Object.entries({ ponto1, ponto2, galeria, desempenho, ponto4, ponto5 })) {
      expect(fonte, nome).not.toMatch(/\.find\(\(s\) => s\.type === "leads"\)/);
      expect(fonte, nome).not.toMatch(/escolherPlanilhaDeLeads\(/);
    }
  });

  it("ponto 2 e ponto 3 (as duas telas da 18.89): `escolherPlanilhasDeLeads` + a união", () => {
    for (const [nome, fonte] of Object.entries({ ponto2, galeria, desempenho })) {
      expect(fonte, nome).toMatch(/escolherPlanilhasDeLeads\(/);
      expect(fonte, nome).toMatch(/useDadosDasPlanilhasDeLeads\(/);
    }
    expect(galeria).toMatch(/escolherPlanilhasDeLeads\(spreadsheetsData\?\.spreadsheets\)/);
    expect(desempenho).toMatch(/escolherPlanilhasDeLeads\(planilhasDaEtapa\.data\?\.spreadsheets\)/);
  });

  it("ponto 5: as `leads` sem fallback", () => {
    expect(chamada(ponto5, "useDadosDasPlanilhasDeLeads")).toMatch(/planilhasDeLeadsDaEtapa\(spreadsheets\)/);
  });

  it("ponto 4: as `leads` no layout comum pelo `column_mapping`; sem `leads`, a de vendas como hoje", () => {
    expect(ponto4).toMatch(/planilhasDeLeadsDaEtapa\(spreadsheetsQuery\.data\?\.spreadsheets\)/);
    expect(ponto4).toMatch(/contagem: unirAbasCruasDeLeads\(fontes, CAMPOS_DO_PONTO_4\)/);
    expect(ponto4).toMatch(/const fontes = planilhasDeLeads\.map\(\(p, i\) => \(\{/);
    expect(ponto4).toMatch(/columnMapping: p\.columnMapping/);
    expect(ponto4).toMatch(/const planilhaParaContar = semPlanilhaDeLeads \? salesSheetQuery\.data : leadsUnidos\?\.contagem;/);
    expect(chamada(ponto4, "contarLeadsDaPlanilha")).toMatch(/planilhaParaContar/);
  });
});
