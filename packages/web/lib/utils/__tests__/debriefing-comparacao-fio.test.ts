/**
 * Story 49.13 (gate TEST-001) — o FIO do formulário: que o componente usa as
 * regras testadas em `debriefing-config-form.test.ts`.
 *
 * As funções do módulo folha estão travadas, mas no gate as 4 mutações no
 * chamador sobreviviam à suíte inteira: tirar o 2º argumento de `useFunnels`
 * (o código de hoje, só ativos), mostrar `x.id` no lugar do rótulo, voltar o
 * `nomeDoFunil` à busca inline e passar `[]` no lugar da lista já salva.
 *
 * Ler o fonte é grosseiro, e só existe porque o pacote web roda em
 * `environment: node` e não coleta `components/funnels/**` — sem jsdom não há
 * como montar o formulário. Mesmo padrão de `vturb-bloco-fio.test.ts`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("../../../components/funnels/debriefing-generate-button.tsx", import.meta.url)),
  "utf-8",
);

describe("49.13 TEST-001 — o formulário do gerador usa as regras da lista de comparação", () => {
  it("AC1 — busca os funis com o escopo da comparação (ativos E arquivados), numa única chamada", () => {
    expect(fonte).toMatch(/const \{ data: funis \} = useFunnels\(projectId, ESCOPO_DOS_FUNIS_DA_COMPARACAO\);/);
    expect([...fonte.matchAll(/useFunnels\(/g)]).toHaveLength(1);
  });

  it("AC3 — o item da lista salva mostra o nome pela regra testada", () => {
    expect(fonte).toMatch(/const nomeDoFunil = \(id: string\) => nomeDoFunilDaComparacao\(funis, id\);/);
    expect(fonte).toMatch(/\{i \+ 1\}\. \{nomeDoFunil\(id\)\}/);
  });

  it("AC1/AC2 — as opções saem da regra testada, sem o próprio e sem os já listados, e mostram o rótulo", () => {
    const i = fonte.indexOf("opcoesDaComparacao(funis ?? [], funnelId, f.comparacoes).map((x) => (");
    expect(i).toBeGreaterThan(-1);
    const opcao = fonte.slice(i, fonte.indexOf("</option>", i));
    expect(opcao).toMatch(/<option key=\{x\.id\} value=\{x\.id\}>\s*\{x\.rotulo\}\s*$/);
    expect([...fonte.matchAll(/opcoesDaComparacao\(/g)]).toHaveLength(1);
  });
});
