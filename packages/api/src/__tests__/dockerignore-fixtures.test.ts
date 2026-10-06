/**
 * Código que vai para a imagem não pode importar o que o `.dockerignore` deixa fora.
 *
 * ## O deploy que caiu
 *
 * Em 06/10/2026 o deploy da API morreu com sete `TS2307`:
 *
 *     src/scripts/debriefing-conferir.ts(39,20): error TS2307: Cannot find
 *     module '../__tests__/fixtures/debriefing/danilo-gato-pg01.js'
 *
 * O `.dockerignore` exclui toda pasta `__tests__`, em qualquer nível — e com
 * razão, teste não roda em
 * produção. Mas `src/scripts/` VAI para a imagem, o `tsconfig` da API inclui
 * `src` inteiro, e o build do deploy roda `tsc` sobre tudo. Um import de
 * produção para `__tests__` só falha no servidor, nunca na máquina de quem
 * escreveu — porque lá os arquivos estão todos no lugar.
 *
 * O custo foi alto para um defeito barato: a API ficou quatro dias sem subir, e
 * três stories mergeadas não chegaram ao ar.
 *
 * ## O que este teste faz
 *
 * Varre o código de produção (`src/`, fora de `__tests__`), acha todo import
 * que aponta para `__tests__` e exige que a pasta esteja liberada por uma
 * exceção no `.dockerignore`. Falhar aqui é uma linha de `.dockerignore` ou um
 * import a remover; não falhar aqui foi um deploy quebrado.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(AQUI, "..");
const RAIZ = resolve(AQUI, "..", "..", "..", "..");

/** Todo `.ts` de produção: `src/` inteiro, menos os próprios testes. */
function arquivosDeProducao(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "__tests__" || nome === "node_modules" || nome === "dist") continue;
      arquivosDeProducao(caminho, achados);
    } else if (nome.endsWith(".ts") && !nome.endsWith(".test.ts")) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** As exceções (`!…`) declaradas no `.dockerignore`, normalizadas com `/`. */
function excecoesDoDockerignore(): string[] {
  const texto = readFileSync(join(RAIZ, ".dockerignore"), "utf8");
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).replace(/\/\*\*$/, "").replace(/\\/g, "/"));
}

const IMPORT = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g;

describe("imports de produção para __tests__", () => {
  it("todo caminho importado está liberado no .dockerignore", () => {
    const excecoes = excecoesDoDockerignore();
    const problemas: string[] = [];

    for (const arquivo of arquivosDeProducao(SRC)) {
      const conteudo = readFileSync(arquivo, "utf8");
      for (const m of conteudo.matchAll(IMPORT)) {
        const especificador = m[1] ?? m[2] ?? "";
        if (!especificador.includes("__tests__")) continue;

        // O caminho real do que foi importado, relativo à raiz do repositório.
        const alvo = resolve(dirname(arquivo), especificador.replace(/\.js$/, ".ts"));
        const relativo = relative(RAIZ, alvo).replace(/\\/g, "/");
        const liberado = excecoes.some((e) => relativo.startsWith(e));
        if (!liberado) {
          problemas.push(`${relative(RAIZ, arquivo).replace(/\\/g, "/")} → ${especificador}`);
        }
      }
    }

    expect(
      problemas,
      "Arquivo de produção importa de __tests__, que o .dockerignore exclui da imagem. " +
        "O tsc do deploy vai falhar com TS2307 (e passar na sua máquina). " +
        "Libere a pasta com uma exceção `!…` no .dockerignore ou remova o import:\n" +
        problemas.join("\n"),
    ).toEqual([]);
  });

  it("a exceção das fixtures do debriefing continua declarada", () => {
    // O deploy de 06/10 caiu exatamente por estes sete arquivos. Se a linha
    // sumir do .dockerignore numa limpeza futura, isto avisa antes do servidor.
    expect(excecoesDoDockerignore()).toContain(
      "packages/api/src/__tests__/fixtures/debriefing",
    );
  });
});
