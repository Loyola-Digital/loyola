/**
 * Story 48.14 — o FIO da página do Planejamento e dos cartões quente/frio.
 *
 * As regras vivem em `lib/utils/planejamento-bases.ts` / `planejamento-realizado.ts`
 * e têm teste próprio (`planejamento-bases.test.ts`, provado por mutação). O que
 * nenhum deles prova é quem as chama. No gate da 48.14 (TEST-001), quatro
 * mutações no ponto de chamada deixaram a suíte inteira verde (1.762/1.762):
 *
 *   W1 — o cartão "Meta · quente" lendo `"frio"`;
 *   W2 — o "Meta · frio" com a referência antes do percentual e a temperatura trocada;
 *   W3 — o simulador lido para TODAS as bases da lista, não só as marcadas (AC7);
 *   W4 — `buyers-origin` pedido para guest (a rota responde 403).
 *
 * E o MNT-001: três `queryKey` da página são cópias das chaves dos hooks de uma
 * base só (para o cache valer entre as duas formas). Se um hook mudar a chave,
 * o cache compartilhado deixa de valer em silêncio — este arquivo compara as
 * duas fontes.
 *
 * Ler o fonte é grosseiro, e só existe porque o pacote web roda os testes em
 * `environment: node` e não coleta `app/**` nem `components/funnels/**`: sem
 * jsdom não há como montar a página. Mesmo padrão de `vturb-bloco-fio.test.ts`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(`../../../${caminho}`, import.meta.url)), "utf-8");

const pagina = ler("app/(app)/projects/[id]/funnels/[funnelId]/planejamento/page.tsx");
const inputs = ler("components/funnels/planejamento-inputs-financeiros.tsx");
const hookRealizado = ler("lib/hooks/use-planejamento-realizado.ts");
const hookVendas = ler("lib/hooks/use-stage-sales-data.ts");
const hookOrigem = ler("lib/hooks/use-sales-journey.ts");

/** O trecho do `useQueries` atribuído a `nome` — até o próximo `useQueries` ou o fim do bloco. */
function blocoDoUseQueries(nome: string): string {
  const i = pagina.indexOf(`const ${nome} = useQueries({`);
  if (i < 0) throw new Error(`não achei \`const ${nome} = useQueries\` na página`);
  const fim = pagina.indexOf("\n  });\n", i);
  return pagina.slice(i, fim);
}

/** O literal da `queryKey` (`[...]`) que começa com `"nome"` no fonte dado. */
function chave(fonte: string, nome: string): string {
  const m = fonte.match(new RegExp(`queryKey: (\\["${nome}",[^\\]]*\\])`));
  if (!m) throw new Error(`não achei a queryKey "${nome}"`);
  return m[1];
}

/** Troca, na chave do hook, cada argumento pelo que a página passa no lugar dele. */
function comoNaPagina(chaveDoHook: string, troca: Record<string, string>): string {
  const [nome, ...args] = chaveDoHook.slice(1, -1).split(",").map((s) => s.trim());
  return `[${[nome, ...args.map((a) => (a in troca ? troca[a] : `<<${a}: sem equivalente na página>>`))].join(", ")}]`;
}

describe("AC5 — os cartões quente/frio da aba 1 leem a temperatura certa", () => {
  it("'Meta · quente' usa o realizado QUENTE das bases (W1)", () => {
    expect(inputs).toMatch(/rotuloComBases\("Meta · quente", gruposDoInvestimentoMeta\(bases, "quente"\)\)/);
  });

  it("'Meta · frio' usa o realizado FRIO, com o percentual planejado ANTES da referência (W2)", () => {
    expect(inputs).toMatch(/rotuloComBases\(`Meta · frio \(\$\{pctPontos\(d\.pctMetaFrio\)\}\)`, gruposDoInvestimentoMeta\(bases, "frio"\)\)/);
  });

  it("cada temperatura aparece exatamente uma vez — nenhum cartão duplicado ou trocado", () => {
    expect([...inputs.matchAll(/gruposDoInvestimentoMeta\(bases, "quente"\)/g)]).toHaveLength(1);
    expect([...inputs.matchAll(/gruposDoInvestimentoMeta\(bases, "frio"\)/g)]).toHaveLength(1);
  });
});

