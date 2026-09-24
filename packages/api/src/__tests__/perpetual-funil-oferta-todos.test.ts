/**
 * Story 29.79 (AC6) — **"Todos" não muda nada.** Diferencial byte a byte.
 *
 * Sem `funil` e sem `oferta`, toda leitura tocada pela story responde
 * EXATAMENTE o que respondia antes — inclusive a rota pública do Inácio
 * (`public-perpetual-metrics.ts`), que chama as mesmas
 * `calcularVendasDoPerpetuo`/`calcularVendasDiariasDoPerpetuo` e não recebe o
 * filtro (PO-06).
 *
 * ## Como o "antes" foi congelado
 *
 * `fixtures/perpetuo-todos-antes-29-79.json` foi gerado rodando ESTAS
 * requisições contra o código da `main` (5702ee8a), ANTES de qualquer linha da
 * 29.79 — e não é regenerado por este arquivo. O que se compara é o CORPO da
 * resposta como texto: ordem de chaves, campo a mais (`foraDoFiltro: []`,
 * `filtro: null`) ou número com outra casa decimal derrubam o teste.
 *
 * O relógio é fixado (só `Date`) porque as janelas por `days` terminam em
 * `businessToday()`, e o fuso é fixado porque `janelaDoDenominador` passa por
 * `toISOString()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mockReadSheetData,
  popularTabelas,
  montarApp,
  CABECALHO,
  LINHAS,
  FUNIL,
  PROJ,
  DE,
  ATE,
} from "./fixtures/perpetuo-funil-oferta.js";

process.env.TZ = "America/Sao_Paulo";

vi.mock("../services/google-sheets.js", () => ({
  readSheetData: (...a: unknown[]) => mockReadSheetData(...a),
}));

const rotasPublicas = await import("../routes/public-perpetual-metrics.js");
const rotasInternas = await import("../routes/perpetual-sales-data.js");

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_CONGELADO = path.join(aqui, "fixtures", "perpetuo-todos-antes-29-79.json");

const base = `/api/projects/${PROJ}/funnels/${FUNIL}/perpetual`;
/** Cada rota tocada, nas variações de janela que o painel usa. */
export const REQUISICOES = [
  `${base}/sales-data?startDate=${DE}&endDate=${ATE}`,
  `${base}/sales-data?days=30`,
  `${base}/sales-data`,
  `${base}/sales-data-daily?startDate=${DE}&endDate=${ATE}`,
  `${base}/sales-data-daily?days=30`,
  `${base}/sales-data-daily?startDate=${DE}&endDate=${ATE}&groupBy=campaign`,
  `${base}/sales-data-daily?startDate=${DE}&endDate=${ATE}&groupBy=adset`,
  `${base}/sales-data-daily?startDate=${DE}&endDate=${ATE}&groupBy=ad`,
  `${base}/hourly?startDate=${DE}&endDate=${ATE}`,
  `${base}/hourly?days=30`,
  `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?from=${DE}&to=${ATE}`,
  `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?days=30`,
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  mockReadSheetData.mockReset();
  mockReadSheetData.mockResolvedValue({ headers: CABECALHO, rows: LINHAS });
  popularTabelas();
});

afterEach(() => {
  vi.useRealTimers();
});

async function corpos(): Promise<Record<string, string>> {
  const app = await montarApp([rotasPublicas, rotasInternas]);
  const out: Record<string, string> = {};
  for (const url of REQUISICOES) {
    const r = await app.inject({ method: "GET", url });
    expect(r.statusCode, url).toBe(200);
    out[url] = r.body;
  }
  await app.close();
  return out;
}

describe("Story 29.79 AC6 — sem filtro, a resposta é byte a byte a de antes", () => {
  it("a fixture produz vendas, mídia e reembolso de verdade (senão compararia zeros)", async () => {
    const c = await corpos();
    const vendas = JSON.parse(c[REQUISICOES[0]]);
    expect(vendas.totalVendas).toBeGreaterThan(5);
    expect(vendas.vendasReembolsadas).toBe(1);
    expect(vendas.analiseDeOrigem.cliquesNoLink).toBeGreaterThan(0);
    const horaria = JSON.parse(c[REQUISICOES[8]]);
    expect(horaria.porHora.some((h: { investimento: number }) => h.investimento > 0)).toBe(true);
    const pub = JSON.parse(c[REQUISICOES[10]]);
    expect(pub.investimento).toBeGreaterThan(0);
  });

  it("cada rota devolve exatamente o corpo congelado antes da story", async () => {
    const c = await corpos();
    const congelado = JSON.parse(fs.readFileSync(ARQUIVO_CONGELADO, "utf8")) as Record<string, string>;
    expect(Object.keys(congelado).sort()).toEqual([...REQUISICOES].sort());
    for (const url of REQUISICOES) {
      expect(c[url], url).toBe(congelado[url]);
    }
  });
});
