/**
 * Story 49.14 — o FIO do aviso do AC6 e do rótulo do "em andamento": que o
 * botão e o formulário chamam as funções testadas em
 * `debriefing-carrinho-em-andamento-form.test.ts`. O web roda em
 * `environment: node` e não coleta `components/**`, então o fio é lido do
 * fonte (padrão de `debriefing-em-andamento-fio.test.ts`, lição do gate da 49.13).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const botao = readFileSync(fileURLToPath(new URL("../../../components/funnels/debriefing-generate-button.tsx", import.meta.url)), "utf-8");

describe("AC6 — o aviso de 'todas as fases terminaram' antes do clique", () => {
  it("no botão: o aviso vem de `avisoDoBotaoDeGerar` e aparece sem bloquear (o botão não ganha condição nova)", () => {
    expect(botao).toMatch(/\{avisoParcial\?\.fasesConcluidas && !motivoBloqueio && \(\s*<p[^>]*>\{avisoParcial\.fasesConcluidas\}<\/p>/);
    expect(botao).toMatch(/disabled=\{!cfg \|\| !!motivoBloqueio \|\| gerar\.isPending\}/);
  });

  it("no formulário: só no modo em andamento, com as datas do formulário e o ontem de Brasília", () => {
    expect(botao).toMatch(/const ontem = ontemEmBrasilia\(new Date\(\)\);/);
    expect(botao).toMatch(
      /const fasesConcluidas = emAndamento && todasAsFasesTerminaram\(datasDasFasesDoForm\(f\), ontem\) \? avisoDeFasesConcluidas\(ontem\) : null;/,
    );
    expect(botao).toMatch(/\{fasesConcluidas && <p className="text-\[11px\] text-amber-700">\{fasesConcluidas\}<\/p>\}/);
  });
});

describe("o rótulo do 'em andamento' segue o contrato da API", () => {
  it("o rótulo e a dica vêm de `rotuloDoEmAndamento(apiContrato)`", () => {
    expect(botao).toMatch(/const rotuloEmAndamento = rotuloDoEmAndamento\(apiContrato\);/);
    expect(botao).toMatch(/\{rotuloEmAndamento\.rotulo\}\s*<\/label>/);
    expect(botao).toMatch(/<p className="text-\[11px\] text-muted-foreground">\{rotuloEmAndamento\.dica\}<\/p>/);
    expect(botao).not.toContain("Em andamento (captação aberta)");
  });
});
