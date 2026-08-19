import { describe, it, expect } from "vitest";
import {
  calcularTetos,
  janelasDe7Dias,
  tetosResolvidos,
  montarRanking,
  metricasDoTeto,
  calcularMetricas,
  agregar,
  type SerieDeCampanha,
  type CoberturaDiaria,
  type DiaBruto,
  type Teto,
} from "@loyola-x/shared";

/**
 * Story 44.7 — composição do teto. A 44.6 entregou as primitivas; aqui elas
 * viram um `Teto` preenchido ou um `TetoAusente` com motivo.
 */

/** Dia com base folgada — passa o piso alto de todas as métricas. */
const dia = (date: string, o: Partial<DiaBruto> = {}): DiaBruto => ({
  date,
  spend: 1000,
  impressions: 40_000,
  linkClicks: 400,
  landingPageViews: 350,
  checkouts: 35,
  ...o,
});

const serie = (
  campaignId: string,
  dias: DiaBruto[],
  fonte: "ad-level" | "campaign-level" = "ad-level",
): SerieDeCampanha => ({ campaignId, fonte, dias });

const teto = (t: ReturnType<typeof calcularTetos>[keyof ReturnType<typeof calcularTetos>]) =>
  t as Teto;

describe("calcularTetos — o caminho principal", () => {
  it("devolve um Teto por métrica, com todos os campos da spec §4", () => {
    const t = calcularTetos([serie("c1", [dia("2026-05-01"), dia("2026-05-02")])], "paga");
    const ctr = teto(t.ctr);
    expect(ctr.valor).toBeGreaterThan(0);
    expect(ctr.campaignId).toBe("c1");
    expect(ctr.de).toBe("2026-04-26");
    expect(ctr.ate).toBe("2026-05-02");
    expect(ctr.base).toBe(80_000);
    expect(ctr.confianca).toBe("alta");
    expect(ctr.fonte).toBe("ad-level");
  });

  /** Direção `maior`: o máximo vence. */
  it("connectRate: vence a janela de MAIOR valor", () => {
    const t = calcularTetos(
      [
        serie("c1", [dia("2026-05-01", { landingPageViews: 200 })]), // 0,50
        serie("c2", [dia("2026-05-01", { landingPageViews: 380 })]), // 0,95
      ],
      "paga",
    );
    expect(teto(t.connectRate).valor).toBeCloseTo(0.95, 4);
    expect(teto(t.connectRate).campaignId).toBe("c2");
  });

  /** Direção `menor`: o mínimo vence. */
  it("cpc: vence a janela de MENOR valor", () => {
    const t = calcularTetos(
      [
        serie("caro", [dia("2026-05-01", { spend: 2000 })]), // cpc 5,00
        serie("barato", [dia("2026-05-01", { spend: 400 })]), // cpc 1,00
      ],
      "paga",
    );
    expect(teto(t.cpc).valor).toBeCloseTo(1.0, 4);
    expect(teto(t.cpc).campaignId).toBe("barato");
  });

  it("janela que passa o piso mas perde para outra melhor não vira teto", () => {
    const t = calcularTetos(
      [serie("c1", [dia("2026-05-01", { landingPageViews: 200 }), dia("2026-05-09", { landingPageViews: 390 })])],
      "paga",
    );
    // 2026-05-09 está fora da janela de 2026-05-01: são duas janelas distintas
    expect(teto(t.connectRate).ate).toBe("2026-05-09");
    expect(teto(t.connectRate).valor).toBeCloseTo(0.975, 4);
  });
});

