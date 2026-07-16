/**
 * Story 18.55: testes do computeCreativeSalesMetrics (Único/Total por criativo).
 * Executar: node --test packages/api/tests/creative-sales-metrics.test.mts
 * (Node 23.6+ — type stripping nativo, sem vitest/jest no monorepo)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCreativeSalesMetrics } from "../src/utils/creative-sales-metrics.ts";

// Colunas: [co=, email, bruto, liquido, tx, produto, data]
const IDX = { utmContent: 0, email: 1, bruto: 2, liquido: 3, tx: 4, product: 5, date: 6 };
const BUMPS = ["Order Bump VIP"];

function row(
  co: string, email: string, bruto: string, tx: string, product: string, date: string,
): string[] {
  return [co, email, bruto, "", tx, product, date];
}

test("vendas simples: 1 linha = 1 total + 1 único no criativo do co=", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("222", "b@x.com", "200,50", "tx2", "Ingresso", "01/07/2026"),
    ],
    IDX,
    BUMPS,
  );
  assert.equal(m.ingressosTotaisByAdId.get("111"), 1);
  assert.equal(m.ingressosUnicosByAdId.get("111"), 1);
  assert.equal(m.revenueTotalByAdId.get("111"), 100);
  assert.equal(m.revenueUnicoByAdId.get("111"), 100);
  assert.equal(m.revenueTotalByAdId.get("222"), 200.5);
});

test("order bump: mesmo tx, produto diferente → conta no total, fora do único", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("111", "a@x.com", "50", "tx1", "Order Bump VIP", "01/07/2026"),
    ],
    IDX,
    BUMPS,
  );
  assert.equal(m.ingressosTotaisByAdId.get("111"), 2); // ingresso + bump
  assert.equal(m.ingressosUnicosByAdId.get("111"), 1); // só a captação
  assert.equal(m.revenueTotalByAdId.get("111"), 150);
  assert.equal(m.revenueUnicoByAdId.get("111"), 100);
});

test("retry do gateway: mesmo tx + mesmo produto → descarta a duplicata", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
    ],
    IDX,
    BUMPS,
  );
  assert.equal(m.ingressosTotaisByAdId.get("111"), 1);
  assert.equal(m.revenueTotalByAdId.get("111"), 100);
});

test("recompra: mesmo email em 2 criativos → único fica no ad da compra mais recente", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("222", "a@x.com", "300", "tx2", "Ingresso", "05/07/2026"),
    ],
    IDX,
    BUMPS,
  );
  // Totais: cada compra fica no criativo do próprio co=
  assert.equal(m.ingressosTotaisByAdId.get("111"), 1);
  assert.equal(m.ingressosTotaisByAdId.get("222"), 1);
  // Único: 1 pessoa, atribuída ao criativo da compra mais recente (222)
  assert.equal(m.ingressosUnicosByAdId.get("111"), undefined);
  assert.equal(m.ingressosUnicosByAdId.get("222"), 1);
  assert.equal(m.revenueUnicoByAdId.get("222"), 300);
});

test("venda sem email conta como único avulso; sem co= fica fora", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "", "100", "tx1", "Ingresso", "01/07/2026"),
      row("", "c@x.com", "999", "tx2", "Ingresso", "01/07/2026"), // sem co=
    ],
    IDX,
    BUMPS,
  );
  assert.equal(m.ingressosUnicosByAdId.get("111"), 1);
  assert.equal(m.ingressosTotaisByAdId.size, 1); // só o ad 111
});

test("normalização: co= com prefixo _ do Sheets casa com ad_id puro; linha sem valor é ignorada", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("_111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("111", "b@x.com", "0", "tx2", "Ingresso", "01/07/2026"), // valor 0
    ],
    IDX,
    BUMPS,
  );
  assert.equal(m.ingressosTotaisByAdId.get("111"), 1);
  assert.equal(m.ingressosUnicosByAdId.get("111"), 1);
});

test("soma dos únicos entre criativos = pessoas únicas (consistência da coluna)", () => {
  const m = computeCreativeSalesMetrics(
    [
      row("111", "a@x.com", "100", "tx1", "Ingresso", "01/07/2026"),
      row("111", "b@x.com", "100", "tx2", "Ingresso", "02/07/2026"),
      row("222", "a@x.com", "100", "tx3", "Ingresso", "03/07/2026"), // recompra de a@
      row("222", "c@x.com", "100", "tx4", "Ingresso", "03/07/2026"),
    ],
    IDX,
    BUMPS,
  );
  const somaUnicos = [...m.ingressosUnicosByAdId.values()].reduce((s, v) => s + v, 0);
  assert.equal(somaUnicos, 3); // a@, b@, c@ — cada email conta em exatamente 1 criativo
});
