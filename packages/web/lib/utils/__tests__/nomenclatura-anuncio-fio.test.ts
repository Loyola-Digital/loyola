/**
 * Story 47.16 — o FIO entre as funções puras (testadas em
 * `nomenclatura-anuncio.test.ts` e `mensagem-de-api-atras.test.ts`) e as
 * telas que as usam.
 *
 * Lição do gate de 23/09: as provas diferenciais só atacavam funções puras, e
 * cortar a ligação no COMPONENTE derrubava 0 testes. Os `.tsx` de
 * `components/nomenclatura` não são coletados pelo vitest do web (`environment:
 * node`, sem jsdom), então o que se prova aqui é o fonte — grosseiro, mas pega
 * exatamente a regressão possível: uma chamada que some ou volta a ser inline.
 * Padrão de `lib/swipe/__tests__/pdf-capa-efeito.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
const gerador = ler("../../../components/nomenclatura/ads/gerador-de-anuncio.tsx");
const lista = ler("../../../components/nomenclatura/ads/lista-de-anuncios.tsx");
const hooks = ler("../../hooks/use-nomenclatura.ts");

describe("gerador de anúncio — as ligações da 47.16", () => {
  // Story 47.18 (AC3, PO-06) — INVERTIDO: na 47.16 a sigla ia por `siglaParaSugestao` (que omitia perpetuo); agora o
  // escopo inteiro vai por `parametrosDoProximoNn` — perpetuo inclusive. O preenchimento do NÚMERO segue em comSugestaoDoLancamento.
  it("AC7 + 47.18: o escopo do NN vai por parametrosDoProximoNn (perpetuo chega à rota); o número, via comSugestaoDoLancamento", () => {
    expect(gerador).toMatch(/useProximoNnDeAnuncio\(editando \? "" : estado\.expertId, parametrosDoProximoNn\(estado\)\)/);
    expect(gerador).not.toMatch(/siglaParaSugestao/);
    expect(gerador).toMatch(/setEstado\(\(e\) => comSugestaoDoLancamento\(e, proximo\.data\?\.launchSeqSugerido\)\)/);
    // o preenchimento inline antigo (que ignorava a sigla) não pode voltar
    expect(gerador).not.toMatch(/launchSeq: String\(proximo\.data!?\.launchSeqSugerido\)/);
  });
  it("AC7: o campo \"Nº do lançamento\" fica desabilitado com perpetuo, com a explicação", () => {
    expect(gerador).toMatch(/const semNumero = siglaSemNumero\(estado\.launchType\)/);
    expect(gerador).toMatch(/disabled=\{!estado\.launchType \|\| semNumero\}/);
    expect(gerador).toMatch(/perpétuo não tem número/);
  });
  it("AC8: editar lê o formato do nome gravado e a prévia usa esse formato (v2 dos 6 do dg não vira v3)", () => {
    expect(gerador).toMatch(/modo\.tipo === "editar" && origem\.data \? formatoDoAnuncioGravado\(origem\.data\) : "v3"/);
    expect(gerador).toMatch(/previaDoAnuncio\(estado, experts\.data \?\? \[\], partes, \{ formato \}\)/);
  });
  it("AC4 (opção B): a prévia desenha o `--` só quando há descrição", () => {
    expect(gerador).toMatch(/p\.campo === "description" && p\.valor \? <span className="text-muted-foreground">--<\/span>/);
  });
  it("AC11: o erro ao salvar passa por mensagemDeApiAtrasAoSalvarAnuncio com o veredito do contrato", () => {
    expect(gerador).toMatch(/compareApiContract\(saude\.data\?\.contract, API_CONTRACT_VERSION\)\.kind === "api-atras"/);
    expect(gerador).toMatch(/\{mensagemDeApiAtrasAoSalvarAnuncio\(erro, apiAtras\) \?\? erro\.mensagem\}/);
  });
  it("AC6: o corpo do Salvar vem de corpoDoAnuncio (launchSeq null com perpetuo) — no POST e no PATCH", () => {
    // QA 47.16 TEST-001: o PATCH manda exatamente o corpo testado em corpoDaEdicaoDoAnuncio (nada montado à mão)
    expect(gerador).toMatch(/await editar\.mutateAsync\(\{ id: \(modo as \{ id: string \}\)\.id, dados: corpoDaEdicaoDoAnuncio\(estado, \{ padraoAntigo \}\) \}\)/);
    expect(gerador).toMatch(/: await criar\.mutateAsync\(corpoDoAnuncio\(estado\)\)/);
    expect(gerador).not.toMatch(/launchSeq: corpo\.launchSeq/);
  });
  it("MNT-001: \"Copiar nome completo\" depende só de haver nome (a comparação com a estrutura era código morto)", () => {
    expect(gerador).toMatch(/disabled=\{!previa\.nome\} onClick=\{\(\) => previa\.nome && void copiarTexto\(previa\.nome\)\}/);
    expect(gerador).not.toMatch(/previa\.nome === previa\.estrutura/);
  });
});

describe("gerador de anúncio — as ligações da 47.18 (NN por lançamento e por tipo)", () => {
  it("AC3/AC7: o NN só é preenchido por comSugestaoDoNn (escopo igual, API nova) — o preenchimento inline antigo não volta", () => {
    expect(gerador).toMatch(/if \(!editando\) setEstado\(\(e\) => comSugestaoDoNn\(e, proximo\.data\)\);/);
    expect(gerador).not.toMatch(/creativeSeq: proximo\.data!?\.creativeSeqTexto/);
  });
  it("AC3b: tipo, sigla e nº passam por aoEscolherNoAnuncio com { editando } — o nº do lançamento também (não mais setEstado inline)", () => {
    expect(gerador).toMatch(/const escolher = \(campo: keyof EstadoDoAnuncio\) => \(v: string\) => setEstado\(\(e\) => aoEscolherNoAnuncio\(e, campo, v, \{ editando \}\)\);/);
    expect(gerador).toMatch(/setEstado\(\(s\) => aoEscolherNoAnuncio\(s, "launchSeq", v, \{ editando \}\)\)/);
    expect(gerador).not.toMatch(/launchSeq: e\.target\.value/);
  });
  it("AC6/AC7: a linha do NN vem de textoDoNnDoCriativo (com a falha da consulta); o texto \"Sequência única por expert\" saiu", () => {
    expect(gerador).toMatch(/const dicaDoNn = textoDoNnDoCriativo\(\{ estado, resposta: proximo\.data, expertCode, editando, erro: proximo\.error \? erroDaApi\(proximo\.error\)\.mensagem : null \}\);/);
    expect(gerador).toMatch(/dicaDoNn\.aviso \? "text-warning" : "text-muted-foreground"\)\}>\{dicaDoNn\.texto\}/);
    expect(gerador).not.toMatch(/Sequência única por expert/);
    expect(gerador).not.toMatch(/nnOcupado/);
  });
  it("AC5: o 409 com sugestão só troca o NN fora da edição", () => {
    expect(gerador).toMatch(/if \(!editando && err\.status === 409 && err\.corpo\?\.sugestao\) setEstado/);
  });
  it("AC7: o hook manda tipo e nº à rota e os põe na chave da query (trocar o escopo refaz a consulta)", () => {
    expect(hooks).toMatch(/queryKey: \["nomenclatura", "ads", "proximo", expertId, p\.launchType \?\? "", p\.creativeType \?\? "", p\.launchSeq \?\? ""\]/);
    expect(hooks).toMatch(/query\(\{ expertId, launchType: p\.launchType, creativeType: p\.creativeType, launchSeq: p\.launchSeq \}\)/);
    expect(hooks).toMatch(/apiClient<RespostaDoProximoNn>/);
  });
});

describe("AC6: nenhuma tela monta sigla + número à mão (perpetuonull/perpetuo00)", () => {
  for (const [nome, fonte] of [["gerador-de-anuncio.tsx", gerador], ["lista-de-anuncios.tsx", lista]] as const) {
    it(nome, () => {
      expect(fonte).toMatch(/textoDoLancamento\(a\.launchType, a\.launchSeq\)/);
      expect(fonte).not.toMatch(/String\(a\.launchSeq\)/);
      expect(fonte).not.toMatch(/\{a\.launchType\}\{/);
    });
  }
});

describe("Story 47.19 — no Novo anúncio, o lançamento vem antes do tipo de criativo", () => {
  // Posição de cada campo pelo `id` no fonte: um por linha no grid (47.14), então a ordem no fonte É a ordem na tela.
  const posicao = (id: string) => {
    const i = gerador.indexOf(`id="${id}"`);
    expect(i, `campo ${id} não encontrado no gerador`).toBeGreaterThan(-1);
    return i;
  };
  it("AC3: Sigla (a-sigla) e Nº do lançamento (a-lnn) aparecem antes do Tipo de criativo (a-tipo) e do NN (a-nn)", () => {
    for (const lancamento of ["a-sigla", "a-lnn"]) {
      for (const depois of ["a-tipo", "a-nn"]) expect(posicao(lancamento)).toBeLessThan(posicao(depois));
    }
  });
  it("AC1: a ordem completa — Expert → Sigla → Nº → Tipo → Origem → NN → Hook → Body → Mês e ano → Descrição → Observações", () => {
    const ordem = ["a-expert", "a-sigla", "a-lnn", "a-tipo", "a-origem", "a-nn", "a-hook", "a-body", "a-mes", "a-desc", "a-notas"];
    const posicoes = ordem.map(posicao);
    expect(posicoes).toEqual([...posicoes].sort((x, y) => x - y));
  });
});
