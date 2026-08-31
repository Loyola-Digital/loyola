/**
 * As rotas que a tela do Swipe Files precisa existir.
 *
 * ## Por que um teste que lê o código-fonte
 *
 * Este teste nasceu de um erro real: a rota `/analisar` foi **apagada por
 * acidente** numa edição que removia a rota vizinha, e ninguém percebeu por
 * dois deploys. Nada quebrou no build — uma rota que não existe compila
 * perfeitamente. O sintoma apareceu na tela de quem usa, como um botão que gira
 * para sempre.
 *
 * Ler o arquivo é grosseiro e não prova que a rota FUNCIONA — para isso existem
 * os testes de `swipe-analise`. Prova só que ela não sumiu, que é exatamente a
 * falha que aconteceu e a única que nenhum outro teste aqui pegaria.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("../routes/swipe-files.ts", import.meta.url)),
  "utf-8",
);

/** O que a tela chama. Tirar uma daqui é decisão, não descuido. */
const ROTAS = [
  "`${base}/analisar`",
  "`${base}/upload`",
  "`${base}/preview`",
  "`${base}/clickup-alert`",
];

describe("rotas do swipe files", () => {
  for (const rota of ROTAS) {
    it(`registra ${rota}`, () => {
      expect(fonte).toContain(rota);
    });
  }

  it("a análise responde em NDJSON, não em JSON de uma vez só", () => {
    // Um PDF leva de 20 a 60 s. Voltar para `return { sugestao }` traz de volta
    // a tela pendurada, e é uma mudança de uma linha só.
    const analise = fonte.slice(fonte.indexOf("`${base}/analisar`"));
    expect(analise.slice(0, 3000)).toContain("application/x-ndjson");
  });
});
