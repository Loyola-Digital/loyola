import { describe, expect, it } from "vitest";
import { applyMetaAdsTax } from "./funnel-metrics";
import {
  desdeIso,
  metaPorDia,
  montarRedirectDiario,
  totaisDoRedirect,
  type DiaDaMeta,
  type DiaDoGrupo,
} from "./redirect-diario";

const insight = (
  date: string,
  spend: string,
  impressions: string,
  linkClicks: number,
  lpViews: number,
) => ({
  date_start: date,
  spend,
  impressions,
  actions: [
    { action_type: "link_click", value: String(linkClicks) },
    { action_type: "landing_page_view", value: String(lpViews) },
  ],
});

describe("metaPorDia", () => {
  it("soma as campanhas que caem no mesmo dia numa linha só", () => {
    const linhas = metaPorDia([
      [insight("2025-10-20", "100", "1000", 50, 40)],
      [insight("2025-10-20", "200", "3000", 150, 110)],
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      date: "2025-10-20",
      investimento: 300,
      impressoes: 4000,
      cliquesNoLink: 200,
      visitasDaPagina: 150,
    });
  });

  it("aplica o imposto do Meta Ads por linha, pela data dela", () => {
    const [linha] = metaPorDia([[insight("2026-10-20", "100", "1000", 10, 8)]]);
    // Derivado da própria regra: a alíquota mora num lugar só.
    expect(linha.investimento).toBeCloseTo(applyMetaAdsTax(100, "2026-10-20"), 2);
    expect(linha.investimento).toBeGreaterThan(100);
  });

  it("ignora linha sem data em vez de criar um dia fantasma", () => {
    expect(metaPorDia([[{ date_start: "", spend: "50", impressions: "10" }]])).toEqual([]);
  });

  it("insight sem actions não vira NaN", () => {
    const [linha] = metaPorDia([[{ date_start: "2025-01-02", spend: "10", impressions: "5" }]]);
    expect(linha.cliquesNoLink).toBe(0);
    expect(linha.visitasDaPagina).toBe(0);
  });
});

const meta: DiaDaMeta[] = [
  { date: "2025-10-20", investimento: 300, impressoes: 10000, cliquesNoLink: 400, visitasDaPagina: 300 },
  { date: "2025-10-21", investimento: 500, impressoes: 20000, cliquesNoLink: 800, visitasDaPagina: 600 },
];

const grupo: DiaDoGrupo[] = [
  { date: "2025-10-20", entrou: 150, saiu: 10, cliques: 200, disparos: 1 },
  { date: "2025-10-21", entrou: 300, saiu: 50, cliques: 400, disparos: 2 },
];

describe("montarRedirectDiario", () => {
  it("encosta Meta e grupo no mesmo dia, do mais recente para o mais antigo", () => {
    const linhas = montarRedirectDiario(meta, grupo);

    expect(linhas.map((l) => l.date)).toEqual(["2025-10-21", "2025-10-20"]);
    const [recente] = linhas;
    expect(recente.cliquesNoLink).toBe(800);
    expect(recente.visitasDaPagina).toBe(600);
    expect(recente.entrou).toBe(300);
    expect(recente.saldo).toBe(250);
    // 500 ÷ 300 entradas
    expect(recente.custoPorEntrada).toBeCloseTo(1.6667, 3);
    expect(recente.taxaCliqueParaPagina).toBeCloseTo(75, 6); // 600/800
    expect(recente.taxaPaginaParaGrupo).toBeCloseTo(50, 6); // 300/600
    expect(recente.taxaCliqueParaGrupo).toBeCloseTo(37.5, 6); // 300/800
  });

  it("dia que gastou e não encheu grupo nenhum APARECE, com taxa zero", () => {
    const linhas = montarRedirectDiario(
      [{ date: "2025-10-22", investimento: 400, impressoes: 9000, cliquesNoLink: 300, visitasDaPagina: 220 }],
      [],
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].entrou).toBe(0);
    expect(linhas[0].taxaPaginaParaGrupo).toBe(0);
    // Ninguém entrou: custo por entrada é indefinido, não zero nem Infinity.
    expect(linhas[0].custoPorEntrada).toBeNull();
  });

  it("dia com entrada e sem anúncio também aparece (link direto, disparo)", () => {
    const linhas = montarRedirectDiario([], [{ date: "2025-10-19", entrou: 40, saiu: 2, cliques: 60, disparos: 1 }]);

    expect(linhas[0]).toMatchObject({ date: "2025-10-19", investimento: 0, entrou: 40, saldo: 38 });
    // Sem cliques no link não há como calcular a taxa — e 0% mentiria.
    expect(linhas[0].taxaCliqueParaPagina).toBeNull();
    expect(linhas[0].taxaCliqueParaGrupo).toBeNull();
  });

  it("saldo negativo é preservado: dia de esvaziamento é resultado", () => {
    const linhas = montarRedirectDiario([], [{ date: "2025-10-18", entrou: 10, saiu: 90, cliques: 0, disparos: 3 }]);
    expect(linhas[0].saldo).toBe(-80);
  });

  it("não explode com as duas fontes vazias", () => {
    expect(montarRedirectDiario([], [])).toEqual([]);
  });
});

describe("totaisDoRedirect", () => {
  it("recalcula as taxas sobre as somas, não a média das taxas diárias", () => {
    const totais = totaisDoRedirect(montarRedirectDiario(meta, grupo));

    expect(totais.investimento).toBe(800);
    expect(totais.cliquesNoLink).toBe(1200);
    expect(totais.visitasDaPagina).toBe(900);
    expect(totais.entrou).toBe(450);
    expect(totais.saiu).toBe(60);
    expect(totais.saldo).toBe(390);
    expect(totais.custoPorEntrada).toBeCloseTo(800 / 450, 6);
    expect(totais.taxaCliqueParaPagina).toBeCloseTo((900 / 1200) * 100, 6);
    expect(totais.taxaPaginaParaGrupo).toBeCloseTo((450 / 900) * 100, 6);
  });

  it("a média das taxas diárias daria OUTRO número — e é por isso que não se usa", () => {
    const linhas = montarRedirectDiario(
      [
        { date: "2025-10-20", investimento: 10, impressoes: 100, cliquesNoLink: 3, visitasDaPagina: 3 },
        { date: "2025-10-21", investimento: 1000, impressoes: 90000, cliquesNoLink: 3000, visitasDaPagina: 1500 },
      ],
      [],
    );
    const totais = totaisDoRedirect(linhas);
    // Somas: 1503/3003 = 50,05%. A média das diárias (100% e 50%) daria 75%.
    expect(totais.taxaCliqueParaPagina).toBeCloseTo((1503 / 3003) * 100, 4);
  });

  it("janela sem nada devolve zeros e taxas nulas", () => {
    expect(totaisDoRedirect([])).toMatchObject({
      investimento: 0,
      entrou: 0,
      custoPorEntrada: null,
      taxaCliqueParaPagina: null,
    });
  });
});

describe("desdeIso", () => {
  const agora = new Date("2026-10-22T15:00:00Z");

  it("conta HOJE: 30 dias começa em hoje - 29", () => {
    expect(desdeIso(30, agora)).toBe("2026-09-23");
  });

  it("um dia é hoje", () => {
    expect(desdeIso(1, agora)).toBe("2026-10-22");
  });

  it("entrada sem sentido não vira data no futuro", () => {
    expect(desdeIso(0, agora)).toBe("2026-10-22");
    expect(desdeIso(-5, agora)).toBe("2026-10-22");
  });
});
