import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Story 42.17 (AC1a, AC1b, AC3d, AC3e, AC4b) — o FIO da tela, lendo o fonte
 * (o padrão da 42.13 a 42.16): onde a tabela entra e de onde vêm os insumos.
 */
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
const tabela = ler("../../../components/funnels/lyrio-dados-diarios.tsx");
const conta = ler("../dados-diarios-lyrio.ts");
const semComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const jsx = semComentarios(etapa);
const chamada = jsx.slice(jsx.indexOf("<LyrioDadosDiarios"), jsx.indexOf("/>", jsx.indexOf("<LyrioDadosDiarios")));

describe("AC1a — logo abaixo do Resumo, antes do bloco Meta Ads", () => {
  it("uma vez só, entre a grade do Resumo e `<LyrioBlocoDoCanal canal=\"meta\"`", () => {
    expect(jsx.match(/<LyrioDadosDiarios\b/g)).toHaveLength(1);
    const resumo = jsx.indexOf("<GradeDoResumo cards={cardsResumo} />");
    const fimDoResumo = jsx.indexOf("</section>", resumo);
    const aqui = jsx.indexOf("<LyrioDadosDiarios");
    const meta = jsx.indexOf('<LyrioBlocoDoCanal canal="meta"');
    expect(resumo).toBeGreaterThan(0);
    expect(fimDoResumo).toBeLessThan(aqui);
    expect(aqui).toBeLessThan(meta);
  });
});

describe("AC1b/AC3d/AC4b — os MESMOS insumos do Resumo, sem consulta nova", () => {
  it("o filtro de dias, o hoje de SP e o serieDesde do Resumo", () => {
    expect(chamada).toMatch(/ctx: \{ diasDoFiltro: days, hoje, serieDesde \}/);
    expect(chamada).toMatch(/serieCarregando: pagantesFiltro\.tipo === "carregando"/);
    // QA REL-002a — a causa da série desconhecida sai dos MESMOS pagantes do filtro
    expect(chamada).toMatch(/serieDesconhecida: causaDaSerieDesconhecida\(pagantesFiltro\)/);
  });
  it("a Meta é a consulta do filtro do card; o Google, o tráfego na régua; as vendas, o estado dos blocos; o câmbio, o do Resumo", () => {
    expect(chamada).toMatch(/meta: \{ temCampanhas: temMeta, linhas: metaDailyFiltro, erro: erroMetaFiltro \}/);
    expect(chamada).toMatch(/google: \{ mostrar: googleCampaignIds\.size > 0, trafego: googleTrafegoFiltro \}/);
    expect(chamada).toMatch(/vendas: connection\.isLoading \? \{ tipo: "carregando" \} : vendasDosBlocos/);
    expect(chamada).toMatch(/cambio: \{ taxa: brlRate, fonte: fxSource \}/);
  });
  it("nenhum hook novo: as mesmas contagens de consulta da 42.15 e a tabela sem hook", () => {
    expect(etapa.match(/useCampaignDailyInsightsBulk\(/g)).toHaveLength(2);
    expect(etapa.match(/useRevenuecatVendasPorCanal\(/g)).toHaveLength(1);
    expect(etapa.match(/useGoogleAdsDailyPorCampanha\(/g)).toHaveLength(1);
    expect(tabela).not.toMatch(/from "@\/lib\/hooks/);
    expect(semComentarios(conta)).not.toMatch(/from "@\/lib\/hooks\/use-revenuecat"|useRevenuecat/);
  });
});

describe("AC3e — a tabela não usa o `daily` do `/sales`", () => {
  it("a conta lê `diario` (vendas-por-canal) e nunca `.daily` / `revenueUsd` do `/sales`", () => {
    const codigo = semComentarios(conta);
    expect(codigo).toMatch(/d\.diario/);
    expect(codigo).not.toMatch(/\.daily\b|revenueUsd\b|totalSales/);
    expect(chamada).not.toMatch(/sales\b/);
  });
});