describe("calcularTetos — o piso vem ANTES da escolha (AC2)", () => {
  /** A campanha com valor melhor não concorre por não atingir o piso. */
  it("campanha abaixo do piso não concorre, e o grupo ainda tem teto pela outra", () => {
    const t = calcularTetos(
      [
        // base minúscula, mas connectRate perfeito — seria a "mais sortuda"
        serie("ruidosa", [dia("2026-05-01", { impressions: 500, linkClicks: 50, landingPageViews: 50 })]),
        serie("solida", [dia("2026-05-01", { landingPageViews: 300 })]), // 0,75
      ],
      "paga",
    );
    expect(teto(t.connectRate).campaignId).toBe("solida");
    expect(teto(t.connectRate).valor).toBeCloseTo(0.75, 4);
  });

  it("grupo inteiro abaixo do piso devolve baseInsuficiente, não número", () => {
    const t = calcularTetos(
      [serie("c1", [dia("2026-05-01", { impressions: 500, linkClicks: 20, landingPageViews: 10, checkouts: 1 })])],
      "paga",
    );
    for (const m of ["cpm", "cpc", "ctr", "connectRate", "convLP"] as const) {
      expect(t[m].valor).toBeNull();
      expect((t[m] as { motivo: string }).motivo).toBe("baseInsuficiente");
    }
  });

  it("grupo sem série nenhuma devolve semDados", () => {
    const t = calcularTetos([serie("c1", [])], "paga");
    expect(t.ctr.valor).toBeNull();
    expect((t.ctr as { motivo: string }).motivo).toBe("semDados");
  });

  it("lista de campanhas vazia também é semDados", () => {
    expect((calcularTetos([], "paga").ctr as { motivo: string }).motivo).toBe("semDados");
  });
});

describe("calcularTetos — guarda de cobertura (família gratuita)", () => {
  const diasGratuita = [
    dia("2026-05-01", { leadsAtribuidos: 30 }),
    dia("2026-05-10", { leadsAtribuidos: 90 }),
  ];
  /** Rastreio ruim em 01/05 (40%), bom em 10/05 (95%). Mediana ~0,675. */
  const cobertura: CoberturaDiaria[] = [
    { date: "2026-05-01", leadsAtribuidos: 40, leadsTotais: 100 },
    { date: "2026-05-10", leadsAtribuidos: 95, leadsTotais: 100 },
  ];

  it("janela com rastreio muito abaixo da mediana da etapa não concorre", () => {
    const t = calcularTetos([serie("c1", diasGratuita)], "gratuita", { coberturaDaEtapa: cobertura });
    // 01/05 tem cobertura 0,40 contra mediana 0,675 → 27,5 p.p. abaixo, barrada
    expect(teto(t.convLP).ate).toBe("2026-05-10");
    expect(teto(t.convLP).coberturaJanela).toBeCloseTo(0.95, 4);
  });

  it("sem série de cobertura a guarda não roda, e o teto sai sem coberturaJanela", () => {
    const t = calcularTetos([serie("c1", diasGratuita)], "gratuita");
    expect(teto(t.convLP).valor).not.toBeNull();
    expect(teto(t.convLP).coberturaJanela).toBeUndefined();
  });

  it("toda janela barrada pela guarda devolve motivo coberturaAtipica", () => {
    const t = calcularTetos([serie("c1", [dia("2026-05-01", { leadsAtribuidos: 30 })])], "gratuita", {
      coberturaDaEtapa: [
        { date: "2026-05-01", leadsAtribuidos: 10, leadsTotais: 100 }, // 0,10
        { date: "2026-06-01", leadsAtribuidos: 90, leadsTotais: 100 }, // 0,90 → mediana 0,50
      ],
    });
    expect(t.convLP.valor).toBeNull();
    expect((t.convLP as { motivo: string }).motivo).toBe("coberturaAtipica");
  });

  /** A guarda é só da gratuita: na paga os dois lados da Conv. LP vêm do pixel. */
  it("família paga NÃO aplica a guarda, mesmo com cobertura fornecida", () => {
    const t = calcularTetos([serie("c1", [dia("2026-05-01")])], "paga", {
      coberturaDaEtapa: [
        { date: "2026-05-01", leadsAtribuidos: 1, leadsTotais: 100 },
        { date: "2026-06-01", leadsAtribuidos: 99, leadsTotais: 100 },
      ],
    });
    expect(teto(t.convLP).valor).not.toBeNull();
    expect(teto(t.convLP).coberturaJanela).toBeUndefined();
  });

  /** Razão de somas, não média das frações diárias — a regra da §2.6. */
  it("cobertura da janela é razão de somas", () => {
    const t = calcularTetos(
      [serie("c1", [dia("2026-05-01", { leadsAtribuidos: 30 }), dia("2026-05-02", { leadsAtribuidos: 30 })])],
      "gratuita",
      {
        coberturaDaEtapa: [
          { date: "2026-05-01", leadsAtribuidos: 90, leadsTotais: 100 }, // 0,90
          { date: "2026-05-02", leadsAtribuidos: 720, leadsTotais: 900 }, // 0,80
        ],
      },
    );
    // razão de somas = 810/1000 = 0,81 · média das frações seria (0,90+0,80)/2 = 0,85.
    // Os volumes são diferentes de propósito: com volumes iguais os dois métodos
    // coincidem e o teste não provaria nada.
    expect(teto(t.convLP).coberturaJanela).toBeCloseTo(0.81, 4);
    expect(teto(t.convLP).coberturaJanela).not.toBeCloseTo(0.85, 4);
  });
});

