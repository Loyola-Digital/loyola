/**
 * Story 29.78 — o FIO do bloco VSL: que os componentes usam as regras testadas.
 *
 * As regras vivem em `lib/utils/vturb-tabela.ts` e têm teste próprio
 * (`estadoDaTabela`, `pitchConfiguradoNoPainel`, `periodoDoCabecalho`). O que
 * nenhum deles prova é quem as alimenta. No gate da 29.78 (TEST-001), trocar
 * `ehPerpetuo` por `!!funnelId` e o `funnelType` do bloco por `"perpetual"`
 * derrubou 0 testes — e com esse fio regredido o lançamento e o mobile passam
 * a chamar o VTurb (1 + N chamadas por abertura) com a tabela escondida.
 *
 * Ler o fonte é grosseiro, e só existe porque o pacote web roda os testes em
 * `environment: node` e não coleta `components/funnels/**`: sem jsdom não há
 * como montar o bloco. É o padrão de `lib/swipe/__tests__/pdf-capa-efeito.test.ts`
 * — pega a regressão que é uma palavra numa linha.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) =>
  readFileSync(fileURLToPath(new URL(`../../../components/funnels/${arquivo}`, import.meta.url)), "utf-8");

const bloco = ler("vsl-collapsible-section.tsx");
const aba = ler("vturb-stage-tab.tsx");
const tabela = ler("vturb-tabela-das-vsls.tsx");

describe("TEST-001 — o tipo do funil chega de verdade ao bloco", () => {
  it("o bloco passa o tipo que o `useFunnel` devolveu — nunca um tipo fixo", () => {
    expect(bloco).toMatch(/const \{ data: funnelData \} = useFunnel\(projectId, funnelId\);/);
    expect(bloco).toMatch(/funnelType=\{funnelData\?\.funnelType \?\? null\}/);
    expect([...bloco.matchAll(/funnelType=/g)]).toHaveLength(1);
    expect(bloco).not.toMatch(/["']perpetual["']/);
  });

  it("o bloco passa o funil da URL", () => {
    expect(bloco).toMatch(/const funnelId = typeof params\?\.funnelId === "string" \? params\.funnelId : null;/);
    expect(bloco).toMatch(/funnelId=\{funnelId\}/);
  });

  it("`ehPerpetuo` depende do tipo do funil", () => {
    expect(aba).toMatch(/const ehPerpetuo = funnelType === "perpetual" && !!funnelId;/);
  });

  it("o hook da tabela só recebe o projeto — e só chama o VTurb — quando é perpétuo", () => {
    expect(aba).toMatch(/useVturbFunnelVsls\(ehPerpetuo && conn\?\.connected \? projectId : null, funnelId, range\)/);
    expect([...aba.matchAll(/useVturbFunnelVsls\(/g)]).toHaveLength(1);
  });

  it("o estado da tabela recebe o mesmo `ehPerpetuo`", () => {
    expect(aba).toMatch(/estadoDaTabela\(\{\s*ehPerpetuo,/);
  });
});

describe("AC12 — o cartão 'Chegaram no pitch' usa a regra do pitch", () => {
  const cartao = (() => {
    const i = aba.indexOf('label="Chegaram no pitch"');
    if (i < 0) throw new Error('não achei o cartão "Chegaram no pitch"');
    return aba.slice(i, aba.indexOf("/>", i));
  })();

  it("o pitch do painel é o da resposta, passado pela regra", () => {
    expect(aba).toMatch(/const pitch = data\.player\.pitchTime;/);
    expect(aba).toMatch(/const pitchOk = pitchConfiguradoNoPainel\(pitch\);/);
  });

  it("sem pitch: valor '—', o motivo da tabela e sem tendência", () => {
    expect(cartao).toMatch(/value=\{pitchOk \? pct\(s\.over_pitch_rate\) : "—"\}/);
    expect(cartao).toMatch(/: MOTIVO_SEM_PITCH\}/);
    expect(cartao).toMatch(/serie=\{pitchOk \? .* : \[\]\}/);
  });

  it("nada no painel usa o pitch cru como condição", () => {
    expect(aba).not.toMatch(/pitch != null/);
    expect(aba).not.toMatch(/\{pitch \?/);
  });
});

describe("DOC-001 — o cabeçalho da tabela mostra o período das linhas", () => {
  it("o cabeçalho usa `periodoDoCabecalho`, não o `range` pedido cru", () => {
    expect(tabela).toMatch(/const periodo = periodoDoCabecalho\(estado, dados, range\);/);
    expect(tabela).toMatch(/\{periodo\.startDate\} → \{periodo\.endDate\}/);
    expect(tabela).not.toMatch(/\{range\.startDate\}/);
  });
});

/**
 * Story 29.82 (AC1/AC8) — o fio do componente: as 10 colunas, na ordem da
 * story, desenhadas a partir das células testadas em `vturb-tabela.test.ts`.
 * A linha de vídeo e a de Total percorrem a MESMA lista de colunas.
 */
describe("Story 29.82 — as colunas completas da tabela das VSLs", () => {
  const colunas = (() => {
    const i = tabela.indexOf("const COLUNAS");
    if (i < 0) throw new Error("não achei `const COLUNAS` em vturb-tabela-das-vsls.tsx");
    return tabela.slice(i, tabela.indexOf("];", i));
  })();

  it("AC1 — as colunas de números, nesta ordem, cada uma da sua célula", () => {
    const pares = [...colunas.matchAll(/chave: "(\w+)",\s*titulo: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(pares).toEqual([
      ["visualizacoes", "Visualizações"],
      ["visUnicas", "Vis. Únicas"],
      ["plays", "Plays"],
      ["playsUnicos", "Plays Únicos"],
      ["playRate", "Play Rate"],
      ["retencao", "Retenção ao Pitch"],
      ["audienciaPitch", "Audiência do Pitch"],
      ["engajamento", "Engajamento"],
      ["cliques", "Cliques no Botão"],
    ]);
    expect(tabela).toMatch(/>Nome<\/th>/);
  });

  it("cabeçalho, linhas e Total percorrem a mesma lista — a célula da linha e a do Total", () => {
    expect([...tabela.matchAll(/\{COLUNAS\.map\(\(c\) => \(/g)]).toHaveLength(3);
    expect(tabela).toContain("<Taxa celula={l[c.chave]} />");
    expect(tabela).toContain("<Taxa celula={total[c.chave]} />");
    expect(tabela).toContain("const linhas = dados.videos.map(linhaDaTabela);");
    expect(tabela).toContain("const total = totalDaTabela(dados.videos);");
  });

  it("R2 — a tabela larga rola na horizontal", () => {
    expect(tabela).toMatch(/<div className="overflow-x-auto">\s*<table className="[^"]*min-w-\[/);
  });

  it("AC2/AC4 — a nota do Total (aparelho conta nos dois) e quem ficou fora do Engajamento", () => {
    expect(tabela).toContain("um aparelho que viu dois vídeos conta nos dois");
    expect(tabela).toMatch(/total\.foraDoEngajamento\.length > 0 && \(/);
    expect(tabela).toContain("{total.foraDoEngajamento.join(\", \")}");
  });
});
