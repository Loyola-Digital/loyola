import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Story 42.16 (AC5e) — o FIO da tela: os `.tsx` de `components/funnels` não
 * são coletados pelo vitest (`environment: node`), então as ligações são
 * provadas lendo o fonte (o padrão da 42.11–42.14).
 */
const url = (rel: string) => new URL(rel, import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(url(rel)), "utf8");
const etapa = ler("../../../components/funnels/lyrio-stage-view.tsx");
const bloco = ler("../../../components/funnels/lyrio-bloco-do-canal.tsx");
const detalhe = ler("../../../components/funnels/lyrio-detail-table.tsx");

describe("AC3 — um bloco, dois canais", () => {
  it("AC3b — GoogleAdsKpis não é mais renderizado nem definido; LyrioMetaKpis saiu", () => {
    expect(etapa).not.toMatch(/GoogleAdsKpis/);
    expect(etapa).not.toMatch(/LyrioMetaKpis/);
    expect(existsSync(fileURLToPath(url("../../../components/funnels/lyrio-meta-kpis.tsx")))).toBe(false);
  });
  it("AC3a — os dois blocos usam o MESMO componente, cada um com o seu canal e os seus cards", () => {
    expect(etapa.match(/<LyrioBlocoDoCanal /g)).toHaveLength(2);
    expect(etapa).toMatch(/<LyrioBlocoDoCanal canal="meta" temCampanhas=\{temMeta\} cards=\{cardsMeta\} revenuecatConectado=\{connected\} \/>/);
    expect(etapa).toMatch(/<LyrioBlocoDoCanal canal="google" temCampanhas cards=\{cardsGoogle\} revenuecatConectado=\{connected\} \/>/);
    expect(etapa).toMatch(/const cardsMeta = cardsDoBlocoDoCanal\(\{\s*canal: "meta",/);
    expect(etapa).toMatch(/const cardsGoogle = cardsDoBlocoDoCanal\(\{\s*canal: "google",/);
    // o bloco Google só aparece com campanha vinculada (42.13)
    const google = etapa.indexOf('<LyrioBlocoDoCanal canal="google"');
    expect(etapa.lastIndexOf('{contaGoogle.tipo !== "sem_campanha" && (', google)).toBeGreaterThan(etapa.indexOf('<LyrioBlocoDoCanal canal="meta"'));
  });
  it("AC1a/PO-01 — o card é o SuperficieDoCard da 42.14 (pelo CardComJanela), sem um terceiro tipo de card; o subtítulo é o do bloco", () => {
    expect(bloco).toMatch(/import \{ CardComJanela \} from "\.\/lyrio-card-com-janela";/);
    expect(bloco).toMatch(/<CardComJanela rotulo=\{c\.rotulo\} valor=\{c\.valor\} declaracao=\{c\.declaracao\} formula=\{c\.formula\}/);
    expect(bloco).not.toMatch(/function (Etapa|Kpi)\(/);
    expect(bloco).toMatch(/\{cards\.subtitulo\}/);
  });
});

describe("AC2b/AC2c — nenhuma chamada nova: o bloco Google lê o MESMO resultado do Resumo", () => {
  it("UMA consulta `/daily` por campanha, com max(filtro, 28); o tráfego do bloco e do Detalhamento sai dela, no filtro", () => {
    expect(etapa.match(/useGoogleAdsDailyPorCampanha\(/g)).toHaveLength(1);
    expect(etapa).not.toMatch(/useGoogleAdsCampaigns\(/);
    expect(etapa).toMatch(/const googleConsultas = googleDaily\.map\(\(q, i\) => \(\{ campaignId: googleIdsVinculados\[i\], isLoading: q\.isLoading, error: q\.error, data: q\.data \}\)\);/);
    expect(etapa).toMatch(/const googleTrafegoFiltro = trafegoDoGoogleNaRegua\(contaGoogle, googleConsultas, days, hoje\);/);
    expect(etapa).toMatch(/trafego: trafegoDoBlocoDoGoogle\(googleTrafegoFiltro\),/);
  });
  it("a Meta também: o bloco lê a consulta do FILTRO do Resumo (antes repetia a chamada); a venda é a mesma dos dois blocos", () => {
    expect(etapa.match(/useCampaignDailyInsightsBulk\(/g)).toHaveLength(2); // o filtro e os 28 fixos (42.14)
    expect(bloco).not.toMatch(/use[A-Z]\w*\(/); // o bloco não consulta nada
    expect(etapa.match(/vendas: vendasDosBlocos,/g)).toHaveLength(2);
    expect(etapa.match(/ctx: \{ diasDoFiltro: days, hoje \},\s*trafego:/g)).toHaveLength(2);
  });
});

describe("AC4 — o filtro Plataforma do Detalhamento", () => {
  it("AC4a/g — começa em Todas, ao lado das abas; nada persiste (estado local)", () => {
    expect(detalhe).toMatch(/useState<PlataformaDoDetalhamento>\("todas"\)/);
    expect(detalhe).toMatch(/<SelectItem value="todas">Todas<\/SelectItem>\s*<SelectItem value="meta">Meta<\/SelectItem>\s*<SelectItem value="google">Google<\/SelectItem>/);
    expect(detalhe).not.toMatch(/localStorage|sessionStorage|searchParams/);
  });
  it("AC4b/c — as consultas ligam pelo filtro: cada hook da Meta e o status do Google leem `consultasDoDetalhamento`", () => {
    expect(detalhe).toMatch(/const liga = consultasDoDetalhamento\(plataforma, dimensao, \{ meta: temMeta, google: temGoogle \}\);/);
    expect(detalhe).toMatch(/useTrafficCampaigns\(\s*liga\.metaCampanhas \? projectId : null,/);
    expect(detalhe).toMatch(/useAllAdSets\(\s*liga\.metaPublicos \? projectId : null,/);
    expect(detalhe).toMatch(/useAllAds\(\s*liga\.metaCriativos \? projectId : null,/);
    expect(detalhe).toMatch(/useGoogleAdsCampaigns\(liga\.googleStatus \? googleAccountId : null, days\)/);
  });
  it("AC4c — com Google, a dimensão efetiva é Campanha, Público e Criativo ficam desabilitados com a dica, e a troca volta para Campanha", () => {
    expect(detalhe).toMatch(/const dimensao = dimensaoDoFiltro\(plataforma, dimensaoEscolhida\);/);
    expect(detalhe).toMatch(/setDimensao\(\(d\) => dimensaoDoFiltro\(p, d\)\);/);
    expect(detalhe).toMatch(/disabled=\{!habilitada\} title=\{habilitada \? undefined : DICA_DO_GOOGLE_SO_CAMPANHA\}/);
    expect(detalhe).toMatch(/\{plataforma === "google" && \(\s*<p[^>]*>\{DICA_DO_GOOGLE_SO_CAMPANHA\}/);
  });
  it("AC4b/c/d — as linhas e o rodapé seguem o filtro; o Total é das linhas exibidas", () => {
    expect(detalhe.match(/linhasDoFiltro\(/g)).toHaveLength(2);
    expect(detalhe).toMatch(/const total = useMemo\(\(\) => totalSpend\(rows\), \[rows\]\);/);
    expect(detalhe).toMatch(/const rodape = rodapeDoFiltro\(plataforma, vendas\);/);
    expect(detalhe).toMatch(/rodape\.naoIdentificado/);
    expect(detalhe).toMatch(/rodape\.semLinha/);
    expect(detalhe).toMatch(/rodape\.totalDeVendas \? rodape\.totalDeVendas\.vendas : null/);
    expect(detalhe).not.toMatch(/vendas\.totalMeta/);
  });
  it("AC4e — o aviso do Google só com Todas ou Google", () => {
    expect(detalhe).toMatch(/dimensao === "campaign" && mostraAvisoDoGoogle\(plataforma\) \? avisoDoGoogleEmLinha\(comoEstadoDoGoogle\(googleTrafego\)\) : null;/);
  });
  it("AC4f/PO-03 — as linhas do Google vêm da régua de SP, com o nome da etapa; da consulta de hoje, só o status", () => {
    expect(detalhe).toMatch(/campanhasDoGoogleNaRegua\(googleCampanhas\.filter\(\(c\) => googleCampaignIds\.has\(c\.id\)\), googleTrafego\.porCampanha, statusPorId\)/);
    expect(detalhe).toMatch(/new Map\(\(googleStatusData\?\.campaigns \?\? \[\]\)\.map\(\(c\) => \[c\.id, c\.status\]/);
    // nenhuma métrica da resposta de `/campaigns` entra na tabela
    expect(detalhe).not.toMatch(/googleStatusData\?\.campaigns[^\n]*(spend|impressions|clicks|ctr|cpc|cpm)/);
    expect(detalhe).toMatch(/recalculado da soma diária na régua de SP/);
    // o pai passa o tráfego da mesma consulta e o nome do vínculo
    expect(etapa).toMatch(/googleCampanhas=\{googleCampaigns\}\s*googleTrafego=\{googleTrafegoFiltro\}/);
  });
});
