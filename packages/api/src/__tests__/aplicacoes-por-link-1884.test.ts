import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  SEM_LINK_RESOLVIDO,
  acharColunaUtmContent,
  agruparPorLink,
  anuncioDaAplicacao,
  avisoDeOrfasSeAplica,
  causaDaAplicacao,
  paginasOrfas,
  type LinhaPorLink,
} from "../services/application-sheets.js";
import {
  classificarLinkDoCache,
  condicaoDosAnunciosComGasto,
  type LinkDoAnuncio,
} from "../services/lp-do-anuncio.js";
import { LINK_URL_RESOLVER_VERSION } from "../services/meta-ads.js";

/**
 * Story 18.84 — aplicações por página na etapa de Vendas, pelo LINK DO ANÚNCIO.
 *
 * Fixture real: `dg-pg04 › Vendas`, 70 aplicações medidas em 2026-09-23 (ver
 * `_origem`). 47 resolvem URL (vendas-b 44, vendas-a 2, vendas-c 1); 23 não
 * (18 `org`, 2 `link_in_bio`, 2 vazias, 1 macro).
 */

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/dg-pg04-aplicacoes.json", import.meta.url), "utf-8"),
) as { aplicacoes: { aba: string; dia: string; utm_content: string; linkUrl: string | null }[] };

const B = "lps.danilogato.com.br/dgpg04-vendas-b";
const A = "lps.danilogato.com.br/dgpg04-vendas-a";
const C = "lps.danilogato.com.br/dgpg04-vendas-c";

function doFixture(): { linhas: LinhaPorLink[]; links: Map<string, LinkDoAnuncio> } {
  const links = new Map<string, LinkDoAnuncio>();
  const linhas = fixture.aplicacoes.map((a) => {
    const adId = anuncioDaAplicacao(a.utm_content);
    if (adId && a.linkUrl) {
      links.set(adId, classificarLinkDoCache({ creative: { linkUrl: a.linkUrl, linkUrlResolver: LINK_URL_RESOLVER_VERSION } }));
    }
    return { dia: a.dia, adId };
  });
  return { linhas, links };
}

describe("anuncioDaAplicacao — o que é anúncio de origem", () => {
  it("ad_id numérico (com o `_` de texto forçado) é anúncio", () => {
    expect(anuncioDaAplicacao("120247625370600489")).toBe("120247625370600489");
    expect(anuncioDaAplicacao("_120247625370600489")).toBe("120247625370600489");
  });

  it("org, link_in_bio, vazio e macro não são anúncio", () => {
    for (const v of ["org", "link_in_bio", "", "  ", "{{ad.id}}", "imersao"]) {
      expect(anuncioDaAplicacao(v)).toBeNull();
    }
  });
});

describe("agruparPorLink — dg-pg04 real (AC1/AC2/AC5)", () => {
  const { linhas, links } = doFixture();
  const grupos = agruparPorLink(linhas, links);
  const por = (label: string) => grupos.find((g) => g.label === label);

  it("três páginas de venda pelo link do anúncio + 'Sem link resolvido'", () => {
    expect(grupos.map((g) => [g.label, g.total])).toEqual([
      [B, 44],
      [A, 2],
      [C, 1],
      [SEM_LINK_RESOLVIDO, 23],
    ]);
    expect(por(B)!.url).toBe("https://lps.danilogato.com.br/dgpg04-vendas-b/");
  });

  it("nada some do total: a soma das séries é 70 (AC5)", () => {
    // Mutação: descartar as aplicações sem link → 47 e o teste cai.
    expect(grupos.reduce((s, g) => s + g.total, 0)).toBe(70);
    expect(grupos.reduce((s, g) => s + [...g.counts.values()].reduce((a, b) => a + b, 0), 0)).toBe(70);
  });

  it("as causas da série sem link: 23 sem anúncio de origem", () => {
    expect(por(SEM_LINK_RESOLVIDO)!.semLink).toEqual({
      semAnuncio: 23, foraDoCache: 0, cacheDesatualizado: 0, semLinkNaMeta: 0,
    });
    expect(por(SEM_LINK_RESOLVIDO)!.ehPagina).toBe(false);
  });

  it("as orgânicas da aba PaginaB vão para 'Sem link resolvido' — o nome da aba não é mais chave", () => {
    // Mutação: voltar a chavear pelo sufixo da aba → as 9 sem link da PaginaB
    // (7 `org`, 1 vazia, 1 macro) somam na página B: 53, e o teste cai.
    const daAbaB = fixture.aplicacoes.filter((a) => /PaginaB$/.test(a.aba));
    const semLinkDaAbaB = daAbaB.filter((a) => !a.linkUrl);
    expect(daAbaB).toHaveLength(53);
    expect(semLinkDaAbaB.filter((a) => a.utm_content === "org")).toHaveLength(7);
    expect(por(B)!.total).toBe(44);
  });
});

