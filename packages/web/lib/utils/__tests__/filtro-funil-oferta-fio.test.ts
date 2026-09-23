/**
 * Story 29.80 — o FIO: o painel, os hooks e o Dicionário usando a regra.
 *
 * Lição do gate de 23/09 (3 de 3 stories): as provas atacavam só funções puras,
 * e cortar o fio no call site — a guarda no componente, o argumento do hook —
 * derrubava ZERO testes. O web roda o vitest em `environment: node` e só coleta
 * `lib/utils/**`, então o componente não monta aqui; lê-se o FONTE, como em
 * `lib/swipe/__tests__/pdf-capa-efeito.test.ts`. É grosseiro de propósito: pega
 * exatamente a palavra que, trocada, faz a tela mentir.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
const painel = ler("../../../components/funnels/perpetual-dashboard.tsx");
const hooks = ler("../../hooks/use-perpetual-sales-data.ts");
const abas = ler("../../../components/nomenclatura/abas.tsx");
const pagina = ler("../../../app/(app)/settings/nomenclatura/page.tsx");

/** O texto da chamada `nome(` até o `);` que a fecha. */
function chamada(fonte: string, nome: string, aPartirDe = 0): string {
  const i = fonte.indexOf(`${nome}(`, aPartirDe);
  expect(i, `${nome}( não encontrado`).toBeGreaterThanOrEqual(0);
  return fonte.slice(i, fonte.indexOf(");", i) + 2);
}