describe("calcularTetos — fonte por linha (AC6)", () => {
  it("o mesmo grupo pode ter teto ad-level numa métrica e campaign-level noutra", () => {
    const t = calcularTetos(
      [
        // vence o connectRate (0,95) mas perde o cpc
        serie("ad", [dia("2026-05-01", { landingPageViews: 380, spend: 2000 })], "ad-level"),
        // vence o cpc (1,00) mas perde o connectRate
        serie("camp", [dia("2026-05-01", { landingPageViews: 200, spend: 400 })], "campaign-level"),
      ],
      "paga",
    );
    expect(teto(t.connectRate).fonte).toBe("ad-level");
    expect(teto(t.cpc).fonte).toBe("campaign-level");
  });
});

describe("calcularTetos — série com gap (a regra da 44.6 sobrevive)", () => {
  it("a janela vencedora nunca cobre mais de 7 dias de calendário", () => {
    const t = calcularTetos(
      [serie("c1", [dia("2026-05-01"), dia("2026-05-02"), dia("2026-05-20"), dia("2026-05-21")])],
      "paga",
    );
    const v = teto(t.ctr);
    const dias = (Date.parse(v.ate + "T00:00:00Z") - Date.parse(v.de + "T00:00:00Z")) / 86_400_000 + 1;
    expect(dias).toBe(7);
    // e a base é de 2 dias, não de 4 — o gap não foi atravessado
    expect(v.base).toBe(80_000);
  });
});

describe("montarRanking e metricasDoTeto (AC7)", () => {
  const tetos = calcularTetos([serie("c1", [dia("2026-05-01", { landingPageViews: 380 })])], "paga");
  const atuais = calcularMetricas(agregar([dia("2026-05-01", { landingPageViews: 200 })]), "paga");

  it("monta itens só das métricas com teto resolvido", () => {
    const r = montarRanking(tetos, atuais);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.queda > 0)).toBe(true);
  });

  it("métrica sem teto não entra no ranking", () => {
    const semTeto = calcularTetos([serie("c1", [])], "paga");
    expect(montarRanking(semTeto, atuais)).toEqual([]);
  });

  it("tetosResolvidos filtra os ausentes", () => {
    expect(tetosResolvidos(tetos).every((t) => t.valor !== null)).toBe(true);
    expect(tetosResolvidos(calcularTetos([serie("c1", [])], "paga"))).toEqual([]);
  });

  it("metricasDoTeto devolve null onde não há teto", () => {
    expect(metricasDoTeto(calcularTetos([serie("c1", [])], "paga")).ctr).toBeNull();
  });
});

/**
 * QA-447-01 — a reescrita O(n) da AC8 mudou o comportamento.
 *
 * A versão antiga montava a janela com `filter(t >= inicio && t <= fim)`, que
 * inclui TODAS as linhas da data final. A nova usa `slice(inicio, fim + 1)`,
 * que para no índice corrente — então, com duas linhas na mesma data, a
 * primeira janela agrega só um pedaço do dia e concorre ao teto com ele.
 *
 * A AC8 é explícita: trocar a implementação SEM mudar o comportamento.
 */