describe("AC7 — as leituras são feitas só para as bases MARCADAS", () => {
  it("`marcadas` vem da lista filtrada pelos ids marcados", () => {
    expect(pagina).toMatch(/const marcadas = basesMarcadasNaOrdemDaLista\(bases\.data\?\.bases \?\? \[\], basesIds\);/);
  });

  it("`comSimulador` deriva de `marcadas`, não da lista inteira (W3)", () => {
    expect(pagina).toMatch(/const comSimulador = marcadas\.filter\(\(b\) => baseTemSimulador\(b\)\);/);
  });

  it("as três leituras do simulador mapeiam `comSimulador`", () => {
    for (const nome of ["inputsQ", "organicosQ", "pagosQ"]) {
      expect(blocoDoUseQueries(nome)).toMatch(/queries: comSimulador\.map\(/);
    }
  });

  it("`/realizado`, `sales-data` e `buyers-origin` mapeiam `marcadas`", () => {
    for (const nome of ["realizadoQ", "vendasQ", "origemQ"]) {
      expect(blocoDoUseQueries(nome)).toMatch(/queries: marcadas\.map\(/);
    }
  });

  it("nenhum `useQueries` itera a lista de `/bases` diretamente", () => {
    expect(pagina).not.toMatch(/queries: bases\.data/);
    expect([...pagina.matchAll(/useQueries\(\{/g)]).toHaveLength(6);
  });
});

describe("guest — `buyers-origin` (403 para guest) não é pedida", () => {
  it("`podeLerOrigem` exclui o guest", () => {
    expect(pagina).toMatch(/const podeLerOrigem = role !== null && role !== "guest";/);
  });

  it("o `enabled` de `buyers-origin` exige `podeLerOrigem` (W4)", () => {
    expect(blocoDoUseQueries("origemQ")).toMatch(/enabled: !!etapa && podeLerOrigem,/);
  });
});

describe("MNT-001 — as chaves copiadas batem com as dos hooks (cache compartilhado)", () => {
  it("`planejamento-realizado` = `usePlanejamentoRealizado`", () => {
    const esperado = comoNaPagina(chave(hookRealizado, "planejamento-realizado"), {
      'projectId ?? ""': "pid",
      'funnelId ?? ""': "b.funnelId",
    });
    expect(chave(pagina, "planejamento-realizado")).toBe(esperado);
  });

  it("`stage-sales-data` = `useStageSalesData(pid, funnelId, stageId, \"main_product,tmb\")`, sem `days`", () => {
    const esperado = comoNaPagina(chave(hookVendas, "stage-sales-data"), {
      projectId: "pid",
      funnelId: "b.funnelId",
      stageId: "etapa?.id ?? null",
      subtype: '"main_product,tmb"',
      days: "undefined",
    });
    expect(chave(pagina, "stage-sales-data")).toBe(esperado);
  });

  it("`buyers-origin` = `useBuyersOrigin(pid, funnelId, stageId)`, sem `days`", () => {
    const esperado = comoNaPagina(chave(hookOrigem, "buyers-origin"), {
      projectId: "pid",
      funnelId: "b.funnelId",
      stageId: 'etapa?.id ?? ""',
      "days ?? null": "null",
    });
    expect(chave(pagina, "buyers-origin")).toBe(esperado);
  });

  it("as três chaves do simulador vêm das fábricas exportadas pelos hooks", () => {
    expect(blocoDoUseQueries("inputsQ")).toMatch(/queryKey: planejamentoInputsQueryKey\(pid, b\.funnelId\)/);
    expect(blocoDoUseQueries("organicosQ")).toMatch(/queryKey: planejamentoOrganicosQueryKey\(pid, b\.funnelId\)/);
    expect(blocoDoUseQueries("pagosQ")).toMatch(/queryKey: planejamentoPagosQueryKey\(pid, b\.funnelId\)/);
  });
});
