/**
 * Story 18.83 — o FIO entre as funções puras e a tela.
 *
 * Lição do gate de 2026-09-23: as provas diferenciais atacavam só as funções
 * puras, e cortar a ligação no call site derrubava zero testes. Hooks
 * (`lib/hooks`) e componentes de `components/funnels` não são coletados pelo
 * vitest do web, então a ligação é conferida no FONTE — grosseiro, mas pega
 * exatamente a regressão que importa (padrão de `pdf-capa-efeito.test.ts`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf-8");

describe("useLpPerformanceData — a tabela usa a URL do anúncio quando a API manda", () => {
  const hook = fonte("lib/hooks/useLpPerformanceData.ts");

  it("com `lpPorAnuncio`, monta as linhas por URL com a correção da etapa e os leads por anúncio", () => {
    const chamada = hook.slice(hook.indexOf("montarLinhasDeLpPorUrl({"), hook.indexOf("montarLinhasDeLpPorUrl({") + 300);
    expect(chamada).toMatch(/lpPorAnuncio,/);
    expect(chamada).toMatch(/correcoes,/);
    expect(chamada).toMatch(/leadsPorAnuncio: leadsQuery\.leadsPagosPorAnuncio/);
    expect(chamada).toMatch(/publico: publicoFilter/);
  });

  it("a correção vem da ETAPA (`lpCampaignUrls`)", () => {
    expect(hook).toMatch(/stage\?\.lpCampaignUrls/);
  });

  it("o memo depende da correção e dos leads por anúncio (senão a tela não reage)", () => {
    const deps = hook.slice(hook.lastIndexOf("}, ["), hook.lastIndexOf("]);"));
    expect(deps).toMatch(/correcoes/);
    expect(deps).toMatch(/leadsQuery\.leadsPagosPorAnuncio/);
    expect(deps).toMatch(/lpPorAnuncio/);
  });
});

describe("useCrossReferenceLeads chama a contagem testada", () => {
  it("o memo da contagem é `contarLeadsDaPlanilha`, e o resultado expõe os leads por anúncio", () => {
    const hook = fonte("lib/hooks/useCrossReferenceLeads.ts");
    expect(hook).toMatch(/contarLeadsDaPlanilha\(sheetQuery\.data/);
    expect(hook).toMatch(/leadsPagosPorAnuncio: result\.leadsPagosPorAnuncio/);
  });
});

describe("useLpFunnelView chama a visão testada", () => {
  it("o hook devolve `montarVisaoDoLpFunnel(data)`", () => {
    expect(fonte("lib/hooks/use-sales-journey.ts")).toMatch(/return montarVisaoDoLpFunnel\(data\);/);
  });
});

describe("lp-performance-table — link puro, sem lápis, card pela URL", () => {
  const tabela = fonte("lib/components/funnels/lp-performance-table.tsx");

  it("no modo URL a célula é `LpUrlCell`; o lápis (`LpNameCell`) só existe no modo rótulo (AC6)", () => {
    // Mutação: renderizar `LpNameCell` sempre → o lápis volta nas linhas de URL.
    expect(tabela).toMatch(/\{modoUrl \? \(\s*\/\/[^\n]*\n\s*<LpUrlCell row=\{row\} onSalvarCorrecao=\{onSalvarCorrecao\} \/>\s*\) : \(/);
  });

  it("o card do mini-funil casa pela chave da linha via `chaveDoCardDaLp` (AC9)", () => {
    expect(tabela).toMatch(/funil=\{funnelByLp\?\.\[chaveDoCardDaLp\(id\)\] \?\? null\}/);
    expect(tabela).not.toMatch(/funnelByLp\?\.\[row\.lpName\.toUpperCase\(\)\]/);
  });

  it("a correção por campanha aparece na linha 'Sem link resolvido'", () => {
    expect(tabela).toMatch(/<CorrecaoPorCampanha campanhas=\{row\.semLink\.campanhas\} onSalvar=\{onSalvarCorrecao\} \/>/);
  });

  it("tooltips descrevem a URL no modo URL (PO-02)", () => {
    expect(tabela).toMatch(/modoUrl\s*\?\s*\{ \.\.\.COLUMN_TOOLTIPS, \.\.\.COLUMN_TOOLTIPS_POR_URL \}/);
  });
});

describe("dashboards — correção ligada, guest fora", () => {
  for (const arquivo of ["components/funnels/launch-dashboard.tsx", "components/funnels/meta-ads-teste-section.tsx"]) {
    it(`${arquivo}: passa a correção à tabela só para quem não é guest`, () => {
      const f = fonte(arquivo);
      expect(f).toMatch(/onSalvarCorrecao=\{papel && papel !== "guest" \? handleSalvarCorrecao : undefined\}/);
      expect(f).toMatch(/useSalvarCorrecaoDeLp\(projectId, funnelId, stageId\)/);
    });
  }

  it("useSalvarCorrecaoDeLp grava `lpCampaignUrls` mesclado e invalida o mini-funil", () => {
    const f = fonte("lib/hooks/use-funnel-stages.ts");
    expect(f).toMatch(/mutateAsync\(\{ lpCampaignUrls: mesclarCorrecao\(atuais, campaignId, url\) \}\)/);
    expect(f).toMatch(/invalidateQueries\(\{ queryKey: \["lp-funnel", projectId, funnelId, stageId\] \}\)/);
  });
});
