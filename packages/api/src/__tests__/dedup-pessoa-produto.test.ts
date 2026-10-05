import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chaveDePessoaEProduto,
  deduplicarPorPessoaEProduto,
} from "../utils/dedup-pessoa-produto.js";

/**
 * Story 41.12 AC1 — a função única da camada 2: a mesma pessoa (e-mail) não
 * compra duas vezes o mesmo produto. Contrato fixado aqui; a paridade entre as
 * pontas que a chamam está em `camada2-paridade.test.ts`.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel: string) => readFileSync(join(AQUI, "..", rel), "utf8");

type L = { email: string | null; produto: string | null; n: number; isenta?: boolean };
const chave = (l: L) => ({ email: l.email, produto: l.produto });
const ns = (ls: L[]) => ls.map((l) => l.n);

describe("AC1 — deduplicarPorPessoaEProduto", () => {
  it("(a)(d) preserva a ordem e sobrevive a PRIMEIRA ocorrência", () => {
    const r = deduplicarPorPessoaEProduto<L>(
      [
        { email: "b@x.com", produto: "Ingresso", n: 1 },
        { email: "a@x.com", produto: "Ingresso", n: 2 },
        { email: "b@x.com", produto: "Ingresso", n: 3 },
        { email: "a@x.com", produto: "Ingresso", n: 4 },
        { email: "c@x.com", produto: "Ingresso", n: 5 },
      ],
      chave,
    );
    expect(ns(r.mantidas)).toEqual([1, 2, 5]);
    expect(ns(r.removidas)).toEqual([3, 4]);
  });

  it("(b) e-mail normalizado (trim + minúsculas) e produto trim + minúsculas; null = \"\"", () => {
    expect(chaveDePessoaEProduto({ email: "  A@X.com ", produto: " Imersão " })).toBe(
      "a@x.com\u0000imersão",
    );
    expect(chaveDePessoaEProduto({ email: "a@x.com", produto: null })).toBe("a@x.com\u0000");
    const r = deduplicarPorPessoaEProduto<L>(
      [
        { email: "A@x.com", produto: "Imersão", n: 1 },
        { email: " a@x.com ", produto: "imersão ", n: 2 },
      ],
      chave,
    );
    expect(ns(r.removidas)).toEqual([2]);
  });

  it("(c) linha sem e-mail (vazio, espaços ou null) NUNCA colapsa", () => {
    const r = deduplicarPorPessoaEProduto<L>(
      [
        { email: null, produto: "Ingresso", n: 1 },
        { email: null, produto: "Ingresso", n: 2 },
        { email: "  ", produto: "Ingresso", n: 3 },
        { email: "", produto: "Ingresso", n: 4 },
      ],
      chave,
    );
    expect(ns(r.mantidas)).toEqual([1, 2, 3, 4]);
    expect(r.removidas).toEqual([]);
  });

  it("produtos diferentes da mesma pessoa (ingresso + combo + bump) contam todos", () => {
    const r = deduplicarPorPessoaEProduto<L>(
      [
        { email: "a@x.com", produto: "Ingresso", n: 1 },
        { email: "a@x.com", produto: "Combo", n: 2 },
        { email: "a@x.com", produto: "Gravação", n: 3 },
      ],
      chave,
    );
    expect(ns(r.mantidas)).toEqual([1, 2, 3]);
  });

  it("(e) R6-8: linha isenta nunca colapsa NEM ocupa a chave", () => {
    const isenta = (l: L) => !!l.isenta;
    const r = deduplicarPorPessoaEProduto<L>(
      [
        { email: "a@x.com", produto: "Assinatura", n: 1, isenta: true },
        { email: "a@x.com", produto: "Assinatura", n: 2, isenta: true },
        { email: "a@x.com", produto: "Assinatura", n: 3 }, // primeira NÃO isenta: ocupa a chave
        { email: "a@x.com", produto: "Assinatura", n: 4 }, // colapsa
      ],
      chave,
      isenta,
    );
    expect(ns(r.mantidas)).toEqual([1, 2, 3]);
    expect(ns(r.removidas)).toEqual([4]);
  });

  it("o separador não deixa (\"a|b\", \"c\") e (\"a\", \"b|c\") virarem a mesma chave", () => {
    expect(chaveDePessoaEProduto({ email: "a|b", produto: "c" })).not.toBe(
      chaveDePessoaEProduto({ email: "a", produto: "b|c" }),
    );
  });
});

describe("AC1/AC13 — uma função só: nenhuma ponta redefine a chave", () => {
  const pontas: { arquivo: string; chamada: RegExp }[] = [
    { arquivo: "services/debriefing-hygiene.ts", chamada: /deduplicarPorPessoaEProduto\(noEscopo,/ }, // 41.12 R7: só as linhas no escopo da etapa
    { arquivo: "services/launch-report-loader.ts", chamada: /deduplicarPorPessoaEProduto\(\s*todas,/ },
    { arquivo: "services/vendas-camada2-planilha.ts", chamada: /deduplicarPorPessoaEProduto\(\s*candidatos,/ },
    { arquivo: "routes/stage-sales-data.ts", chamada: /decidirCamada2DasPlanilhas\(/ },
    { arquivo: "services/sales-daily-sync.ts", chamada: /decidirCamada2DasPlanilhas\(/ },
  ];

  for (const { arquivo, chamada } of pontas) {
    it(`${arquivo} chama a função única e não monta a chave (e-mail + \\u0000 + produto)`, () => {
      const src = ler(arquivo);
      expect(src).toMatch(chamada);
      // A chave inline da 49.3 era `${email}\u0000${produto…}`. Nenhuma ponta a
      // remonta — nem com `normalizarEmail`/`normalizeEmail` ao lado.
      expect(src).not.toMatch(/\$\{email\}\\u0000/);
      expect(src).not.toMatch(/function chaveDePessoaEProduto/);
    });
  }

  it("o debriefing importa a função de utils/ (a 49.3 deixou de ter a camada 2 inline)", () => {
    expect(ler("services/debriefing-hygiene.ts")).toMatch(
      /import \{ deduplicarPorPessoaEProduto \} from "\.\.\/utils\/dedup-pessoa-produto\.js"/,
    );
  });

  it("os motores não ganham dedup nem nome de produto (AC13)", () => {
    for (const motor of ["services/launch-report-engine.ts", "services/perpetual-report-metrics.ts"]) {
      const src = ler(motor);
      expect(src).not.toMatch(/deduplicarPor|dedup-pessoa-produto|vendas-camada2/);
    }
  });
});
