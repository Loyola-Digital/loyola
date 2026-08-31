/**
 * A dependência que fazia o spinner girar para sempre.
 *
 * O efeito da capa escreve `estado` logo no começo. Enquanto `estado` esteve na
 * lista de dependências, cada escrita re-executava o efeito, e o cleanup
 * abortava o download recém-iniciado — spinner eterno, com o worker do pdf.js
 * buscado seis vezes por card. Medido na aba, não deduzido.
 *
 * Ler o fonte é grosseiro, e só existe porque o pacote web roda os testes em
 * `environment: node`: sem jsdom não há como montar o componente. Pega
 * exatamente a regressão que aconteceu, que é uma palavra numa linha.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("../../../components/swipe-files/pdf-capa.tsx", import.meta.url)),
  "utf-8",
);

describe("efeito da capa do PDF", () => {
  it("não depende do estado que ele mesmo escreve", () => {
    const deps = [...fonte.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1] ?? "");
    const oEfeitoDoDownload = deps.find((d) => d.includes("url"));
    expect(oEfeitoDoDownload).toBeDefined();
    expect(oEfeitoDoDownload).not.toMatch(/\bestado\b/);
  });

  it("o prazo corre contra o pipeline inteiro, não só contra o fetch", () => {
    // `AbortController` interrompe o download, mas não o pdf.js: sem a corrida,
    // um PDF que trava ao renderizar volta a girar sem fim.
    expect(fonte).toMatch(/Promise\.race/);
  });
});
