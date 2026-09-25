import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Story 29.81 (AC8/AC10) — o FIO do feed público de VSL: que a rota usa a
 * montagem testada em `public-vsl.test.ts`.
 *
 * As regras (`retencaoDoVturb`, `montarEtapaDoFeed`, `lerEtapasDoFeed`) têm
 * teste próprio. O que nenhum deles prova é que a ROTA as chama — trocar
 * `lerEtapasDoFeed` pelo laço antigo (`derivarCadeia` + a cópia do pitch)
 * deixaria aqueles testes verdes. Mesmo movimento de `vturb-rotas-fio.test.ts`
 * e `llms-txt-contrato.test.ts`: travar o texto do call site.
 */

const fonte = readFileSync(resolve(import.meta.dirname, "../routes/public-vsl.ts"), "utf8");
/** O código sem comentários — os comentários citam a montagem antiga de propósito. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Story 29.81 — fio de GET /api/public/meta/v1/projects/:projectId/vsl-funnel", () => {
  it("as linhas saem de `lerEtapasDoFeed`, com a /players/list e o pitch que ela devolve", () => {
    expect([...fonte.matchAll(/lerEtapasDoFeed\(\{/g)]).toHaveLength(1);
    expect(fonte).toMatch(/vinculos: players,/);
    expect(fonte).toMatch(/listarPlayers: \(\) => listPlayers\(token, \{ timezone: conn\.timezone \}\)/);
    expect(fonte).toMatch(/pitchTime: v\.pitchTime,/);
  });

  it("nada da montagem antiga: nem `derivarCadeia`/`montarEtapa` direto, nem a cópia do pitch", () => {
    expect(codigo).not.toMatch(/derivarCadeia/);
    expect(codigo).not.toMatch(/montarEtapa\(/);
    expect(codigo).not.toMatch(/pitchTimeUtil/);
    expect(codigo).not.toMatch(/pitchTime: p\.pitchTime/);
  });

  it("a quota conta a /players/list: players.length + 1", () => {
    expect(fonte).toContain("quotaComporta(restantes, players.length + 1)");
  });

  it("falha da /players/list responde com o status do VTurb — não um feed calado", () => {
    const i = fonte.indexOf("lidas = await lerEtapasDoFeed(");
    const trecho = fonte.slice(i, fonte.indexOf("const { etapas } = lidas;"));
    expect(trecho).toMatch(/catch \(err\)/);
    expect(trecho).toMatch(/return reply\.code\(status\)\.send\(/);
    expect(trecho).toMatch(/code: "VTURB_ERROR"/);
  });

  it("toda resposta de sucesso declara a base do pitchRate", () => {
    const sucessos = [...fonte.matchAll(/conectado: (true|false),/g)].length;
    expect(sucessos).toBe(4);
    expect([...fonte.matchAll(/pitchRateBase: PITCH_RATE_BASE,/g)]).toHaveLength(sucessos);
  });
});