describe("o painel do perpétuo usa o plano do filtro (AC1/AC2/AC7)", () => {
  it("o plano é por TIPO de funil e a rota só é consultada no perpétuo", () => {
    expect(painel).toMatch(/tipoDoFunil: funnel\.type,/);
    expect(chamada(painel, "usePerpetualFunilOferta")).toMatch(/funnel\.type === "perpetual" \? projectId : null/);
  });

  it("PO-02 — `hasCampaigns` sai da lista ORIGINAL da etapa, nunca da filtrada", () => {
    expect(painel).toMatch(/const hasCampaigns = campaignIdsDaEtapa\.length > 0;/);
    expect(painel).toMatch(/const campaignIdsDaEtapa = funnel\.campaigns\.map\(\(c\) => c\.id\);/);
  });

  it("R1 — a lista da mídia é `null` no vazio, e os hooks Meta só a recebem com `temMidia`", () => {
    expect(painel).toMatch(/const campaignIds = idsDaMidia\(planoFunilOferta\.midia\);/);
    expect(painel).toMatch(/const temMidia = hasCampaigns && !midiaVazia;/);
    expect(painel).toMatch(/const metaProjectId = temMidia \? projectId : null;/);
    // Nenhum consumidor recebe a lista pela guarda antiga (que deixaria passar o vazio).
    expect(painel).not.toMatch(/hasCampaigns \? campaignIds/);
    expect(painel).not.toMatch(/hasCampaigns \? tableFilter/);
    expect(painel).not.toMatch(/hasCampaigns \? "ad"/);
    for (const hook of ["useTrafficOverview", "useAllAdSets", "useAllAds", "useCampaignDailyInsightsBulk"]) {
      expect(chamada(painel, hook), hook).toMatch(/temMidia \? campaignIds : null/);
    }
    // as duas séries por entidade (Detalhamento e LPs)
    const primeira = chamada(painel, "useEntityDaily");
    const segunda = chamada(painel, "useEntityDaily", painel.indexOf(primeira) + primeira.length);
    for (const c of [primeira, segunda]) expect(c).toMatch(/temMidia \? campaignIds : null/);
  });

  it("R1 — camadas de vídeo e Top criativos NUNCA recebem a lista vazia", () => {
    // `useCamadasDeVideo([])` busca o projeto inteiro: no vazio, a seção não monta.
    expect(painel).toMatch(/\{campaignIds === null \? \([\s\S]{0,300}\) : \(\s*<CamadasDeVideoSection projectId=\{projectId\} campaignIds=\{campaignIds\} \/>/);
    expect(painel).toMatch(/\{temMidia && campaignIds && \(\s*<TopCreativesGallery/);
  });

  it("filtro sem campanha: mídia ZERO medida nos cards, não 'carregando'", () => {
    expect(painel).toMatch(/midia: overview \? \{ totalSpend: overview\.totalSpend \} : midiaVazia \? \{ totalSpend: 0 \} : null,/);
  });

  it("AC2/AC7 — as QUATRO leituras de vendas recebem o recorte do plano", () => {
    expect(painel).toMatch(/const recorteDeVendas = planoFunilOferta\.recorteDeVendas;/);
    for (const hook of ["usePerpetualSalesData", "usePerpetualHourly", "usePerpetualSalesDataDaily", "usePerpetualSalesDataDailyByEntity"]) {
      // `usePerpetualSalesData(` também casa o começo de `usePerpetualSalesDataDaily(` — o `(` desempata.
      expect(chamada(painel, hook), hook).toMatch(/recorteDeVendas,?\s*\)/);
    }
  });

  it("AC3 — selo 'não filtrado' na Ascensão e na seção Vendas; comparativo oculto com filtro", () => {
    expect(painel).toMatch(/<SeloNaoFiltrado ativo=\{filtroFunilOfertaAtivo\} motivo=\{`Ascensão: /);
    expect(painel).toMatch(/<SeloNaoFiltrado ativo=\{filtroFunilOfertaAtivo\} motivo=\{`Vendas de Captação e Produto Principal: /);
    expect(painel).toMatch(/comparison=\{!filtroFunilOfertaAtivo && compSpend !== null/);
  });

  it("AC4/AC5 — o painel do aviso recebe o `foraDoFiltro` e guest não recebe link", () => {
    const c = painel.slice(painel.indexOf("<PainelDoFiltroFunilOferta"), painel.indexOf("/>", painel.indexOf("<PainelDoFiltroFunilOferta")));
    expect(c).toMatch(/foraDoFiltro=\{salesData\?\.foraDoFiltro\}/);
    expect(c).toMatch(/comLink=\{papel !== null && papel !== "guest"\}/);
    expect(c).toMatch(/vendasRespeitaramOFiltro=\{vendasRespeitaramORecorte\(salesData, recorteDeVendas\)\}/);
  });
});

describe("os quatro hooks de vendas mandam o recorte (PO-11)", () => {
  it("URL e queryKey levam o recorte nos quatro", () => {
    expect(hooks.match(/\$\{sufixoDoRecorte\(recorte\)\}/g)).toHaveLength(4);
    expect(hooks.match(/\.\.\.chaveDoRecorte\(recorte\)/g)).toHaveLength(4);
    expect(hooks.match(/recorte\?: RecorteDeVendas,/g)).toHaveLength(4);
  });
});

describe("AC6 — o Dicionário respeita `?expertId=` em Funis e Ofertas", () => {
  it("a aba aplica o parâmetro com `expertInicialDaUrl` quando a lista de experts chega", () => {
    const aba = abas.slice(abas.indexOf("export function AbaFunisOuOfertas"), abas.indexOf("export function AbaLps"));
    expect(aba).toMatch(/expertInicial\?: string \| null/);
    expect(aba).toMatch(/setExpertId\(expertInicialDaUrl\(expertInicial, experts\.data\)\)/);
  });

  it("a página passa o `expertId` da URL às duas abas", () => {
    expect(pagina).toMatch(/<AbaFunisOuOfertas recurso="funis" podeEditar=\{podeEditar\} expertInicial=\{params\.get\("expertId"\)\} \/>/);
    expect(pagina).toMatch(/<AbaFunisOuOfertas recurso="ofertas" podeEditar=\{podeEditar\} expertInicial=\{params\.get\("expertId"\)\} \/>/);
  });
});
