import { describe, expect, it } from "vitest";
import { cardsDoResumo, fmtBRL, type EntradaDoResumo } from "../resumo-mobile-lyrio";

/**
 * Story 42.14 (D22, D17, AC2d, PO-D4) — os cards do Resumo mobile. Janela,
 * câmbio e "hoje" fixos. Os valores do filtro (90 dias) e dos 28 dias são
 * DIFERENTES de propósito: é o que mostra de qual janela cada card lê.
 */
const META_90 = { spendLiquido: 1757.5, imposto: 242.5, spendComImposto: 2000 };
const META_28 = { spendLiquido: 878.75, imposto: 121.25, spendComImposto: 1000 };
const OVERVIEW = [
  { id: "mrr", value: 596 },
  { id: "active_subscriptions", value: 120 },
  { id: "active_trials", value: 30 },
  { id: "revenue_last_28_days", value: 300 },
  { id: "new_customers_last_28_days", value: 900 },
];
const entrada = (p: Partial<EntradaDoResumo> = {}): EntradaDoResumo => ({
  ctx: { diasDoFiltro: 90, hoje: "2026-10-16" },
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
  meta: { temCampanhas: true, filtro: META_90, vinteOito: META_28 },
  google: { mostrar: true, filtro: { tipo: "pronto", spend: 500 }, vinteOito: { tipo: "pronto", spend: 100 } },
  receita: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valorUsd: 1000 } },
  novosClientes: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valor: 15232, medida: "New Customers", diaIncompleto: true } },
  overview: { tipo: "pronto", dados: OVERVIEW },
  percentuais: { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 },
  ...p,
});
const card = (e: EntradaDoResumo, id: string) => {
  const c = cardsDoResumo(e).find((x) => x.id === id);
  if (!c) throw new Error(`sem card ${id}`);
  return c;
};

