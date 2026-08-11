import { describe, expect, it } from "vitest";
import {
  deriveDailyMetrics,
  sumDailyMetrics,
  type DailyMetricsInput,
} from "@/lib/utils/perpetual-daily-metrics";

/** Dia "normal": todos os denominadores presentes. */
function dia(over: Partial<DailyMetricsInput> = {}): DailyMetricsInput {
  return {
    spend: 1000,
    revenue: 5000,
    margin: 3500,
    salesCount: 10,
    impressions: 50_000,
    linkClicks: 500,
    clicks: 800,
    lpViews: 400,
    ...over,
  };
}

describe("deriveDailyMetrics — dia com todos os denominadores", () => {
  const m = deriveDailyMetrics(dia());

  it("CAC = investimento ÷ vendas", () => {
    expect(m.cac).toBe(100);
  });

  it("ROAS = faturamento bruto ÷ investimento", () => {
    expect(m.roas).toBe(5);
  });

  it("Margem % = margem ÷ faturamento bruto × 100", () => {
    expect(m.marginPct).toBe(70);
  });

  it("Connect Rate = LP views ÷ cliques no LINK × 100", () => {
    // 400 / 500 — e não 400 / 800 (cliques totais).
    expect(m.connectRate).toBe(80);
  });

  it("CPC = investimento ÷ cliques no link", () => {
    expect(m.cpc).toBe(2);
  });

  it("CTR = cliques no link ÷ impressões × 100", () => {
    expect(m.ctr).toBe(1);
  });

  it("CPM = investimento ÷ impressões × 1000", () => {
    expect(m.cpm).toBe(20);
  });

  it("costClicks é a base do link quando ela existe", () => {
    expect(m.costClicks).toBe(500);
  });
});

describe("deriveDailyMetrics — denominador zerado devolve null, nunca 0", () => {
  // A distinção importa: 0% lê-se como "a taxa é zero"; "—" lê-se como "não há
  // base para calcular". São afirmações diferentes e o quadro precisa separá-las.

  it("sem impressões → CTR e CPM null", () => {
    const m = deriveDailyMetrics(dia({ impressions: 0 }));
    expect(m.ctr).toBeNull();
    expect(m.cpm).toBeNull();
  });

  it("sem cliques de link nem totais → CPC null", () => {
    const m = deriveDailyMetrics(dia({ linkClicks: 0, clicks: 0 }));
    expect(m.cpc).toBeNull();
    expect(m.costClicks).toBe(0);
  });

  it("sem vendas → CAC null", () => {
    expect(deriveDailyMetrics(dia({ salesCount: 0 })).cac).toBeNull();
  });

  it("sem investimento → ROAS null", () => {
    expect(deriveDailyMetrics(dia({ spend: 0 })).roas).toBeNull();
  });

  it("sem faturamento → Margem % null (e não 0%, que leria como margem nula)", () => {
    expect(deriveDailyMetrics(dia({ revenue: 0 })).marginPct).toBeNull();
  });
});

describe("deriveDailyMetrics — a base de cliques", () => {
  it("cai para cliques totais quando o dia não reporta link_click", () => {
    const m = deriveDailyMetrics(dia({ linkClicks: 0, clicks: 800 }));
    // Mesmo fallback de deriveDetailMetrics: os números do dia batem com os do
    // Detalhamento por entidade no mesmo recorte.
    expect(m.costClicks).toBe(800);
    expect(m.cpc).toBe(1.25);
    expect(m.ctr).toBeCloseTo(1.6, 10);
  });

  it("Connect Rate NÃO aceita o fallback — sem link_click, é null", () => {
    // A exceção deliberada: cliques totais incluem curtida, comentário e clique
    // no perfil. Usá-los como denominador infla a taxa artificialmente.
    const m = deriveDailyMetrics(dia({ linkClicks: 0, clicks: 800, lpViews: 400 }));
    expect(m.connectRate).toBeNull();
  });

  it("Cliques, CTR e CPC concordam entre si — a conta na calculadora fecha", () => {
    const v = dia({ linkClicks: 0, clicks: 640, impressions: 40_000, spend: 1280 });
    const m = deriveDailyMetrics(v);
    // O que a coluna "Cliques" mostra é o que CPC e CTR usaram.
    expect(m.cpc).toBe(v.spend / m.costClicks);
    expect(m.ctr).toBe((m.costClicks / v.impressions) * 100);
  });

  it("Connect Rate acima de 100% é devolvido como está, não clampado", () => {
    // Acontece de verdade: LP view sem clique rastreado. Clampar esconderia um
    // problema real de rastreamento atrás de um número plausível.
    const m = deriveDailyMetrics(dia({ linkClicks: 100, lpViews: 130 }));
    expect(m.connectRate).toBe(130);
  });
});

