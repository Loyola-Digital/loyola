import { describe, expect, it } from "vitest";
import { renderInstagramReportHtml } from "../services/instagram-report-html.js";
import type { MonthlyReportData, AccountReport, PostSummary } from "@loyola-x/shared";

/**
 * O arquivo que o Social Media baixa. Três coisas não podem escapar:
 * legenda é dado (vai escapada), miniatura da Meta fica fora (a URL expira em
 * horas e viraria imagem quebrada no arquivo), e link só existe quando há
 * permalink de verdade.
 */

const post = (over: Partial<PostSummary> = {}): PostSummary => ({
  mediaId: "1",
  mediaType: "IMAGE",
  mediaProductType: "FEED",
  timestamp: "2026-10-15T12:00:00.000Z",
  thumbnailUrl: "https://scontent.cdninstagram.com/expira-em-horas.jpg",
  permalink: "https://www.instagram.com/p/ABC123/",
  caption: "Legenda normal",
  reach: 1000,
  likes: 10,
  comments: 2,
  saves: 3,
  engagementRate: 1.5,
  follows: 4,
  ...over,
});

const conta = (over: Partial<AccountReport> = {}): AccountReport =>
  ({
    accountId: "a1",
    instagramUsername: "fernandazapparoli",
    accountName: "Fernanda Zapparoli",
    profilePictureUrl: null,
    totals: {
      reach: 50_000,
      views: 70_000,
      interactions: 3_000,
      postsPublished: 12,
      likes: 2_000,
      comments: 300,
      saves: 400,
      shares: 300,
    },
    followers: {
      startOfMonth: null,
      endOfMonth: null,
      gained: 900,
      lost: 100,
      net: 800,
      totalMedido: 154_340,
      totalMedidoEm: "2026-11-24T12:00:00.000Z",
      ganhosPorPost: 42,
    },
    mediaDistribution: {
      reels: { count: 6, reach: 30_000 },
      feed: { count: 4, reach: 15_000 },
      carousel: { count: 2, reach: 5_000 },
      story: { count: 0, reach: 0 },
    },
    dailyTrend: [],
    topByEngagement: [post()],
    bottomByEngagement: [],
    topByReach: [post()],
    bottomByReach: [],
    demographics: null,
    delta: null,
    ...over,
  }) as AccountReport;

const relatorio = (contas: AccountReport[]): MonthlyReportData => ({
  month: "2026-10",
  monthLabel: "Outubro 2026",
  generatedAt: "2026-11-24T12:00:00.000Z",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  accounts: contas,
  hasComparison: false,
});

describe("renderInstagramReportHtml", () => {
  it("é um documento autocontido, sem script nem recurso externo", () => {
    const html = renderInstagramReportHtml(relatorio([conta()]));
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<style>");
    expect(html).not.toContain("<script");
    // nenhuma imagem: a URL da Meta expira em horas
    expect(html).not.toContain("<img");
    expect(html).not.toContain("cdninstagram.com");
  });

  // Legenda é texto de terceiro. Sem escapar, uma legenda com HTML entraria no
  // documento como markup.
  it("escapa legenda e nome da conta", () => {
    const html = renderInstagramReportHtml(
      relatorio([
        conta({
          accountName: 'Conta "A" & B',
          topByReach: [post({ caption: "<img src=x onerror=alert(1)>" })],
        }),
      ]),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("Conta &quot;A&quot; &amp; B");
  });

  it("link do post só quando há permalink", () => {
    const comLink = renderInstagramReportHtml(relatorio([conta({ topByReach: [post()] })]));
    expect(comLink).toContain('href="https://www.instagram.com/p/ABC123/"');

    const semLink = renderInstagramReportHtml(
      relatorio([conta({ topByReach: [post({ permalink: null })], topByEngagement: [] })]),
    );
    // sem permalink não monta link nenhum — nem o fallback que dava 404
    expect(semLink).not.toContain("instagram.com/p/");
    expect(semLink).toContain('class="semlink"');
  });

  it("em mês fechado, o total de seguidores sai com a data da medição", () => {
    const html = renderInstagramReportHtml(relatorio([conta()]));
    expect(html).toContain("Seguidores (total medido)");
    expect(html).toContain("medido em 24/11/2026");
    expect(html).not.toContain("Seguidores ao fim do mês");
  });

  it("no mês corrente, sai como fim do mês", () => {
    const html = renderInstagramReportHtml(
      relatorio([
        conta({
          followers: {
            startOfMonth: 153_340,
            endOfMonth: 154_340,
            gained: 1_200,
            lost: 200,
            net: 1_000,
            totalMedido: 154_340,
            totalMedidoEm: "2026-11-24T12:00:00.000Z",
            ganhosPorPost: null,
          },
        }),
      ]),
    );
    expect(html).toContain("Seguidores ao fim do mês");
    expect(html).not.toContain("Seguidores (total medido)");
  });

  it("projeto sem conta vinculada não gera documento vazio sem explicação", () => {
    const html = renderInstagramReportHtml(relatorio([]));
    expect(html).toContain("Nenhuma conta do Instagram vinculada");
  });
});
