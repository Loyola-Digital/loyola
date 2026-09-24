import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  correcoesPorCampanhaSchema,
  normalizarCorrecoesPorCampanha,
} from "../utils/lp-correcao-campanha.js";

/**
 * Story 18.83 — as camadas da correção manual por campanha e o FIO das rotas.
 *
 * Lição do gate de 2026-09-23: as provas diferenciais só atacavam funções puras
 * e cortar a ligação no call site derrubava zero testes. Aqui ficam as provas
 * de ligação: a rota chama a função pura com o dado certo, a chave do cache
 * mudou, o campo vai para a resposta, a coluna existe nas três camadas.
 *
 * Ler o fonte é grosseiro — mas levantar o Fastify com banco e Meta mockados
 * provaria o mock (ver "teste de vínculo com banco mockado é decorativo").
 */

const src = (rel: string) =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf-8");

describe("correção por campanha — camada 1 (zod) e 2 (normalização)", () => {
  it("aceita campaign_id → URL http(s), e vazio (remoção)", () => {
    const r = correcoesPorCampanhaSchema.safeParse({
      "120247625370600489": "https://lps.netaobombeef.com/bbepr2-captura-d",
      "120247625370380489": "",
    });
    expect(r.success).toBe(true);
  });

  it("recusa URL sem http(s) e chave que não é campaign_id", () => {
    expect(correcoesPorCampanhaSchema.safeParse({ "1": "javascript:alert(1)" }).success).toBe(false);
    expect(correcoesPorCampanhaSchema.safeParse({ "1": "lps.com/x" }).success).toBe(false);
    expect(correcoesPorCampanhaSchema.safeParse({ lpa: "https://x.com" }).success).toBe(false);
  });

  it("normalização descarta vazio (remove) e apara", () => {
    expect(
      normalizarCorrecoesPorCampanha({ " 1 ": " https://x.com/a ", "2": "", "3": "   " }),
    ).toEqual({ "1": "https://x.com/a" });
  });
});

describe("correção por campanha — ligação nas três camadas", () => {
  const rota = src("routes/funnel-stages.ts");
  const schema = src("db/schema.ts");

  it("o PUT valida com o schema da correção", () => {
    expect(rota).toMatch(/lpCampaignUrls:\s*correcoesPorCampanhaSchema\.optional\(\)/);
  });

  it("o handler grava o mapa NORMALIZADO", () => {
    // Mutação: gravar `body.lpCampaignUrls` cru → valor vazio persistiria.
    expect(rota).toMatch(/updates\.lpCampaignUrls\s*=\s*normalizarCorrecoesPorCampanha\(body\.lpCampaignUrls\)/);
  });

  it("a resposta da etapa devolve a correção (sem isso o web nunca a vê)", () => {
    expect(rota).toMatch(/lpCampaignUrls:\s*\(row\.lpCampaignUrls \?\? \{\}\)/);
  });

  it("a coluna existe no schema com o `$type` do mapa", () => {
    expect(schema).toMatch(
      /lpCampaignUrls:\s*jsonb\("lp_campaign_urls"\)\s*\.notNull\(\)\s*\.default\(\{\}\)\s*\.\$type<Record<string, string>>\(\)/,
    );
  });

  it("a migration 0158 cria a coluna, idempotente", () => {
    const sql = src("db/migrations/0158_stage_lp_campaign_urls.sql");
    expect(sql).toMatch(
      /ALTER TABLE "funnel_stages"\s+ADD COLUMN IF NOT EXISTS "lp_campaign_urls" jsonb DEFAULT '\{\}'::jsonb NOT NULL;/,
    );
  });
});

