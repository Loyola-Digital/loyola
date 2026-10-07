/**
 * Story 49.12 — o FIO do modo em andamento: que o botão, o formulário e o
 * viewer usam as regras testadas em `debriefing-config-form.ts` e
 * `debriefing-frame.ts`. As funções têm teste próprio
 * (`debriefing-em-andamento-form.test.ts`); o que ele não prova é quem as
 * chama. O pacote web roda em `environment: node` e não coleta
 * `components/funnels/**` nem `app/**`, então o fio é lido do fonte — o padrão
 * de `vturb-bloco-fio.test.ts` (lição do gate da 49.13: reverter o chamador
 * fazia as mutações sobreviverem).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(`../../../${caminho}`, import.meta.url)), "utf-8");

const botao = ler("components/funnels/debriefing-generate-button.tsx");
const viewer = ler("app/(app)/debriefings/[id]/page.tsx");
const hook = ler("lib/hooks/use-debriefing-generate.ts");

describe("AC11 — o botão 'Gerar' no modo em andamento", () => {
  it("o rótulo e o aviso vêm de `avisoDoBotaoDeGerar` com a config lida e o relógio de agora", () => {
    expect(botao).toMatch(/const avisoParcial = avisoDoBotaoDeGerar\(cfg, new Date\(\)\);/);
    expect(botao).toMatch(/\{avisoParcial \? avisoParcial\.rotulo : "Gerar debriefing"\}/);
    expect(botao).toMatch(/\{avisoParcial && !motivoBloqueio && \(\s*<p[^>]*>\{avisoParcial\.detalhe\}<\/p>/);
  });

  it("depois de gerar, diz que substituiu a parcial (o 200 da API traz `substituiuParcial`)", () => {
    expect(botao).toMatch(/substituiuParcial: r\.substituiuParcial === true/);
    expect(botao).toMatch(/gerado\.substituiuParcial\s*\?\s*"Debriefing gerado — substituiu a parcial anterior/);
  });

  it("a geração relê a config (a parcial atual muda depois de gerar)", () => {
    expect(hook).toMatch(/qc\.invalidateQueries\(\{ queryKey: chave\(stageId\) \}\);/);
  });
});

describe("AC1/AC2/AC11 — o formulário", () => {
  it("'em andamento' desabilitado com a frase de API atrás quando a API não tem o contrato 35", () => {
    expect(botao).toMatch(/const motivoEmAndamento = motivoSemEmAndamento\(apiContrato\);/);
    const radio = botao.slice(botao.indexOf('checked={f.situacao === "em-andamento"}') - 200, botao.indexOf('checked={f.situacao === "em-andamento"}'));
    expect(radio).toMatch(/disabled=\{!!motivoEmAndamento\}/);
    expect(botao).toMatch(/\{motivoEmAndamento \? \(\s*<p className="text-\[11px\] text-red-500">\{motivoEmAndamento\}<\/p>/);
  });

  it("as duas respostas da pergunta gravam a situação no formulário", () => {
    expect(botao).toMatch(/checked=\{f\.situacao === "encerrado"\} onChange=\{\(\) => set\(\{ situacao: "encerrado" \}\)\}/);
    expect(botao).toMatch(/onChange=\{\(\) => set\(\{ situacao: "em-andamento" \}\)\}/);
  });

  it("carrinho: a caixa 'ainda não aconteceu' só no modo em andamento, e ela desliga (e limpa) a data", () => {
    expect(botao).toMatch(/disabled=\{k !== "inicioCaptacao" && emAndamento && f\.carrinhoAindaNao\[k\]\}/);
    expect(botao).toMatch(/\{k !== "inicioCaptacao" && emAndamento && \(/);
    expect(botao).toMatch(/carrinhoAindaNao: \{ \.\.\.f\.carrinhoAindaNao, \[k\]: e\.target\.checked \}, \.\.\.\(e\.target\.checked \? \{ \[k\]: "" \} : \{\}\)/);
  });

  it("reabertura/downsell: a 3ª resposta só no modo em andamento; as datas só com 'houve'", () => {
    expect(botao).toMatch(/\(\[true, false, \.\.\.\(emAndamento \? \[AINDA_NAO\] : \[\]\)\] as const\)/);
    expect(botao).toMatch(/\{v === AINDA_NAO \? "Ainda não aconteceu" : v \? "Houve" : "Não houve"\}/);
    expect(botao).toMatch(/\{f\[k\]\.houve === true && \(/);
  });

  it("o salvar manda o corpo de `corpoDoPut` com o contrato da API", () => {
    expect(botao).toMatch(/salvar\.mutateAsync\(corpoDoPut\(f, \{ apiContrato, removidos \}\)\)/);
  });
});

describe("AC14 — o aviso de parcial do viewer fica FORA do iframe", () => {
  it("o viewer mostra `avisoDeParcialNoViewer(debriefing)` antes do iframe", () => {
    const aviso = viewer.indexOf("{avisoDeParcialNoViewer(debriefing) && (");
    expect(aviso).toBeGreaterThan(0);
    expect(viewer).toMatch(/<p className="text-sm min-w-0 flex-1">\{avisoDeParcialNoViewer\(debriefing\)\}<\/p>/);
    expect(aviso).toBeLessThan(viewer.indexOf("<iframe"));
  });

  it("o documento do iframe (e o da edição inline) é montado só com o HTML salvo", () => {
    expect(viewer).toMatch(/buildDebriefingSrcDoc\(debriefing\.html, \{ editable: editMode \}\)/);
    expect([...viewer.matchAll(/avisoDeParcialNoViewer/g)].length).toBe(3); // import + condição + texto
  });
});
