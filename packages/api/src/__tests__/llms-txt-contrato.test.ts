import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Story 44.14 (AC5) — a doc não pode mentir.
 *
 * ## Por que este teste existe
 *
 * A rota `/cadeia-cac` existia desde a Story 44.8, registrada em `app.ts` e
 * testada — e mesmo assim o agente Inácio reconstruiu a cadeia inteira à mão
 * em 2026-08-27, errando em três pontos. A causa não era o código: era que
 * **nenhum documento que ele lê declarava a rota**.
 *
 * Doc de API é dívida que caduca em silêncio. Quando alguém mudar o caminho da
 * rota em `public-cadeia-cac.ts`, nada quebra — o `llms.txt` continua
 * apontando para o caminho antigo, e o consumidor recebe 404 sem que o build
 * reclame. Este teste é a única coisa entre os dois.
 *
 * É o mesmo movimento da Story 44.13: uma regra só vale enquanto alguém a
 * checa.
 *
 * ## O que ele NÃO faz
 *
 * Não valida a prosa da entrada nem a completude dos campos documentados —
 * isso é revisão humana. Ele trava o que é mecanicamente verificável: **o
 * caminho declarado na doc é o caminho que a rota registra**.
 */

const raiz = resolve(import.meta.dirname, "../../../..");

const llms = readFileSync(resolve(raiz, "docs/llms.txt"), "utf8");
const rotaPublica = readFileSync(
  resolve(raiz, "packages/api/src/routes/public-cadeia-cac.ts"),
  "utf8",
);
const toolsMcp = readFileSync(resolve(raiz, "packages/mcp/src/tools.ts"), "utf8");

/**
 * O caminho tal como o Fastify o registra, extraído do fonte da rota.
 *
 * Lido do código e não escrito à mão de propósito: uma constante repetida aqui
 * seria só uma terceira cópia para sair de sincronia junto com as outras duas.
 */
function caminhoRegistrado(fonte: string): string {
  const m = fonte.match(/"(\/api\/public\/[^"]*cadeia-cac)"/);
  if (!m) throw new Error("não achei o caminho da rota no fonte de public-cadeia-cac.ts");
  return m[1];
}

describe("Story 44.14 — contrato entre docs/llms.txt e a rota da cadeia de CAC", () => {
  it("o caminho registrado na rota está declarado no llms.txt", () => {
    const caminho = caminhoRegistrado(rotaPublica);

    // `:projectId` no Fastify vira `{projectId}` na doc — mesma rota, notação
    // diferente. Normalizar aqui é o que permite comparar os dois.
    const naNotacaoDaDoc = caminho.replace(/:(\w+)/g, "{$1}");

    expect(
      llms.includes(naNotacaoDaDoc),
      `O caminho "${naNotacaoDaDoc}" não está em docs/llms.txt. ` +
        `Se a rota mudou, a doc precisa mudar junto — senão o agente recebe 404 sem aviso.`,
    ).toBe(true);
  });

  it("a tool MCP aponta para o mesmo caminho da rota", () => {
    const caminho = caminhoRegistrado(rotaPublica);

    // A tool monta o path com template string e `encodeURIComponent`, então o
    // que se compara são os segmentos literais, não a string inteira.
    const segmentos = caminho
      .split("/")
      .filter((s) => s && !s.startsWith(":"));

    for (const seg of segmentos) {
      expect(
        toolsMcp.includes(seg),
        `O segmento "${seg}" do caminho da rota não aparece em packages/mcp/src/tools.ts`,
      ).toBe(true);
    }

    expect(
      toolsMcp.includes("get_stage_cadeia_cac"),
      "A tool get_stage_cadeia_cac não está registrada no MCP",
    ).toBe(true);
  });

  it("o llms.txt declara a tool na lista do rodapé", () => {
    expect(
      llms.includes("get_stage_cadeia_cac"),
      "A tool existe no MCP mas não está na lista de tools do llms.txt — " +
        "o agente lê essa lista para saber o que pode chamar.",
    ).toBe(true);
  });

  /**
   * AC3 — as ausências declaradas.
   *
   * `bodyConv` e `coberturaVendas` vêm ausentes/`null` **por decisão**, não por
   * falha, e o payload carrega o motivo. Se a doc não repetir isso, o
   * consumidor preenche a lacuna com invenção — que foi exatamente o que
   * aconteceu no laudo de 2026-08-27.
   */
  it("o llms.txt declara as ausências que o payload declara", () => {
    for (const termo of ["bodyConv", "coberturaVendas"]) {
      expect(
        llms.includes(termo),
        `"${termo}" vem ausente/null por desenho e o llms.txt não diz isso. ` +
          `Ausência não declarada vira número inventado.`,
      ).toBe(true);
    }
  });
});