describe("causaDaAplicacao — as causas de anúncio seguem a 18.83/29.43 (PO-02)", () => {
  const links = new Map<string, LinkDoAnuncio>([
    ["1", { url: null, chave: null, causa: "cache_desatualizado" }],
    ["2", { url: null, chave: null, causa: "sem_link_na_meta" }],
    ["3", { url: "https://p.com/v", chave: "p.com/v", causa: null }],
  ]);

  it("uma causa por situação, nunca uma só", () => {
    expect(causaDaAplicacao(null, links)).toBe("sem_anuncio");
    expect(causaDaAplicacao("9", links)).toBe("fora_do_cache");
    expect(causaDaAplicacao("1", links)).toBe("cache_desatualizado");
    expect(causaDaAplicacao("2", links)).toBe("sem_link_na_meta");
    expect(causaDaAplicacao("3", links)).toBeNull();
  });

  it("dg-pg02 (0 de 49 com link): o gráfico vira UMA série 'Sem link resolvido' com 49 (PO-02)", () => {
    const linhas: LinhaPorLink[] = [
      ...Array.from({ length: 46 }, () => ({ dia: "2026-06-01", adId: null })),
      ...["1", "2", "9"].map((adId) => ({ dia: "2026-06-02", adId })),
    ];
    const grupos = agruparPorLink(linhas, links);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toEqual(expect.objectContaining({ label: SEM_LINK_RESOLVIDO, total: 49 }));
    expect(grupos[0].semLink).toEqual({ semAnuncio: 46, foraDoCache: 1, cacheDesatualizado: 1, semLinkNaMeta: 1 });
  });
});

describe("acharColunaUtmContent — a coluna PREENCHIDA (PO-08)", () => {
  it("colunas homônimas: vence a que tem dado", () => {
    const headers = ["email", "utm_content", "x", "utm_content", "co="];
    const rows = [["a", "", "", "120", ""], ["b", "", "", "org", ""]];
    expect(acharColunaUtmContent(headers, rows)).toBe(3);
  });

  it("aceita os apelidos `content` e `co=`", () => {
    expect(acharColunaUtmContent(["co="], [["1"]])).toBe(0);
    expect(acharColunaUtmContent(["Content"], [["1"]])).toBe(0);
  });
});

