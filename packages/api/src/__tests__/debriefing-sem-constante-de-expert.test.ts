/**
 * Story 49.5 AC9 (M2 da Fase 12) — nenhum valor [EXPERT] da skill nem o fator
 * fixo de imposto dela no código das 49.3, 49.4 e 49.5: closers, keywords de
 * bump e o medium de closer vêm de config/`seller_aliases`/`product_types`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARQUIVOS = [
  "services/debriefing-hygiene.ts",
  "services/debriefing-money-time-engine.ts",
  "services/debriefing-money-time-loader.ts",
  "services/debriefing-audience-engine.ts",
  "services/debriefing-audience-loader.ts",
  "services/debriefing-payload.ts",
  "services/debriefing-guards.ts",
  "services/debriefing-fixture-compare.ts",
  "scripts/debriefing-conferir.ts",
];

const PROIBIDOS: [string, RegExp][] = [
  ["fator de imposto da skill (1.13 / 1,13)", /(^|[^\d])1[.,]13(?!\d)/],
  ["closer do DG: isabela", /isabela/i],
  ["closer do DG: kayta", /kayta/i],
  ["closer do DG: katia", /k[aá]tia/i],
  ["closer do DG: alberto", /alberto/i],
  ["keyword de bump do DG: gravaç", /grava[çc][aã]o|gravaç/i],
  ["keyword de bump do DG: 3 em 1", /3 em 1/i],
  ["utm_medium de closer do DG: x1", /["'`]x1["'`]/i],
];

describe("AC9 — sem constante de outro expert nem fator da skill", () => {
  it.each(ARQUIVOS.map((a) => [a]))("%s", (arquivo) => {
    const texto = readFileSync(join(SRC, arquivo), "utf8");
    for (const [rotulo, re] of PROIBIDOS) expect(re.test(texto), `${arquivo}: ${rotulo}`).toBe(false);
  });

  it("o teste estático pega o literal quando ele existe (prova do detector)", () => {
    const amostra = 'const fator = 1.13; const closer = "Isabela"; utm_medium === "x1"; "Gravação da Imersão"';
    const pegos = PROIBIDOS.filter(([, re]) => re.test(amostra)).map(([r]) => r);
    expect(pegos).toEqual(expect.arrayContaining([
      "fator de imposto da skill (1.13 / 1,13)",
      "closer do DG: isabela",
      "utm_medium de closer do DG: x1",
      "keyword de bump do DG: gravaç",
    ]));
  });
});