describe("creative-performance — o fio da tabela de LPs (AC1/AC8/AC10)", () => {
  const rota = src("routes/stage-creative-performance.ts");

  it("a chave do cache passou da `:v2` e a rota usa a função da chave", async () => {
    // Mutação: voltar a `:v2` → o cache de 2 h serve a resposta SEM URL.
    // (A 18.83 levou a `:v3`; a 18.85 subiu para `:v4` — ver o teste dela.)
    const { chaveDoCacheCreativePerformance, VERSAO_DO_CACHE_CREATIVE_PERFORMANCE } = await import(
      "../routes/stage-creative-performance.js"
    );
    expect(Number(VERSAO_DO_CACHE_CREATIVE_PERFORMANCE.slice(1))).toBeGreaterThanOrEqual(3);
    expect(chaveDoCacheCreativePerformance("s1", 30)).toBe(`s1:30:${VERSAO_DO_CACHE_CREATIVE_PERFORMANCE}`);
    expect(rota).toMatch(/const cacheKey = chaveDoCacheCreativePerformance\(stageId, days\);/);
  });

  it("o link do anúncio sai da leitura do cache recortada por projeto", () => {
    expect(rota).toMatch(/\.where\(condicaoDoCacheDeCriativos\(funnel\.projectId, idsUnicos\)\)/);
    expect(rota).toMatch(/linkPorAnuncio\.set\(normalizeNumericId\(id\), classificarLinkDoCache\(linhaPorId\.get\(id\)\)\)/);
  });

  it("montarLpPorAnuncio recebe os anúncios, as campanhas, os links e as vendas por anúncio", () => {
    const chamada = rota.slice(rota.indexOf("montarLpPorAnuncio({"), rota.indexOf("montarLpPorAnuncio({") + 400);
    expect(chamada).toMatch(/anuncios: filteredAds/);
    expect(chamada).toMatch(/campanhas: campaignInsights/);
    expect(chamada).toMatch(/campanhasPermitidas: campaignIdsForFetch/);
    expect(chamada).toMatch(/links: linkPorAnuncio/);
    expect(chamada).toMatch(/vendas: vendasPorAnuncio/);
    expect(chamada).toMatch(/ingressos: creativeSaleMetrics/);
  });

  it("a venda dedupada do 18.50 é gravada POR ANÚNCIO", () => {
    expect(rota).toMatch(/vendasPorAnuncio\.set\(adId, porAnuncio\)/);
  });

  it("`lpPorAnuncio` vai no payload (que é o que o cache guarda)", () => {
    const payload = rota.slice(rota.indexOf("const payload = {"), rota.indexOf("const payload = {") + 300);
    expect(payload).toMatch(/lpPorAnuncio,/);
    // O `lpBreakdown` continua — o web anterior à 18.83 lê ele.
    expect(payload).toMatch(/lpBreakdown,/);
  });

  it("a leitura aciona a auto-cura com as listas das causas curáveis (AC8)", () => {
    expect(rota).toMatch(/listasDaCura\(linkPorAnuncio\)/);
    expect(rota).toMatch(/avaliarCura\(funnel\.projectId, agoraMs, staleInCache, missingFromCache\)/);
    expect(rota).toMatch(/curarCacheDeLpEmSegundoPlano\(/);
  });

  it("o fetch por anúncio pede `inline_link_clicks` (AC3 — a mesma métrica do nível campanha)", () => {
    const meta = src("services/meta-ads.ts");
    const impl = meta.slice(meta.indexOf("async function fetchAllAdInsightsImpl"));
    const fields = impl.match(/const fields = "([^"]+)"/)?.[1] ?? "";
    expect(fields.split(",")).toContain("inline_link_clicks");
  });
});

describe("lp-funnel — o fio do mini-funil (AC9)", () => {
  const rota = src("routes/stage-sales-journey.ts");
  const trecho = rota.slice(rota.indexOf('"/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lp-funnel"'));

  it("lê a correção da etapa e o cache de criativos do PROJETO da rota", () => {
    expect(trecho).toMatch(/lpCampaignUrls: funnelStages\.lpCampaignUrls/);
    expect(trecho).toMatch(/lerLinksDosAnuncios\(fastify\.db, p\.data\.projectId, adIds\)/);
    expect(trecho).toMatch(/lerCampanhasDosAnuncios\(fastify\.db, p\.data\.projectId, semLink\)/);
  });

  it("a URL do anúncio passa pela correção (PO-15b) e entra na atribuição", () => {
    expect(trecho).toMatch(/linkComCorrecao\(link, campanhaDe\.get\(adId\), correcoes\)\.chave/);
    expect(trecho).toMatch(/atribuirLpFunnel\(\{[\s\S]*urlDoAnuncio,\s*\}\)/);
  });

  it("aplicação não entra no lote de ad_ids (PO-17)", () => {
    const lote = trecho.slice(trecho.indexOf("const adIds = ["), trecho.indexOf("const adIds = [") + 250);
    expect(lote).toMatch(/porEtapa\.leads\.values\(\), \.\.\.porEtapa\.pesquisas\.values\(\)/);
    expect(lote).not.toMatch(/aplicacoes/);
  });

  it("a compra carrega o `co=` da venda (lerVendas ganhou o campo)", () => {
    expect(trecho).toMatch(/adId: utmContentEfetivo\(v\.content\)/);
    expect(rota).toMatch(/content: contentIdx !== -1 \? \(row\[contentIdx\] \?\? ""\)\.trim\(\) : ""/);
  });
});
