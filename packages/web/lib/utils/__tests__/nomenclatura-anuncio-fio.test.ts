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

describe("gerador de anúncio — as ligações da 47.16", () => {
  it("AC7: a sugestão do número não roda com perpetuo — sigla via siglaParaSugestao, preenchimento via comSugestaoDoLancamento", () => {
    expect(gerador).toMatch(/useProximoNnDeAnuncio\(editando \? "" : estado\.expertId, siglaParaSugestao\(estado\)\)/);
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

describe("AC6: nenhuma tela monta sigla + número à mão (perpetuonull/perpetuo00)", () => {
  for (const [nome, fonte] of [["gerador-de-anuncio.tsx", gerador], ["lista-de-anuncios.tsx", lista]] as const) {
    it(nome, () => {
      expect(fonte).toMatch(/textoDoLancamento\(a\.launchType, a\.launchSeq\)/);
      expect(fonte).not.toMatch(/String\(a\.launchSeq\)/);
      expect(fonte).not.toMatch(/\{a\.launchType\}\{/);
    });
  }
});
