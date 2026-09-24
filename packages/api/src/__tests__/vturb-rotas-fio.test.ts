import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Story 29.78 — o FIO das rotas do VTurb: que a rota usa a regra testada.
 *
 * ## Por que ler o fonte
 *
 * As regras têm teste dedicado em `vturb-tabela.test.ts`: os predicados do
 * recorte por projeto são provados na SQL serializada, e a escolha do pitch
 * (`pitchDoPainel`) é função pura. O que nenhum deles prova é que a ROTA as
 * chama. No gate da 29.78 (TEST-001), trocar os dois predicados por filtros só
 * de funil no call site de `/vturb/vsls` derrubou 0 testes — e é esse recorte
 * que impede um `funnelId` de outro projeto de listar vídeos alheios e gastar
 * a cota do VTurb com eles.
 *
 * Um teste de rota com banco mockado não resolve: o mock devolve o que o teste
 * mandar, com ou sem o filtro (lição da 44.x). O que trava o fio é o texto do
 * call site — mesmo movimento de `llms-txt-contrato.test.ts`.
 *
 * ## O que ele NÃO faz
 *
 * Não prova a regra (isso é dos testes dedicados) nem o comportamento da rota
 * com o VTurb de verdade. Trava o que é mecanicamente verificável: qual função
 * a rota chama, com quais argumentos, e em que ordem.
 */

const fonte = readFileSync(resolve(import.meta.dirname, "../routes/vturb.ts"), "utf8");

/**
 * O trecho do fonte que registra a rota: do caminho até o próximo marcador de
 * seção (`  // ---- `), o próximo registro (`  fastify.`) ou o fim do plugin.
 */
function blocoDaRota(caminho: string): string {
  const inicio = fonte.indexOf(`"${caminho}"`);
  if (inicio < 0) throw new Error(`não achei a rota "${caminho}" em routes/vturb.ts`);
  const fins = ["\n  // ---- ", "\n  fastify.", "\n});"]
    .map((m) => fonte.indexOf(m, inicio))
    .filter((i) => i > inicio);
  return fonte.slice(inicio, Math.min(...fins));
}

describe("Story 29.78 — fio de GET …/funnels/:funnelId/vturb/vsls (TEST-001)", () => {
  const bloco = blocoDaRota("/api/projects/:projectId/funnels/:funnelId/vturb/vsls");

  it("convidado não passa (403 antes de qualquer leitura)", () => {
    expect(bloco).toMatch(/if \(denyGuest\(request\)\) return reply\.code\(403\)/);
    expect(bloco.indexOf("denyGuest(request)")).toBeLessThan(bloco.indexOf(".where("));
  });

  it("os DOIS filtros de banco da rota são os predicados testados, com o projeto e o funil da URL", () => {
    const filtros = [...bloco.matchAll(/\.where\(/g)];
    expect(filtros).toHaveLength(2);
    expect(bloco).toContain(".where(condicaoDoFunilNoProjeto(p.data.projectId, p.data.funnelId))");
    expect(bloco).toContain(".where(condicaoDosVinculosDoFunil(p.data.projectId, p.data.funnelId))");
  });

  it("funil de outro projeto → 404 ANTES de ler vínculos ou chamar o VTurb", () => {
    const naoAchou = bloco.indexOf("if (!funnel) return reply.code(404)");
    expect(naoAchou).toBeGreaterThan(-1);
    expect(naoAchou).toBeLessThan(bloco.indexOf("condicaoDosVinculosDoFunil("));
    expect(naoAchou).toBeLessThan(bloco.indexOf("lerTabelaDasVsls("));
  });

  it("os vídeos lidos são a união deduplicada dos vínculos recortados", () => {
    expect(bloco).toContain("videos: unirVideosDoFunil(vinculos)");
  });
});

describe("Story 29.78 — fio do GET …/vturb/players/:id/overview (AC12)", () => {
  const bloco = blocoDaRota("/api/projects/:projectId/stages/:stageId/vturb/players/:id/overview");

  it("o pitch vem de `pitchDoPainel` sobre a `/players/list`", () => {
    expect(bloco).toMatch(/listPlayers\(conn\.token, \{ timezone: conn\.timezone \}\)\s*\.then\(\(daConta\) => pitchDoPainel\(link, daConta\)\.pitchTime\)/);
  });

  it("a cópia do vínculo (`link.pitchTime`) não aparece em lugar nenhum da rota", () => {
    expect(bloco).not.toContain("link.pitchTime");
  });

  it("toda sessions/stats e stats_by_day do painel leva o corpo com o pitch atual", () => {
    const chamadas = [...bloco.matchAll(/sessionStats(?:ByDay)?\(conn\.token, ([^)]*\)?)/g)].map((m) => m[1]);
    // agregado e diário, a segunda tentativa dos dois e a do diário vazio
    expect(chamadas.length).toBeGreaterThanOrEqual(5);
    for (const corpo of chamadas) expect(corpo).toMatch(/^comPitchAtual\(\w+\)$/);
    expect(bloco).toContain(
      "const comPitchAtual = (pitchTime: number | null) => ({ ...base, videoDuration: link.duration, pitchTime });",
    );
  });

  it("a resposta devolve em `player.pitchTime` o pitch atual", () => {
    expect(bloco).toMatch(/player: \{[\s\S]*?\n\s+pitchTime,\n\s+\},/);
  });
});
