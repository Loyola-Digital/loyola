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

import { cardsDoOverview, janelaDasDerivadas, type EntradaDoOverview, type MetricasDerivadasDoOverview } from "../overview-revenuecat";

const CTX = { diasDoFiltro: 90, hoje: "2026-10-16" };
const METRICAS = [
  { id: "active_subscriptions", value: 120 },
  { id: "active_trials", value: 30 },
  { id: "mrr", value: 596 },
  { id: "revenue", value: 2318 },
  { id: "new_customers", value: 900 },
  { id: "active_users", value: 10000 },
];
const derivadasDe = (p: Partial<MetricasDerivadasDoOverview>): MetricasDerivadasDoOverview => ({
  novasAssinaturasPagas: 10, novosTrials: 182, conversoesDeTrial: 26, taxaDeConversaoDeTrial: 26 / 182,
  churnPagante: 5, abandonoDeTrial: 164, cancelamentosPagantes: 30, movimentoDeAssinaturas: 31,
  serieDesde: "2026-08-10", totalDeEventos: 900, days: 90, desde: "2026-07-19",
  ...p,
});
// Os 28 dias têm números DIFERENTES dos 90: é o que prova de qual janela o card lê.
const D90 = derivadasDe({});
const D28 = derivadasDe({ novosTrials: 50, novasAssinaturasPagas: 4, conversoesDeTrial: 6, days: 28, desde: "2026-09-19" });
const entrada = (p: Partial<EntradaDoOverview> = {}): EntradaDoOverview => ({
  ctx: CTX,
  overview: { tipo: "pronto", dados: METRICAS },
  receita: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valorUsd: 5000 } },
  novosClientes: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valor: 15232, medida: "New Customers", diaIncompleto: true } },
  derivadas: { tipo: "pronto", dados: D90 },
  derivadas28: { tipo: "pronto", dados: D28 },
  // 7 PESSOAS novas pagantes em 28 dias — diferente de 4 + 6 eventos/pessoas das derivadas.
  pagantes28: { tipo: "pronto", dados: { days: 28, desde: "2026-09-19", novosPagantes: { total: 7 } } },
  ...p,
});
const de = (cards: { rotulo: string }[], r: string) => cards.find((c) => c.rotulo === r)! as ReturnType<typeof cardsDoOverview>["principais"][number];

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
    for (const r of ["Assinaturas ativas", "Trials ativos", "MRR", "ARR"]) {
      expect(de(principais, r).declaracao).toMatchObject({ etiqueta: "agora", destaque: true });
    }
    expect(de(principais, "ARR").valor).toBe(fmtUsd(7152));
    expect(de(principais, "ARR").formula!.expression).toBe("MRR × 12");
  });

  it("o texto antigo do `title=` continua no memorial (AC1b)", () => {
    const { principais, eventos } = cardsDoOverview(entrada());
    expect(de(principais, "Assinaturas ativas").formula!.note).toContain("Assinaturas pagas ativas neste instante");
    expect(de(eventos, "Churn (pagantes)").formula!.note).toContain("Não inclui trial abandonado nem cancelamento");
    expect(de(eventos, "Trials abandonados").formula!.note).toContain("É abandono, não churn de cliente.");
  });

  it("Receita segue o filtro pela rota nova (PO-11): valor do período, sem âmbar, sem o `desde` da série do webhook", () => {
    const r = de(cardsDoOverview(entrada()).principais, "Receita");
    expect(r.valor).toBe(fmtUsd(5000));
    expect(r.declaracao).toMatchObject({ etiqueta: "últimos 90 dias", destaque: false, segueOFiltro: true });
    expect(r.formula!.note).toContain("UTC");
    expect(r.formula!.note).toContain("19/07 a 16/10");
  });

  it("Receita com a API ANTERIOR à rota (404 da rota): os 28 dias do overview, declarados e em âmbar — nunca com a etiqueta do filtro", () => {
    const r = de(cardsDoOverview(entrada({ receita: { tipo: "oculto" } })).principais, "Receita");
    expect(r.valor).toBe(fmtUsd(2318));
    expect(r.declaracao).toMatchObject({ etiqueta: "últimos 28 dias", destaque: true });
    expect(r.formula!.note).toContain("versão anterior");
  });

  it("Receita em erro (429): '—' com a causa; NÃO cai para o revenue de 28 dias do overview (AC2d)", () => {
    const r = de(cardsDoOverview(entrada({ receita: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429" } })).principais, "Receita");
    expect(r.valor).toBe("—");
    expect(r.valor).not.toBe(fmtUsd(2318));
    expect(r.formula!.note).toContain("25 consultas por minuto");
  });

  it("Novos clientes segue o filtro (chart customers_new); Usuários ativos fica nos 28 dias, em âmbar — o chart por período não dá pessoas distintas (sonda)", () => {
    const { principais } = cardsDoOverview(entrada());
    expect(de(principais, "Novos clientes")).toMatchObject({ valor: "15.232", declaracao: expect.objectContaining({ etiqueta: "últimos 90 dias", destaque: false }) });
    expect(de(principais, "Usuários ativos").declaracao).toMatchObject({ etiqueta: "últimos 28 dias", destaque: true, segueOFiltro: false });
    expect(de(principais, "Usuários ativos").formula!.note).toContain("contaria a mesma pessoa várias vezes");
  });

  it("overview em erro: cada card dele mostra '—' com a causa no memorial — nunca some, nunca zero (PO-D4)", () => {
    const { principais } = cardsDoOverview(entrada({ overview: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429" } }));
    const mrr = de(principais, "MRR");
    expect(mrr.valor).toBe("—");
    expect(mrr.formula!.values[0].value).toBe("RevenueCat 429");
    expect(mrr.formula!.note).toContain("25 consultas por minuto");
    expect(de(principais, "Conversão para Trial").valor).toBe("—");
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
    expect(de(principais, "MRR")).toMatchObject({ valor: "—", formula: undefined });
  });

  it("métrica ausente da resposta: '—' sem memorial (ausência legítima, AC1c)", () => {
    const { principais } = cardsDoOverview(entrada({ overview: { tipo: "pronto", dados: METRICAS.filter((m) => m.id !== "mrr") } }));
    expect(de(principais, "MRR")).toMatchObject({ valor: "—", formula: undefined });
    expect(de(principais, "ARR")).toMatchObject({ valor: "—", formula: undefined });
  });
});

describe("eventos na janela do filtro — o eco decide a etiqueta (AC10b, PO-10)", () => {
  it("com o eco (days = 90): segue o filtro; a janela começa antes da série → `desde 10/08`", () => {
    const { eventos } = cardsDoOverview(entrada());
    expect(de(eventos, "Churn (pagantes)").declaracao).toMatchObject({ etiqueta: "desde 10/08", segueOFiltro: true, destaque: false });
    expect(de(eventos, "Churn (pagantes)").formula!.period).toContain("só existe desde 10/08");
  });

  it("SEM o eco (API anterior, que ignora ?days= e devolve a série inteira com 200): nunca a etiqueta da janela", () => {
    const semEco = derivadasDe({ days: undefined, desde: undefined });
    const { eventos } = cardsDoOverview(entrada({ derivadas: { tipo: "pronto", dados: semEco } }));
    for (const c of eventos) {
      expect(c.declaracao.etiqueta, c.rotulo).toBe("desde o início da série");
      expect(c.declaracao.destaque).toBe(true);
      expect(c.declaracao.etiqueta).not.toMatch(/últimos|desde 10\/08/);
    }
  });

  it("eco de OUTRA janela também não vale como o filtro", () => {
    expect(janelaDasDerivadas({ days: 28 }, 90)).toEqual({ tipo: "serie" });
    expect(janelaDasDerivadas({ days: null }, 90)).toEqual({ tipo: "serie" });
    expect(janelaDasDerivadas({ days: 90 }, 90)).toEqual({ tipo: "filtro" });
  });
});

describe("Conversão para Trial / Pagante — numerador e denominador nos MESMOS 28 dias (D7, D10, AC2b)", () => {
  it("o numerador é o dos 28 dias (50 trials), NÃO o da janela do filtro (182) nem o da série", () => {
    const t = de(cardsDoOverview(entrada()).principais, "Conversão para Trial");
    expect(t.valor).toBe(fmtPct(50 / 10000));
    expect(t.valor).not.toBe(fmtPct(182 / 10000));
    expect(t.formula!.result).toBe("50 ÷ 10.000 = 0,50%");
    expect(t.formula!.values[0].source).toContain("19/09 a 16/10");
    expect(t.declaracao).toMatchObject({ etiqueta: "últimos 28 dias", destaque: true, segueOFiltro: false });
  });

  it("Conversão para Pagante: numerador = novos pagantes POR PESSOA dos 28 dias (7) — não eventos + pessoas (4 + 6), nem os 90 (10 + 26) (PO-04)", () => {
    const p = de(cardsDoOverview(entrada()).principais, "Conversão para Pagante");
    expect(p.valor).toBe(fmtPct(7 / 10000));
    expect(p.valor).not.toBe(fmtPct(10 / 10000));
    expect(p.formula!.values[0]).toMatchObject({ label: "Novos pagantes (pessoas)", value: "7" });
    expect(p.formula!.values[0].source).toContain("19/09 a 16/10");
  });

  it("Conversão para Pagante com a API anterior à rota de pagantes: '—' com a explicação, sem voltar aos eventos", () => {
    const p = de(cardsDoOverview(entrada({ pagantes28: { tipo: "oculto" } })).principais, "Conversão para Pagante");
    expect(p.valor).toBe("—");
    expect(p.formula!.note).toContain("novos pagantes por pessoa");
  });

  it("sem o eco dos 28 dias (API anterior): '—' com a explicação — dividir a série inteira por 28 dias repetiria o defeito", () => {
    const p = de(cardsDoOverview(entrada({ derivadas28: { tipo: "pronto", dados: derivadasDe({ days: undefined }) } })).principais, "Conversão para Trial");
    expect(p.valor).toBe("—");
    expect(p.formula!.note).toContain("misturaria janelas");
  });

  it("numerador de 28 dias em erro: '—' com a causa", () => {
    const t = de(cardsDoOverview(entrada({ derivadas28: { tipo: "erro", causa: "outro", mensagem: "Falhou 28" } })).principais, "Conversão para Trial");
    expect(t.valor).toBe("—");
    expect(t.formula!.values[0].value).toBe("Falhou 28");
    const p = de(cardsDoOverview(entrada({ pagantes28: { tipo: "erro", causa: "outro", mensagem: "Falhou 28" } })).principais, "Conversão para Pagante");
    expect(p.valor).toBe("—");
    expect(p.formula!.values[0].value).toBe("Falhou 28");
  });
});
