import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Story 18.92 — vincular a aba do formulário em "Configurar fontes" da etapa de
// Aplicação. O vitest do web só coleta `.test.ts`, então o fio do componente
// (`.tsx`) é conferido pelo texto: cada `it` cai se o trecho voltar ao que era.

const tela = readFileSync(
  new URL("../../../components/funnels/application-stage-view.tsx", import.meta.url),
  "utf8",
);
const hooks = readFileSync(new URL("../../hooks/use-google-sheets.ts", import.meta.url), "utf8");

describe("Story 18.92 — Planilha de aplicação em Configurar fontes", () => {
  it("a seção está dentro do Configurar fontes da etapa (AC1)", () => {
    expect(tela).toContain(
      "<PlanilhaDeAplicacao projectId={projectId} funnelId={funnelId} stageId={stage.id} />",
    );
  });

  it("o vínculo vai com o id DESTA etapa (AC1, AC4)", () => {
    expect(tela).toMatch(/<SheetsPickerDialog[\s\S]*?stageId=\{stageId\}[\s\S]*?\/>/);
  });

  it("lista as abas da etapa (removíveis) e as do funil todo (não removíveis) (AC2)", () => {
    // A linha inteira: a aba do funil todo não pode entrar entre as removíveis
    // (removê-la tira a aba de todas as etapas). Gate @qa TEST-001.
    expect(tela).toContain("const daEtapa = (data?.surveys ?? []).filter((s) => s.stageId === stageId);");
    expect(tela).toContain("const doFunil = (data?.surveys ?? []).filter((s) => s.stageId === null);");
    expect(tela).toContain("do funil todo");
  });

  it("erro ao carregar as abas aparece como erro, não como 'nenhuma aba' (gate @qa UX-001)", () => {
    const erro = tela.indexOf(") : isError ? (");
    const vazio = tela.indexOf("Nenhuma aba de aplicação vinculada ainda.");
    expect(erro).toBeGreaterThan(-1);
    expect(erro).toBeLessThan(vazio);
    expect(tela).toContain("Não consegui carregar as abas vinculadas.");
  });

  it("vincular ou remover atualiza o dashboard da etapa sem recarregar (AC1)", () => {
    const corpo = hooks.slice(hooks.indexOf("function invalidateFunnelSurveys"));
    const fim = corpo.indexOf("\n}\n");
    expect(corpo.slice(0, fim)).toContain('queryKey: ["application-dashboard", projectId, funnelId]');
  });
});
