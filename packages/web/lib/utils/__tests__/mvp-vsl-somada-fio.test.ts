/**
 * Story 29.81 (AC10, PO-09) — o FIO da Análise MVP: que o componente usa a
 * montagem testada em `mvp-vsl-somada.test.ts`.
 *
 * A montagem "leitura → Σ → cartão + buildMeasuredRates" é pura e testada. O
 * que nenhum teste dela prova é que `perpetual-mvp-analysis.tsx` a chama — e a
 * lição do gate de 23/09 é que provas só nas funções puras deixam passar um
 * corte no call site. Voltar o cartão ou o `buildMeasuredRates` para os brutos
 * da `/chain`, com a leitura nova disponível, tem que derrubar um teste AQUI.
 *
 * Ler o fonte é grosseiro, e só existe porque o runner do web não coleta
 * `components/funnels/**` (sem jsdom). Padrão de `vturb-bloco-fio.test.ts` e
 * `lib/swipe/__tests__/pdf-capa-efeito.test.ts`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("../../../components/funnels/perpetual-mvp-analysis.tsx", import.meta.url)),
  "utf-8",
);

/** O corpo de uma função do arquivo, do `function Nome(` até a próxima `function ` de topo. */
function corpo(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`não achei function ${nome}`);
  const fim = fonte.indexOf("\nfunction ", i + 1);
  const fimExport = fonte.indexOf("\nexport function ", i + 1);
  const fins = [fim, fimExport].filter((x) => x > i);
  return fonte.slice(i, fins.length ? Math.min(...fins) : undefined);
}

describe("AC2/AC6 — a leitura de TODOS os vídeos, nas duas janelas", () => {
  it("a /vsls é lida na janela da aba e na anterior", () => {
    expect(fonte).toContain("const vsls = useVturbFunnelVsls(projectId, funnel.id, janela);");
    expect(fonte).toContain("const vslsAnterior = useVturbFunnelVsls(projectId, funnel.id, janelaPrev);");
    expect([...fonte.matchAll(/useVturbFunnelVsls\(/g)]).toHaveLength(2);
  });

  it("a /chain só é pedida quando a /vsls respondeu 404 (cota: nunca as duas)", () => {
    expect(fonte).toContain("const usarChain = leituraDaChainNecessaria(vsls.error);");
    expect(fonte).toContain("const usarChainAnterior = leituraDaChainNecessaria(vslsAnterior.error);");
    expect(fonte).toContain("useVturbChain(usarChain ? projectId : null, funnel.id, janela)");
    expect(fonte).toContain("useVturbChain(usarChainAnterior ? projectId : null, funnel.id, janelaPrev)");
    expect([...fonte.matchAll(/useVturbChain\(/g)]).toHaveLength(2);
  });

  it("as duas janelas passam pela MESMA montagem", () => {
    expect(fonte).toMatch(/montarVturbDaMvp\(\{ vsls: vsls\.data, erroVsls: vsls\.error, chain: vturbChain \}\)/);
    expect(fonte).toMatch(
      /montarVturbDaMvp\(\{ vsls: vslsAnterior\.data, erroVsls: vslsAnterior\.error, chain: vturbChainAnterior \}\)/,
    );
  });
});

describe("AC4/AC6 — a cadeia da 29.36 recebe o Σ, não os brutos da /chain", () => {
  it("buildMeasuredRates recebe as fontes montadas, nas duas janelas", () => {
    expect([...fonte.matchAll(/buildMeasuredRates\(/g)]).toHaveLength(2);
    expect(fonte).toMatch(/vturb: vturbMvp\.fontes,\s*motivoSemVturb: vturbMvp\.motivoSemVturb,/);
    expect(fonte).toMatch(/vturb: vturbMvpAnterior\.fontes,\s*motivoSemVturb: vturbMvpAnterior\.motivoSemVturb,/);
  });

  it("nenhum bruto da /chain é lido direto no componente", () => {
    expect(fonte).not.toMatch(/vturbChain(Anterior)?\.brutos/);
    expect(fonte).not.toMatch(/vturbChain(Anterior)?\.cadeia/);
  });

  it("a janela anterior alimenta a coluna 'vs período anterior'", () => {
    expect(fonte).toContain("previousRates={measuredRatesAnterior}");
  });
});

describe("AC1/AC2/AC5 — o cartão", () => {
  const cartao = corpo("VturbVslSomadaCard");

  it("o cartão do Σ é o padrão; o da /chain só na origem 'chain' (API antiga)", () => {
    expect(fonte).toMatch(
      /\{vturbMvp\.origem === "chain" \? \(\s*<VturbChainCard chain=\{vturbChain\} error=\{vturbError\} janela=\{janela\} \/>\s*\) : \(\s*<VturbVslSomadaCard mvp=\{vturbMvp\} janela=\{janela\} \/>\s*\)\}/,
    );
  });

  it("a Retenção é o texto truncado da montagem — nada de toFixed sobre ela", () => {
    expect(cartao).toContain("Retenção ao pitch (acima do pitch ÷ (acima + abaixo)) — igual ao VTurb");
    expect(cartao).toContain("{cartao.retencao.texto}");
    expect(cartao).not.toMatch(/retencao[^\n]*toFixed/);
  });

  it("o Play rate segue na linha de sempre (arredondado)", () => {
    expect(cartao).toContain('<TaxaMedidaLinha rotulo="Play rate (plays únicos ÷ pageviews)" taxa={cartao.playRate} />');
  });

  it("avisa a base da cadeia, diz que é soma e quantos vídeos entraram", () => {
    expect(cartao).toContain("{AVISO_DA_CADEIA}");
    expect(cartao).toContain("{DICA_DA_SOMA}");
    expect(cartao).toMatch(/soma de \{cartao\.entraram\} de \{cartao\.totalDeVideos\}/);
  });

  it("mostra quem ficou fora, com o motivo, e a proveniência de cada vídeo", () => {
    expect(cartao).toContain("cartao.foraDaRetencao.join");
    expect(cartao).toContain("cartao.foraPorFalha.map");
    expect(cartao).toContain("cartao.proveniencia.map");
  });

  it("guarda de janela com a janela DEVOLVIDA pela leitura (PO-15)", () => {
    expect(cartao).toMatch(
      /cartao\.janela\.startDate !== janela\.startDate \|\| cartao\.janela\.endDate !== janela\.endDate/,
    );
  });

  it("o pitch da cópia do vínculo não aparece no cartão novo (AC3)", () => {
    expect(cartao).not.toMatch(/player\.pitchTime/);
  });

  it("falha geral aparece como erro (AC7)", () => {
    expect(cartao).toMatch(/if \(mvp\.erro\)/);
    expect(cartao).toContain("Não foi possível medir a cadeia pelo VTurb: {mvp.erro}");
  });
});