describe("cardsDoResumo — cada card declara a sua janela (AC1a, AC3)", () => {
  it("os 9 cards, na ordem; todo card com número tem memorial com a janela e a frase", () => {
    const cards = cardsDoResumo(entrada());
    expect(cards.map((c) => c.rotulo)).toEqual([
      "Investimento (Meta)", "Investimento (Google)", "Receita (RevenueCat)", "ROAS", "Margem de Contribuição",
      "MRR", "Assinaturas ativas", "Trials ativos", "Novos clientes",
    ]);
    for (const c of cards) {
      expect(c.formula, c.rotulo).toBeDefined();
      expect(c.formula!.period).toBe(c.declaracao.periodo);
      expect(c.formula!.period).toMatch(/(não )?segue o filtro de 90 dias$/);
    }
  });

  it("o fluxo e os Novos clientes seguem o filtro (sem âmbar); retratos `agora`, com âmbar", () => {
    const cards = cardsDoResumo(entrada());
    const etiqueta = (id: string) => cards.find((c) => c.id === id)!.declaracao;
    for (const id of ["investimento-meta", "investimento-google", "receita", "roas", "margem", "novos-clientes"]) {
      expect(etiqueta(id), id).toMatchObject({ etiqueta: "últimos 90 dias", destaque: false, segueOFiltro: true });
    }
    for (const id of ["mrr", "assinaturas", "trials"]) expect(etiqueta(id)).toMatchObject({ etiqueta: "agora", destaque: true });
    // PO-D6: o MRR continua `agora`; o memorial declara o P28D da API.
    expect(cards.find((c) => c.id === "mrr")!.formula!.note).toContain("Retrato, não acumulado: pela documentação do RevenueCat, o MRR é o valor atual das assinaturas pagas ativas, normalizado para um mês.");
    // QA TEST-002 — a frase do P28D (PO-D6) também está amarrada no Resumo, não só no Overview.
    expect(cards.find((c) => c.id === "mrr")!.formula!.note).toContain("A API marca este número com período de 28 dias (P28D), o que a documentação não explica; o painel segue a definição documentada.");
  });

  it("Novos clientes = o total do chart customers_new do filtro (15.232), não o new_customers de 28 dias (900); o memorial diz UTC e o dia incompleto", () => {
    const c = card(entrada(), "novos-clientes");
    expect(c.valor).toBe("15.232");
    expect(c.formula!.values[0].source).toContain("customers_new");
    expect(c.formula!.note).toContain("UTC");
    expect(c.formula!.note).toContain("19/07 a 16/10");
    expect(c.formula!.note).toContain("incompleto");
  });

  it("Novos clientes com a API anterior à rota: os 28 dias do overview, declarados e em âmbar; com erro: '—' e a causa, sem cair para os 28 dias", () => {
    const antigo = card(entrada({ novosClientes: { tipo: "oculto" } }), "novos-clientes");
    expect(antigo).toMatchObject({ valor: "900", declaracao: expect.objectContaining({ etiqueta: "últimos 28 dias", destaque: true }) });
    expect(antigo.formula!.note).toContain("versão anterior");
    const erro = card(entrada({ novosClientes: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429" } }), "novos-clientes");
    expect(erro.valor).toBe("—");
    expect(erro.formula!.note).toContain("25 consultas por minuto");
  });

  it("sem campanha do Google, o card do Google não aparece (como na 42.2)", () => {
    expect(cardsDoResumo(entrada({ google: { mostrar: false, filtro: { tipo: "sem_campanha" }, vinteOito: { tipo: "sem_campanha" } } })).map((c) => c.id)).not.toContain("investimento-google");
  });
});

describe("ROAS e Margem: receita e investimento da MESMA janela (AC2d)", () => {
  it("ROAS = receita do filtro (US$ 1.000 × 5) ÷ (Meta 90 d + Google 90 d) = 5.000 ÷ 2.500 = 2,00x — não os 28 dias", () => {
    const roas = card(entrada(), "roas");
    expect(roas.valor).toBe("2.00x");
    expect(roas.formula!.result).toBe(`${fmtBRL(5000)} ÷ ${fmtBRL(2500)} = 2.00x`);
  });

  it("Margem com os insumos do filtro: 5.000 − 21% − (2.000 + 500) = 1.450; o memorial fecha a conta", () => {
    const m = card(entrada(), "margem");
    expect(m.valor).toBe(fmtBRL(1450));
    expect(m.formula!.result).toBe(`${fmtBRL(3950)} − ${fmtBRL(2500)} = ${fmtBRL(1450)}`);
  });

  it("Investimento (Meta): as duas parcelas do memorial somam o total exibido", () => {
    const meta = card(entrada({ meta: { temCampanhas: true, filtro: { spendLiquido: 100.004, imposto: 13.836, spendComImposto: 113.84 }, vinteOito: META_28 } }), "investimento-meta");
    expect(meta.valor).toBe(fmtBRL(113.84));
    expect(meta.formula!.result).toBe(`${fmtBRL(100)} + ${fmtBRL(13.84)} = ${fmtBRL(113.84)}`);
  });

  it("receita do filtro em ERRO: Receita, ROAS e Margem '—' com a causa — sem cair para o revenue_last_28_days (PO-D4 (4))", () => {
    const e = entrada({ receita: { tipo: "erro", causa: "limite", mensagem: "RevenueCat 429: Too Many Requests" } });
    const receita = card(e, "receita");
    expect(receita.valor).toBe("—");
    expect(receita.formula!.note).toContain("25 consultas por minuto");
    expect(receita.formula!.note).toContain("o ROAS e a Margem de Contribuição");
    for (const id of ["roas", "margem"]) {
      const c = card(e, id);
      expect(c.valor, id).toBe("—");
      expect(c.formula!.values[0]).toMatchObject({ label: "Receita", value: "RevenueCat 429: Too Many Requests" });
    }
  });

  it("Google em erro: o card do Google, o ROAS e a Margem ficam '—' com a causa (nunca 'R$ 0')", () => {
    const e = entrada({ google: { mostrar: true, filtro: { tipo: "erro", mensagem: "invalid_grant" }, vinteOito: { tipo: "erro", mensagem: "invalid_grant" } } });
    expect(card(e, "investimento-google").valor).toBe("—");
    expect(card(e, "investimento-google").formula!.values[0].value).toBe("invalid_grant");
    expect(card(e, "roas").valor).toBe("—");
    expect(card(e, "roas").formula!.values).toContainEqual(expect.objectContaining({ label: "Investimento (Google)", value: "invalid_grant" }));
    expect(card(e, "margem").valor).toBe("—");
  });

  it("API ANTERIOR à rota de receita (404 da rota): o trio volta aos 28 dias, TODO ele, declarado e em âmbar (AC10b)", () => {
    const e = entrada({ receita: { tipo: "oculto" } });
    const receita = card(e, "receita");
    expect(receita.valor).toBe(fmtBRL(1500)); // revenue_last_28_days 300 × 5
    // ROAS = 1.500 ÷ (Meta 28 d 1.000 + Google 28 d 100) — os insumos de 28 dias, não os do filtro
    expect(card(e, "roas").valor).toBe((1500 / 1100).toFixed(2) + "x");
    for (const id of ["receita", "roas", "margem"]) {
      expect(card(e, id).declaracao, id).toMatchObject({ etiqueta: "últimos 28 dias", destaque: true, segueOFiltro: false });
    }
    expect(receita.formula!.note).toContain("versão anterior");
    // os investimentos continuam no filtro: não dependem da rota nova
    expect(card(e, "investimento-meta").declaracao.etiqueta).toBe("últimos 90 dias");
  });

  it("receita carregando: '—' sem memorial (ainda não há o que explicar)", () => {
    const e = entrada({ receita: { tipo: "carregando" } });
    for (const id of ["receita", "roas", "margem"]) {
      expect(card(e, id).valor, id).toBe("—");
      expect(card(e, id).formula, id).toBeUndefined();
    }
  });

  it("overview em erro: MRR, assinaturas e trials '—' com a causa; Novos clientes vem do chart e não depende dele", () => {
    const e = entrada({ overview: { tipo: "erro", causa: "permissao", mensagem: "RevenueCat 403" } });
    for (const id of ["mrr", "assinaturas", "trials"]) {
      expect(card(e, id).valor).toBe("—");
      expect(card(e, id).formula!.note).toContain("permissão");
    }
    expect(card(e, "novos-clientes").valor).toBe("15.232");
  });

  it("QA REL-001 — Meta em erro: Investimento (Meta), ROAS e Margem '—' COM a causa (antes: '—' calado, como se carregasse)", () => {
    const e = entrada({ meta: { temCampanhas: true, filtro: undefined, vinteOito: undefined, erroFiltro: "Erro ao buscar insights da Meta", erro28: "Erro ao buscar insights da Meta" } });
    const meta = card(e, "investimento-meta");
    expect(meta.valor).toBe("—");
    expect(meta.formula!.values[0]).toMatchObject({ label: "Erro", value: "Erro ao buscar insights da Meta" });
    expect(meta.formula!.note).toContain("o ROAS, a Margem e os CACs ficam");
    for (const id of ["roas", "margem"]) {
      expect(card(e, id).valor, id).toBe("—");
      expect(card(e, id).formula!.values, id).toContainEqual(expect.objectContaining({ label: "Investimento (Meta)", value: "Erro ao buscar insights da Meta" }));
    }
  });

  it("QA TEST-001 — receita que ECOA outra janela não vale: '—' com a explicação, nunca o número com a etiqueta do filtro", () => {
    const e = entrada({ receita: { tipo: "pronto", dados: { configured: true, days: 28, desde: "2026-09-19", ate: "2026-10-16", valorUsd: 1000 } } });
    expect(card(e, "receita").valor).toBe("—");
    expect(card(e, "receita").formula!.values[0].value).toContain("28 dias, não para os 90 do filtro");
    expect(card(e, "roas").valor).toBe("—");
  });

  it("QA TEST-001 — novos clientes que ECOAM outra janela não valem", () => {
    const c = card(entrada({ novosClientes: { tipo: "pronto", dados: { configured: true, days: 28, desde: "2026-09-19", ate: "2026-10-16", valor: 9 } } }), "novos-clientes");
    expect(c.valor).toBe("—");
    expect(c.formula!.values[0].value).toContain("28 dias, não para os 90 do filtro");
  });

  it("sem campanha da Meta, o investimento da Meta é R$ 0 (não há investimento), não '—'", () => {
    expect(card(entrada({ meta: { temCampanhas: false, filtro: undefined, vinteOito: undefined } }), "investimento-meta").valor).toBe(fmtBRL(0));
  });
});
