import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Story 18.93 — na variante não-Paga (toda etapa fora de `ehCaptacaoPaga`) a
// tabela "Dados diários" não tem coluna de faturamento: era sempre R$ 0,00 (a
// planilha de leads não traz `value`). A Paga segue com Faturamento único e
// Faturamento Total. Teste de fio: lê o fonte do componente, porque o vitest do
// web não coleta `.test.tsx` ao lado dele.
//
// Prova pela reversão (T3): devolver o ramo `) : ( <TableHead title={TT.faturamento}>
// Faturamento</TableHead> )` derruba o 1º, o 2º e o 4º `it`.

const fonte = readFileSync(
  new URL("../../../components/funnels/crossed-funnel-daily-table.tsx", import.meta.url),
  "utf8",
);

function secao(abre: string, fecha: string): string {
  const inicio = fonte.indexOf(abre);
  const fim = fonte.indexOf(fecha, inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
}

/** Trechos `{isPaidCapture && …}` da seção, do `{` até o `}` que o fecha. */
function blocosSoDaPaga(trecho: string): string[] {
  const blocos: string[] = [];
  const re = /\{isPaidCapture\s*&&/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trecho)) !== null) {
    let profundidade = 0;
    let i = m.index;
    for (; i < trecho.length; i++) {
      if (trecho[i] === "{") profundidade++;
      else if (trecho[i] === "}" && --profundidade === 0) break;
    }
    blocos.push(trecho.slice(m.index, i + 1));
    re.lastIndex = i + 1;
  }
  return blocos;
}

/** Colunas por variante: a Paga vê tudo; a Gratuita, tudo menos os blocos só da Paga. */
function colunas(trecho: string, celula: RegExp): { paga: number; gratuita: number } {
  const conta = (s: string) => (s.match(celula) ?? []).length;
  const paga = conta(trecho);
  const soDaPaga = blocosSoDaPaga(trecho).reduce((n, b) => n + conta(b), 0);
  return { paga, gratuita: paga - soDaPaga };
}

describe("Story 18.93 — Dados diários da Gratuita sem Faturamento (AC1, AC5)", () => {
  it("o cabeçalho não tem a coluna 'Faturamento' solta, nem o tooltip dela", () => {
    expect(fonte).not.toContain("title={TT.faturamento}");
    expect(fonte).not.toMatch(/>\s*Faturamento\s*<\/TableHead>/);
  });

  it("nenhuma célula lê o faturamento da planilha de leads (dia ou total)", () => {
    expect(fonte).not.toMatch(/\br\.faturamento\b/);
    expect(fonte).not.toMatch(/\btotals\.faturamento\b/);
  });

  it("a Paga mantém Faturamento único e Faturamento Total, só sob `isPaidCapture && (` (AC2)", () => {
    // Cabeçalho, célula por dia e total: as duas colunas, nessa ordem.
    expect(fonte).toMatch(
      /\{isPaidCapture && \(\s*<>\s*<TableHead[^>]*title=\{TT\.fatUnico\}[^>]*>\s*Faturamento único\s*<\/TableHead>\s*<TableHead[^>]*title=\{TT\.fatTotal\}[^>]*>\s*Faturamento Total\s*<\/TableHead>/,
    );
    expect(fonte).toMatch(
      /\{isPaidCapture && \(\s*<>\s*<TableCell[^>]*>\s*\{hasSalesData\s*\?\s*fmtCurrency\(fatUnicoDia\(r\.date\)\)[\s\S]*?fmtCurrency\(fatTotalDia\(r\.date\)\)/,
    );
    expect(fonte).toMatch(
      /\{isPaidCapture && \(\s*<>\s*<TableCell[^>]*>\s*\{hasSalesData \? fmtCurrency\(totFatUnico\)[\s\S]*?fmtCurrency\(totFatTotal\)/,
    );
  });

  it("cabeçalho, linha do dia e total têm o mesmo número de células: 17 na Gratuita, 22 na Paga (AC1, AC3)", () => {
    const cabecalho = colunas(secao("<TableHeader>", "</TableHeader>"), /<TableHead[\s>]/g);
    const dia = colunas(secao("<TableBody>", "</TableBody>"), /<TableCell[\s>]|<CelulaConsolidada\b/g);
    const total = colunas(secao("<TableFooter>", "</TableFooter>"), /<TableCell[\s>]|<CelulaConsolidada\b/g);

    // Alinhamento: o rodapé e as linhas espelham o cabeçalho nas duas variantes.
    expect(dia).toEqual(cabecalho);
    expect(total).toEqual(cabecalho);
    // Contagens fixadas pelos AC1 (Gratuita 18 → 17) e AC3 (Paga segue com 22).
    expect(cabecalho).toEqual({ paga: 22, gratuita: 17 });
  });
});
