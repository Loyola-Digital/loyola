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
const componente = ler("../../../components/funnels/perpetual-filtro-funil-oferta.tsx");

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

  it("TEST-001 (gate) — a lista da ETAPA só aparece onde deve: a declaração, o plano e `hasCampaigns`", () => {
    // Qualquer outro consumidor que a leia (Top criativos, a base do
    // Quente/Frio e da tabela por campanha) mostraria a etapa inteira com o
    // filtro ativo. `funnel.campaigns.map(` fora da declaração é o mesmo desvio.
    const usos = painel.split("\n").filter((l) => /\bcampaignIdsDaEtapa\b/.test(l)).map((l) => l.trim());
    expect(usos).toEqual([
      "const campaignIdsDaEtapa = funnel.campaigns.map((c) => c.id);",
      "campaignIdsDaEtapa,",
      "const hasCampaigns = campaignIdsDaEtapa.length > 0;",
    ]);
    expect(painel.match(/funnel\.campaigns\.map\(/g)).toHaveLength(1);
  });

  it("TEST-001 (gate) — Top criativos recebe a lista da MÍDIA (estreitada), não a da etapa", () => {
    const i = painel.indexOf("<TopCreativesGallery");
    const bloco = painel.slice(i, painel.indexOf("/>", i));
    expect(bloco).toMatch(/\bcampaignIds=\{campaignIds\}/);
  });

  it("TEST-001 (gate) — a base do Quente/Frio e da tabela por campanha (`campaignIdSet`) é a lista da MÍDIA", () => {
    expect(painel).toMatch(/const campaignIdSet = new Set\(campaignIds \?\? \[\]\);/);
    // e é ela que recorta as campanhas do overlay por campanha
    expect(painel).toMatch(/campaignData\.campaigns\.filter\(\(c\) => campaignIdSet\.has\(c\.campaignId\)\)/);
  });

  it("REQ-001 (gate) — o plano recebe o ESTADO da planilha (carregando / sem planilha / sem coluna), não um booleano", () => {
    expect(painel).toMatch(/const consultaDaPlanilha = usePerpetualSpreadsheet\(projectId, funnel\.id\);/);
    expect(painel).toMatch(
      /planilhaDeVendas: estadoDaPlanilhaDeVendas\(\{ dados: perpetualSpreadsheet, falhou: consultaDaPlanilha\.isError \}\),/,
    );
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

describe("TEST-002 (gate) — o componente do aviso desenha o que a regra monta (AC3/AC4/AC5)", () => {
  const painelDoAviso = componente.slice(componente.indexOf("export function PainelDoFiltroFunilOferta"));

  it("AC4 — a regra 'tudo separado' e as unidades aparecem no aviso", () => {
    expect(painelDoAviso).toMatch(/<p className="[^"]*">\{aviso\.regra\}<\/p>/);
    expect(painelDoAviso).toMatch(/<p className="[^"]*">\{aviso\.unidades\}<\/p>/);
  });

  it("AC3 — o selo 'planilha sem utm_campaign' segue o plano, com o motivo declarado", () => {
    expect(painelDoAviso).toMatch(
      /<SeloNaoFiltrado ativo=\{plano\.vendasNaoFiltraveis\} motivo=\{`Vendas e faturamento: \$\{NAO_FILTRADO\.planilhaSemUtm\}\.`\} \/>/,
    );
    // e o selo só desenha quando ativo
    const selo = componente.slice(componente.indexOf("export function SeloNaoFiltrado"), componente.indexOf("export function PainelDoFiltroFunilOferta"));
    expect(selo).toMatch(/if \(!ativo\) return null;/);
  });

  it("AC4 — as vendas fora e o gasto sem a dimensão vêm do `montarAvisoDoFiltro`", () => {
    expect(painelDoAviso).toMatch(/montarAvisoDoFiltro\(\{ filtro, foraDoFiltro, campanhas: dados\.campanhas, comLink \}\)/);
    expect(painelDoAviso).toMatch(/aviso\.vendas\.map\(/);
    expect(painelDoAviso).toMatch(/aviso\.campanhas\.map\(/);
    expect(painelDoAviso).toMatch(/!vendasRespeitaramOFiltro &&/);
  });

  it("AC5/PO-03 — a sinalização só vira link com `href`; sem ele (guest), o texto sem link", () => {
    const linha = componente.slice(componente.indexOf("function LinhaDeSinalizacao"), componente.indexOf("export function SeloNaoFiltrado"));
    expect(linha).toMatch(/\{s\.href \? \(\s*<Link href=\{s\.href\}/);
    expect(linha).toMatch(/\) : \(\s*<span className="[^"]*">\(\{s\.acao\} — peça a quem administra o projeto\)<\/span>/);
  });
});