describe("aviso de página órfã (AC4/PO-05)", () => {
  it("página de venda com gasto e sem aplicação é acusada; com aplicação, não", () => {
    expect(paginasOrfas([B, A, "lps.danilogato.com.br/dgpg04-vendas-d"], [B, A, C])).toEqual([
      "lps.danilogato.com.br/dgpg04-vendas-d",
    ]);
  });

  it("etapa sem campanha → sem aviso (cair para o funil traria as capturas)", () => {
    // Mutação: ignorar a contagem de campanhas → a porta abre e o teste cai.
    expect(avisoDeOrfasSeAplica(0, 47)).toBe(false);
  });

  it("nenhuma aplicação com link → sem aviso (a planilha não carrega o anúncio)", () => {
    expect(avisoDeOrfasSeAplica(3, 0)).toBe(false);
    expect(avisoDeOrfasSeAplica(8, 47)).toBe(true);
  });

  it("o recorte do gasto é PROJETO + campanhas da ETAPA + janela + gasto > 0", () => {
    // Banco mockado aceitaria o `where` sem o `campaign_id` — a SQL prova.
    // Mutação: voltar ao filtro só por projeto (43.1) → `campaign_id` some.
    const q = new PgDialect().sqlToQuery(
      condicaoDosAnunciosComGasto("proj-1", ["camp-vendas-1", "camp-vendas-2"], "2026-08-24")!,
    );
    expect(q.sql).toContain('"meta_ad_insights_daily"."project_id"');
    expect(q.sql).toContain('"meta_ad_insights_daily"."campaign_id" in');
    expect(q.sql).toContain('"meta_ad_insights_daily"."date_start" >=');
    expect(q.sql).toContain('"meta_ad_insights_daily"."spend" >');
    expect(q.params).toEqual(["proj-1", "camp-vendas-1", "camp-vendas-2", "2026-08-24", "0"]);
  });
});

describe("o fio das rotas de aplicação (Story 18.84)", () => {
  const rota = readFileSync(new URL("../routes/stage-applications.ts", import.meta.url), "utf-8");

  it("o gráfico agrupa pelo link, resolvido no cache do PROJETO da rota", () => {
    expect(rota).toMatch(/const atualRaw = await rawFormsFor\(funnelId, projectId\);/);
    expect(rota).toMatch(/await lerLinksDosAnuncios\(\s*fastify\.db,\s*projectId,/);
    expect(rota).toMatch(/agruparPorLink\(linhas, links\)/);
    expect(rota).toMatch(/adId: idxConteudo === null \? null : anuncioDaAplicacao\(row\[idxConteudo\]\)/);
  });

  it("o aviso de órfã usa as campanhas da ETAPA (não do funil nem do projeto)", () => {
    // Mutação: passar `funnels.campaigns` → capturas acusadas a cada abertura.
    expect(rota).toMatch(/stageCampaigns: funnelStages\.campaigns/);
    expect(rota).toMatch(/\(ctx\.stageCampaigns \?\? \[\]\)\.map\(\(c\) => c\.id\)/);
    expect(rota).toMatch(/lerAnunciosComGasto\(fastify\.db, projectId, stageCampaigns, desdeStr\)/);
    expect(rota).not.toMatch(/funnels\.campaigns/);
  });

  it("a resposta leva o link e as causas por série, e o gatilho novo da explicação", () => {
    expect(rota).toMatch(/url: f\.url,\s*\.\.\.\(f\.semLink \? \{ semLink: f\.semLink \} : \{\}\),/);
    expect(rota).toMatch(/paginasPeloLinkDoAnuncio: atual\.length > 0,/);
    expect(rota).toMatch(/paginasVieramDoUtmTerm: false,/);
  });

  it("a lista usa a MESMA regra do gráfico (causaDaAplicacao) e o mesmo cache", () => {
    const lista = rota.slice(rota.indexOf('"/api/projects/:projectId/funnels/:funnelId/stages/:stageId/applications-list"'));
    expect(lista).toMatch(/acharColunaUtmContent\(data\.headers, data\.rows\)/);
    expect(lista).toMatch(/lerLinksDosAnuncios\(\s*fastify\.db,\s*projectId,/);
    expect(lista).toMatch(/const causa = causaDaAplicacao\(a\.adId, links\);/);
    expect(lista).toMatch(/lp: causa \? null : \(link\?\.chave \?\? null\)/);
  });

  it("a comparação com o lançamento anterior não lê o cache (só o total conta)", () => {
    expect(rota).toMatch(/rawFormsFor\(ctx\.compareFunnelId, null\)/);
  });
});