describe("guarda de imposto (Story 29.24 → 29.27)", () => {
  it("o spend entra e sai sem nenhum fator aplicado", () => {
    // spend já tributado: 1000 / (1 − 0,1215) = 1138,3038...
    const spendTributado = 1000 / (1 - 0.1215);
    const m = deriveDailyMetrics(dia({ spend: spendTributado, clicks: 0, linkClicks: 100 }));

    // CPC é exatamente spend ÷ cliques. Qualquer gross-up extra aqui daria
    // spend × 1,1383 e este expect falharia — que é todo o ponto do teste.
    expect(m.cpc).toBe(spendTributado / 100);
    expect(m.cpm).toBe((spendTributado / 50_000) * 1000);
    expect(m.cac).toBe(spendTributado / 10);
  });

  it("margem entra pronta e não é recalculada", () => {
    // Sem planilha conectada a linha traz margin = 0 (Story 29.10). Se este
    // módulo recalculasse `revenue × (1−fee) − spend`, viria negativo — o
    // prejuízo inventado que a 29.10 removeu de propósito.
    const m = deriveDailyMetrics(dia({ margin: 0, revenue: 0 }));
    expect(m.marginPct).toBeNull();
  });
});

describe("sumDailyMetrics + deriveDailyMetrics — os totais do período", () => {
  // Dois dias de volumes MUITO desiguais: é onde média-de-médias diverge dos
  // somatórios. Com volumes iguais o teste passaria dos dois jeitos e não
  // provaria nada.
  const d1 = dia({ spend: 100, impressions: 1000, linkClicks: 10, clicks: 10, lpViews: 5, revenue: 200, margin: 100, salesCount: 1 });
  const d2 = dia({ spend: 9900, impressions: 990_000, linkClicks: 9990, clicks: 9990, lpViews: 4995, revenue: 19_800, margin: 9900, salesCount: 99 });

  const totais = sumDailyMetrics([d1, d2]);
  const m = deriveDailyMetrics(totais);

  it("soma os campos aditivos", () => {
    expect(totais.spend).toBe(10_000);
    expect(totais.impressions).toBe(991_000);
    expect(totais.linkClicks).toBe(10_000);
    expect(totais.salesCount).toBe(100);
  });

  it("CPC do total sai dos somatórios, não da média dos CPCs diários", () => {
    // Somatórios: 10.000 / 10.000 = 1,00
    expect(m.cpc).toBe(1);
    // Média das derivadas diárias daria outro número — é o que NÃO queremos.
    const mediaDosCpcs =
      ((deriveDailyMetrics(d1).cpc ?? 0) + (deriveDailyMetrics(d2).cpc ?? 0)) / 2;
    expect(mediaDosCpcs).not.toBe(m.cpc);
  });

  it("CTR do total sai dos somatórios, não da média dos CTRs diários", () => {
    expect(m.ctr).toBeCloseTo((10_000 / 991_000) * 100, 10);
    const mediaDosCtrs =
      ((deriveDailyMetrics(d1).ctr ?? 0) + (deriveDailyMetrics(d2).ctr ?? 0)) / 2;
    expect(mediaDosCtrs).not.toBeCloseTo(m.ctr ?? 0, 10);
  });

  it("Connect Rate do total sai dos somatórios", () => {
    expect(m.connectRate).toBeCloseTo((5000 / 10_000) * 100, 10);
  });

  it("período vazio devolve zeros, e as derivadas viram null", () => {
    const vazio = sumDailyMetrics([]);
    const mv = deriveDailyMetrics(vazio);
    expect(vazio.spend).toBe(0);
    expect(mv.cpc).toBeNull();
    expect(mv.ctr).toBeNull();
    expect(mv.cpm).toBeNull();
    expect(mv.connectRate).toBeNull();
    expect(mv.roas).toBeNull();
    expect(mv.cac).toBeNull();
  });
});