describe("QA-447-01 — duas linhas na mesma data não produzem janela parcial", () => {
  const parcial = dia("2026-05-10", { spend: 100, impressions: 10_000, linkClicks: 200 });
  const resto = dia("2026-05-10", { spend: 300, impressions: 30_000, linkClicks: 600 });

  it("toda janela que termina numa data agrega o DIA INTEIRO, não um pedaço", () => {
    for (const j of janelasDe7Dias([parcial, resto])) {
      expect(j.agregado.spend).toBe(400);
      expect(j.agregado.impressions).toBe(40_000);
    }
  });

  it("uma janela por LINHA, como antes da reescrita", () => {
    expect(janelasDe7Dias([parcial, resto])).toHaveLength(2);
  });

  /**
   * O impacto que motivou a severidade: campanha de 7 dias com dois anúncios
   * por dia (A barato e pequeno, B caro e grande). O CPC verdadeiro da semana é
   * 6440/7000 = 0,92. Com a janela parcial, o teto vinha do anúncio A isolado.
   */
  it("o teto não pode vir de um anúncio isolado num dia", () => {
    const dias = ["10", "11", "12", "13", "14", "15", "16"].flatMap((d) => [
      dia(`2026-05-${d}`, { spend: 20, impressions: 12_000, linkClicks: 100 }),
      dia(`2026-05-${d}`, { spend: 900, impressions: 60_000, linkClicks: 900 }),
    ]);
    const t = teto(calcularTetos([serie("dois-ads", dias)], "paga").cpc);
    expect(t.valor).toBeCloseTo(0.92, 4);
  });
});

/**
 * QA-447-02 — CPM e CTR não são linhas próprias do ranking.
 *
 * spec §2.4: *"o mesmo ganho seria contado duas vezes — CPM caindo 25% arrasta
 * o CPC junto, e o ranking listaria duas oportunidades onde há uma só"*.
 * `CPC = (CPM/1000)/CTR`, então os −50% do CPC já CONTÊM os −25% do CPM e os
 * −33,33% do CTR.
 *
 * O teste dourado existente monta três `ItemRanking` à mão e chama `ranquear`.
 * Este passa pelo `montarRanking`, que é o produtor real.
 */
describe("QA-447-02 — montarRanking no cenário dourado da spec §8", () => {
  const atuais = { cpm: 20, ctr: 0.02, cpc: 1.0, connectRate: 0.8, convLP: 0.024 };
  const comTeto = (metrica: string, valor: number): Teto =>
    ({
      metrica, valor, campaignId: "X", de: "2026-05-12", ate: "2026-05-18",
      base: 999_999, confianca: "alta", fonte: "ad-level",
    }) as Teto;
  const tetosDourados = {
    cpm: comTeto("cpm", 15),
    ctr: comTeto("ctr", 0.03),
    cpc: comTeto("cpc", 0.5),
    connectRate: comTeto("connectRate", 0.9),
    convLP: comTeto("convLP", 0.053125),
  } as ReturnType<typeof calcularTetos>;

  it("devolve exatamente Conv. LP › CPC › Connect", () => {
    expect(montarRanking(tetosDourados, atuais).map((i) => i.metrica)).toEqual([
      "convLP",
      "cpc",
      "connectRate",
    ]);
  });

  it("nem CPM nem CTR viram linha do ranking, mesmo com teto resolvido", () => {
    const metricas = montarRanking(tetosDourados, atuais).map((i) => i.metrica);
    expect(metricas).not.toContain("cpm");
    expect(metricas).not.toContain("ctr");
  });

  it("o Connect Rate fica em 3º, não empurrado para 5º", () => {
    const r = montarRanking(tetosDourados, atuais);
    expect(r[2]?.metrica).toBe("connectRate");
  });
});
