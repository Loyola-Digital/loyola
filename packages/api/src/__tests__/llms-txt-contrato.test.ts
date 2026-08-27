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
const rotaPanorama = readFileSync(
  resolve(raiz, "packages/api/src/routes/public-panorama.ts"),
  "utf8",
);
const toolsMcp = readFileSync(resolve(raiz, "packages/mcp/src/tools.ts"), "utf8");

/**
 * O caminho tal como o Fastify o registra, extraído do fonte da rota.
 *
 * Lido do código e não escrito à mão de propósito: uma constante repetida aqui
 * seria só uma terceira cópia para sair de sincronia junto com as outras duas.
 */
function caminhoRegistrado(fonte: string, sufixo: string): string {
  const m = fonte.match(new RegExp(`"(/api/public/[^"]*${sufixo})"`));
  if (!m) throw new Error(`não achei o caminho terminado em "${sufixo}" no fonte da rota`);
  return m[1];
}

describe("Story 44.14 — contrato entre docs/llms.txt e a rota da cadeia de CAC", () => {
  it("o caminho registrado na rota está declarado no llms.txt", () => {
    const caminho = caminhoRegistrado(rotaPublica, "cadeia-cac");

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
    const caminho = caminhoRegistrado(rotaPublica, "cadeia-cac");

    expect(
      toolsMcp.includes("get_stage_cadeia_cac"),
      "A tool get_stage_cadeia_cac não está registrada no MCP",
    ).toBe(true);

    /**
     * QA-4414-05: a versão anterior comparava SEGMENTOS soltos (`api`,
     * `public`, `meta`, ...) com `includes` sobre o arquivo inteiro — e seis dos
     * sete aparecem em qualquer uma das 17 tools. Um caminho errado
     * (`.../etapas/{stageId}/cadeia-cac`) passava.
     *
     * Aqui o path da tool é extraído do template string e normalizado
     * (`${encodeURIComponent(projectId)}` → `:projectId`) para comparar com o
     * caminho da rota INTEIRO, como a asserção do llms.txt já fazia.
     */
    const m = toolsMcp.match(/`(\/api\/public\/[^`]*cadeia-cac)`/);
    expect(m, "não achei o path da cadeia-cac montado em packages/mcp/src/tools.ts").not.toBe(null);

    const daTool = m![1].replace(/\$\{encodeURIComponent\((\w+)\)\}/g, ":$1");

    expect(
      daTool,
      `A tool monta "${daTool}" e a rota registra "${caminho}". ` +
        `Caminhos diferentes = 404 sem o build reclamar.`,
    ).toBe(caminho);
  });

  it("o llms.txt declara a tool na lista do rodapé", () => {
    expect(
      llms.includes("get_stage_cadeia_cac"),
      "A tool existe no MCP mas não está na lista de tools do llms.txt — " +
        "o agente lê essa lista para saber o que pode chamar.",
    ).toBe(true);
  });

  /**
   * QA-4414-01 — o default de período.
   *
   * A primeira versão desta entrada declarava `default: últimos 30 dias`,
   * copiando a regra geral do topo do arquivo. A rota faz o oposto: sem
   * `from`/`to`, `explicitRange` é `false` e o `where` não filtra data
   * (`meta-campaign-daily.ts:110`) — vem o histórico inteiro. Uma etapa com 160
   * dias de série devolveria o CPL de 160 dias sob um rótulo de 30.
   *
   * É a única rota do arquivo que não segue o default de 30 dias, e a única
   * cuja doc precisa dizer isso em voz alta. Este teste é o que impede a frase
   * de voltar.
   */
  it("a entrada da cadeia declara que NÃO tem default de 30 dias", () => {
    const inicio = llms.indexOf("### GET /api/public/meta/v1/projects/{projectId}/stages/{stageId}/cadeia-cac");
    expect(inicio, "a entrada da cadeia sumiu do llms.txt").toBeGreaterThan(-1);
    const fim = llms.indexOf("\n## ", inicio);
    const entrada = llms.slice(inicio, fim === -1 ? undefined : fim);

    expect(
      /hist[oó]rico inteiro/i.test(entrada),
      "A entrada não declara que, sem `from`/`to`, a resposta cobre o histórico inteiro da etapa. " +
        "Sem isso o consumidor herda o default de 30 dias da regra geral (llms.txt:38) e dá " +
        "período errado a todo número do payload.",
    ).toBe(true);

    expect(
      /default:?\s*(de\s*)?[úu]ltimos 30 dias/i.test(entrada),
      "A entrada voltou a declarar um default de 30 dias que a rota não cumpre (QA-4414-01).",
    ).toBe(false);
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

/**
 * Story 44.20 (AC8) — o panorama tem a MESMA dívida da cadeia: uma rota que o
 * agente só encontra se a doc declarar. A 44.14 existe porque `/cadeia-cac`
 * ficou dois epics sem entrada no `llms.txt`; travar a do panorama no mesmo
 * teste é o custo de uma asserção.
 */
describe("Story 44.20 — contrato entre docs/llms.txt e a rota do panorama", () => {
  it("o caminho registrado na rota está declarado no llms.txt", () => {
    const caminho = caminhoRegistrado(rotaPanorama, "panorama-cac");
    const naNotacaoDaDoc = caminho.replace(/:(\w+)/g, "{$1}");
    expect(
      llms.includes(naNotacaoDaDoc),
      `O caminho "${naNotacaoDaDoc}" não está em docs/llms.txt.`,
    ).toBe(true);
  });

  it("a tool get_project_panorama monta o mesmo caminho da rota", () => {
    expect(
      toolsMcp.includes("get_project_panorama"),
      "A tool get_project_panorama não está registrada no MCP",
    ).toBe(true);
    expect(
      llms.includes("get_project_panorama"),
      "A tool não está na lista do rodapé do llms.txt — é a lista que o agente lê",
    ).toBe(true);

    const caminho = caminhoRegistrado(rotaPanorama, "panorama-cac");
    const m = toolsMcp.match(/`(\/api\/public\/[^`]*panorama-cac)`/);
    expect(m, "não achei o path do panorama montado em packages/mcp/src/tools.ts").not.toBe(null);
    const daTool = m![1].replace(/\$\{encodeURIComponent\((\w+)\)\}/g, ":$1");
    expect(daTool).toBe(caminho);
  });

  /**
   * O panorama tem duas armadilhas de leitura que, não declaradas, viram número
   * inventado: `effectiveStatus: null` lido como "pausada" (Story 18.61) e o
   * imposto Meta conferido com ×1,1215 em vez de ×1,1382 (bug da 29.24).
   */
  it("a entrada do panorama declara o gross-up e o null do effectiveStatus", () => {
    const inicio = llms.indexOf("### GET /api/public/meta/v1/projects/{projectId}/panorama-cac");
    expect(inicio, "a entrada do panorama sumiu do llms.txt").toBeGreaterThan(-1);
    const fim = llms.indexOf("\n### ", inicio + 1);
    const entrada = llms.slice(inicio, fim === -1 ? undefined : fim);

    expect(entrada).toContain("1,1382");
    expect(/effectiveStatus/.test(entrada) && /n[aã]o [ée]/i.test(entrada)).toBe(true);
  });
});
