import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recortarLinhasPelaJanela } from "../utils/janela-das-linhas.js";
import { businessToday } from "../utils/sale-date.js";
import { computeCreativeSalesMetrics } from "../utils/creative-sales-metrics.js";

/**
 * Story 18.85 (AC1/AC3/AC4/AC6) — vendas, ingressos e leads da rota
 * `creative-performance` no período do seletor.
 *
 * Fixture real: planilha de vendas do `bbe-pr2 › Captação Paga` (27 linhas,
 * vendas de 11/08 a 20/09; ID e e-mail em hash). Relógio fixado em
 * 2026-09-23 e `businessToday()` (fuso do negócio): a lição da 18.80 foi uma
 * mutação que caía 8× em BRT e 0× em UTC.
 */

const fx = JSON.parse(
  readFileSync(new URL("./fixtures/bbe-pr2-vendas-janela.json", import.meta.url), "utf-8"),
) as { headers: string[]; rows: string[][]; adsDaEtapa: string[] };

const IDX = { date: 0, utmContent: 1, bruto: 2, tx: 3, product: 4, email: 5, liquido: -1 };
const daEtapa = new Set(fx.adsDaEtapa);

function ingressosDaEtapa(rows: string[][]): number {
  const m = computeCreativeSalesMetrics(rows, IDX, []);
  let n = 0;
  for (const [adId, v] of m.ingressosTotaisByAdId) if (daEtapa.has(adId)) n += v;
  return n;
}

describe("bbe-pr2 real — ingressos da etapa por janela (relógio em 2026-09-23)", () => {
  afterEach(() => vi.useRealTimers());

  const hoje = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
    return businessToday();
  };

  it("sem janela, a planilha inteira conta: 6 (o defeito medido)", () => {
    expect(ingressosDaEtapa(fx.rows)).toBe(6);
  });

  it("7 dias → 0 (todas as vendas da etapa são anteriores a 17/09)", () => {
    // Mutação: ignorar a janela (passar `fx.rows` direto) → > 0 e o teste cai.
    const r = recortarLinhasPelaJanela(fx.rows, IDX.date, 7, hoje());
    expect(ingressosDaEtapa(r.linhas)).toBe(0);
    expect(r).toEqual(expect.objectContaining({ aplicada: true, semData: 0 }));
  });

  it("30 dias → 2 (25/08 a 23/09); só cai ou fica igual", () => {
    // Mutação: ignorar a janela → 6; `hoje − days` inclusivo não muda aqui
    // (24/08 não tem venda) — a borda é provada no bloco de baixo.
    const r = recortarLinhasPelaJanela(fx.rows, IDX.date, 30, hoje());
    expect(ingressosDaEtapa(r.linhas)).toBe(2);
    expect(ingressosDaEtapa(r.linhas)).toBeLessThanOrEqual(ingressosDaEtapa(fx.rows));
    expect(r.linhas.length + r.foraDaJanela + r.semData).toBe(fx.rows.length);
  });
});

describe("a borda é a do shared e o 'hoje' é do fuso do negócio (PO-05)", () => {
  afterEach(() => vi.useRealTimers());
  const linha = (dia: string) => [dia, "1", "47", "", "", ""];

  it("01h30 UTC de 24/09 ainda é 23/09 em São Paulo — a janela de 30 dias começa em 25/08", () => {
    // Mutação: "hoje" em UTC (24/09) → 25/08 sai e o teste cai.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T01:30:00Z"));
    const hoje = businessToday();
    expect(hoje).toBe("2026-09-23");
    const r = recortarLinhasPelaJanela([linha("2026-08-24"), linha("25/08/2026"), linha("2026-09-23")], 0, 30, hoje);
    expect(r.linhas.map((l) => l[0])).toEqual(["25/08/2026", "2026-09-23"]);
  });

  it("`hoje − days` inclusivo (o erro de 1 dia da 18.80) seria 31 dias", () => {
    const r = recortarLinhasPelaJanela([linha("2026-08-24")], 0, 30, "2026-09-23");
    expect(r.linhas).toEqual([]);
  });
});

describe("AC4/PO-04 — nada some calado", () => {
  it("sem coluna de data (não mapeada ou ausente do cabeçalho, idx -1): nenhuma linha sai", () => {
    const rows = [["x"], ["y"]];
    expect(recortarLinhasPelaJanela(rows, -1, 7, "2026-09-23")).toEqual({
      linhas: rows, aplicada: false, foraDaJanela: 0, semData: 0,
    });
  });

  it("data ilegível com a coluna presente: sai e é CONTADA", () => {
    const r = recortarLinhasPelaJanela([[""], ["amanhã"], ["2026-09-22"]], 0, 7, "2026-09-23");
    expect(r.linhas).toEqual([["2026-09-22"]]);
    expect(r.semData).toBe(2);
  });
});

describe("o fio na rota (AC3/AC5)", () => {
  const rota = readFileSync(new URL("../routes/stage-creative-performance.ts", import.meta.url), "utf-8");

  it("recorta leads e vendas pela janela, com o 'hoje' do negócio", () => {
    expect(rota).toMatch(/const hoje = businessToday\(\);/);
    expect(rota).toMatch(/const leadDateIdx = findCol\(leadsData\.headers, leadsMapping\.date\);/);
    expect(rota).toMatch(/recortarLinhasPelaJanela\(leadsData\.rows, leadDateIdx, days, hoje\)/);
    expect(rota).toMatch(/recortarLinhasPelaJanela\(salesData\.rows, saleDataIdx, days, hoje\)/);
  });

  it("os TRÊS laços de venda e o de leads leem as linhas recortadas", () => {
    // Mutação: um laço voltar a `salesData.rows` → aquele número sai sem janela.
    expect(rota.match(/for \(const row of vendasNaJanela!\.linhas\)/g)).toHaveLength(2);
    expect(rota).toMatch(/computeCreativeSalesMetrics\(\s*vendasNaJanela!\.linhas,/);
    expect(rota).toMatch(/for \(const row of leadsNaJanela\.linhas\)/);
    expect(rota).not.toMatch(/for \(const row of (salesData|leadsData)\.rows\)/);
  });

  it("a chave do cache sobe acima da `:v3` da 18.83 (AC5)", async () => {
    const { chaveDoCacheCreativePerformance } = await import("../routes/stage-creative-performance.js");
    expect(chaveDoCacheCreativePerformance("s1", 7)).toBe("s1:7:v4");
  });
});
