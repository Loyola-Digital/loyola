import { describe, it, expect } from "vitest";
import { arrDoMrr, fmtUsd, fmtPct, fmtMovimento, avisoDaSerie } from "../overview-revenuecat";

describe("arrDoMrr (AC3)", () => {
  it("os números reais: MRR US$ 596 → ARR US$ 7.152", () => {
    expect(arrDoMrr(596)).toBe(7152);
  });

  it("null não vira zero", () => {
    // Um card de receita anual mostrando 0 afirma que a empresa não fatura.
    expect(arrDoMrr(null)).toBeNull();
    expect(arrDoMrr(undefined)).toBeNull();
  });
});

describe("formatação", () => {
  it("mrr e revenue saem em DÓLAR", () => {
    // Vêm em USD da API. Exibir como real erraria por ~5x.
    expect(fmtUsd(2318)).toContain("US$");
    expect(fmtUsd(2318)).toContain("2.318,00");
  });

  it("ausência vira travessão, não zero (AC4)", () => {
    expect(fmtUsd(null)).toBe("—");
    expect(fmtPct(null)).toBe("—");
    expect(fmtMovimento(null)).toBe("—");
  });

  it("zero real continua sendo zero", () => {
    expect(fmtUsd(0)).toContain("0,00");
    expect(fmtMovimento(0)).toBe("0");
  });

  it("o movimento mostra a direção", () => {
    expect(fmtMovimento(45)).toBe("+45");
    expect(fmtMovimento(-12)).toBe("-12");
  });

  it("a taxa de conversão de trial, com os números medidos", () => {
    expect(fmtPct(0.1421)).toBe("14,21%");
  });
});

describe("avisoDaSerie (AC5)", () => {
  it("declara a data de início em formato brasileiro", () => {
    const a = avisoDaSerie("2026-08-10")!;
    expect(a).toContain("10/08/2026");
  });

  it("sem série, não há aviso", () => {
    expect(avisoDaSerie(null)).toBeNull();
  });
});

// ─────────────────────────── Story 42.14 — cards do Overview ───────────────────────────

import { cardsDoOverview, type EntradaDoOverview, type MetricasDerivadasDoOverview } from "../overview-revenuecat";

const CTX = { diasDoFiltro: 90, hoje: "2026-10-16", serieDesde: null };
const METRICAS = [
  { id: "active_subscriptions", value: 120 },
  { id: "active_trials", value: 30 },
  { id: "mrr", value: 596 },
  { id: "revenue", value: 2318 },
  { id: "new_customers", value: 900 },
  { id: "active_users", value: 11124 },
];
const DERIVADAS: MetricasDerivadasDoOverview = {
  novasAssinaturasPagas: 10, novosTrials: 182, conversoesDeTrial: 26, taxaDeConversaoDeTrial: 26 / 182,
  churnPagante: 5, abandonoDeTrial: 164, cancelamentosPagantes: 30, movimentoDeAssinaturas: 31,
  serieDesde: "2026-08-10", totalDeEventos: 900,
};
const entrada = (p: Partial<EntradaDoOverview> = {}): EntradaDoOverview => ({
  ctx: CTX,
  overview: { tipo: "pronto", dados: METRICAS },
  derivadas: { tipo: "pronto", dados: DERIVADAS },
  ...p,
});

describe("cardsDoOverview (Story 42.14, AC1/AC3c)", () => {
  it("todo card com número tem memorial, e o memorial declara a janela e a frase do filtro", () => {
    const { principais, eventos } = cardsDoOverview(entrada());
    const todos = [...principais, ...eventos];
    expect(todos.map((c) => c.rotulo)).toEqual([
      "Assinaturas ativas", "Trials ativos", "MRR", "ARR", "Receita", "Novos clientes", "Usuários ativos",
      "Conversão para Trial", "Conversão para Pagante",
      "Novas assinaturas pagas", "Conversões de trial", "Churn (pagantes)", "Movimento de assinaturas", "Trials abandonados", "Cancelamentos",
    ]);
    for (const c of todos) {
      expect(c.formula, c.rotulo).toBeDefined();
      expect(c.formula!.period).toBe(c.declaracao.periodo);
      expect(c.formula!.period).toMatch(/(não )?segue o filtro de 90 dias$/);
    }
  });

  it("retratos com `agora` e âmbar; o ARR leva `agora` e o 'MRR × 12' vai no memorial (AC3a)", () => {
    const { principais } = cardsDoOverview(entrada());
    const de = (r: string) => principais.find((c) => c.rotulo === r)!;
    for (const r of ["Assinaturas ativas", "Trials ativos", "MRR", "ARR"]) {
      expect(de(r).declaracao).toMatchObject({ etiqueta: "agora", destaque: true });
    }
    expect(de("ARR").valor).toBe(fmtUsd(7152));
    expect(de("ARR").formula!.expression).toBe("MRR × 12");
    expect(de("ARR").formula!.result).toContain("× 12");
  });

  it("o texto antigo do `title=` continua no memorial (AC1b)", () => {
    const { principais, eventos } = cardsDoOverview(entrada());
    expect(principais.find((c) => c.rotulo === "Assinaturas ativas")!.formula!.note).toContain("Assinaturas pagas ativas neste instante");
    expect(eventos.find((c) => c.rotulo === "Churn (pagantes)")!.formula!.note).toContain("Não inclui trial abandonado nem cancelamento");
    expect(eventos.find((c) => c.rotulo === "Trials abandonados")!.formula!.note).toContain("É abandono, não churn de cliente.");
  });

  it("overview em erro: cada card dele mostra '—' com a causa no memorial — nunca some, nunca zero (PO-D4)", () => {
    const { principais } = cardsDoOverview(entrada({ overview: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429" } }));
    const mrr = principais.find((c) => c.rotulo === "MRR")!;
    expect(mrr.valor).toBe("—");
    expect(mrr.formula!.values[0].value).toBe("RevenueCat 429");
    expect(mrr.formula!.note).toContain("25 consultas por minuto");
    // a conversão depende do denominador do overview: também "—" com a causa
    expect(principais.find((c) => c.rotulo === "Conversão para Trial")!.valor).toBe("—");
  });

  it("eventos em erro: os 6 cards aparecem com '—' e causa (não somem como se não houvesse eventos)", () => {
    const { eventos } = cardsDoOverview(entrada({ derivadas: { tipo: "erro", causa: "outro", mensagem: "Falhou" } }));
    expect(eventos).toHaveLength(6);
    for (const c of eventos) {
      expect(c.valor).toBe("—");
      expect(c.formula!.values[0].value).toBe("Falhou");
    }
  });

  it("carregando: '—' sem memorial (ainda não há o que explicar)", () => {
    const { principais } = cardsDoOverview(entrada({ overview: { tipo: "carregando" } }));
    expect(principais.find((c) => c.rotulo === "MRR")).toMatchObject({ valor: "—", formula: undefined });
  });

  it("métrica ausente da resposta: '—' sem memorial (ausência legítima, AC1c)", () => {
    const { principais } = cardsDoOverview(entrada({ overview: { tipo: "pronto", dados: METRICAS.filter((m) => m.id !== "mrr") } }));
    expect(principais.find((c) => c.rotulo === "MRR")).toMatchObject({ valor: "—", formula: undefined });
    expect(principais.find((c) => c.rotulo === "ARR")).toMatchObject({ valor: "—", formula: undefined });
  });
});
