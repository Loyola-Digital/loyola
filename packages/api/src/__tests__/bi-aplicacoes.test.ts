/**
 * A entidade de planilha.
 *
 * Os testes que importam são os da normalização: a planilha não tem contrato —
 * cada funil monta o formulário do seu jeito, e é o palpite sobre os cabeçalhos
 * que decide se o número sai certo ou sai zero.
 */

import { describe, expect, it } from "vitest";
import {
  TETO_DE_APLICACOES,
  acharCabecalho,
  dataParaIso,
  executarSobreLinhas,
  normalizar,
  validarSpecDeAplicacoes,
  type AplicacaoNormalizada,
} from "../services/bi/aplicacoes.js";
import { ErroDeQuery, querySpecSchema, type QuerySpec } from "../services/bi/query.js";

function spec(over: Record<string, unknown> = {}): QuerySpec {
  return querySpecSchema.parse({
    entity: "aplicacoes",
    metrics: ["aplicacoes.count"],
    filters: {
      "aplicacoes.date": { operator: "$between", value: ["2026-08-01", "2026-08-31"] },
    },
    ...over,
  });
}

const LINHAS: AplicacaoNormalizada[] = [
  { date: "2026-08-01", origem: "instagram" },
  { date: "2026-08-01", origem: "instagram" },
  { date: "2026-08-02", origem: "google" },
  { date: "2026-08-10", origem: "sem origem" },
  { date: "2026-09-01", origem: "instagram" },
];

describe("achar o cabeçalho certo", () => {
  it("acha o carimbo do Google Forms", () => {
    expect(acharCabecalho(["Carimbo de data/hora", "Nome"], ["carimbo de data/hora"])).toBe(
      "Carimbo de data/hora",
    );
  });

  it("ignora acento e caixa", () => {
    expect(acharCabecalho(["ORIGEM"], ["origem"])).toBe("ORIGEM");
    expect(acharCabecalho(["Início"], ["inicio"])).toBe("Início");
  });

  it("correspondência exata vence a parcial", () => {
    // Sem essa ordem, "Data de nascimento" venceria "Data" por acaso de posição
    // na planilha — e o relatório sairia com a idade no eixo do tempo.
    expect(acharCabecalho(["Data de nascimento", "Data"], ["data"])).toBe("Data");
  });

  it("cabeçalho que não existe devolve null", () => {
    expect(acharCabecalho(["Nome", "E-mail"], ["utm_source"])).toBeNull();
  });
});

describe("data da planilha", () => {
  it("lê o formato brasileiro sem passar por new Date", () => {
    // `new Date("01/02/2026")` é 1º de FEVEREIRO aqui e 2 de JANEIRO nos EUA —
    // e o erro só aparece no fechamento do mês.
    expect(dataParaIso("01/02/2026")).toBe("2026-02-01");
    expect(dataParaIso("1/2/2026")).toBe("2026-02-01");
  });

  it("lê ISO, com ou sem hora", () => {
    expect(dataParaIso("2026-08-26")).toBe("2026-08-26");
    expect(dataParaIso("2026-08-26 14:30:00")).toBe("2026-08-26");
  });

  it("texto que não é data devolve null em vez de virar hoje", () => {
    expect(dataParaIso("sem resposta")).toBeNull();
    expect(dataParaIso("")).toBeNull();
    expect(dataParaIso("32/13/2026")).toBeNull();
  });
});

describe("normalização", () => {
  const colunas = ["Carimbo de data/hora", "Nome", "utm_source"];

  it("extrai data e origem", () => {
    const r = normalizar(
      [{ "Carimbo de data/hora": "01/08/2026", Nome: "Ana", utm_source: "instagram" }],
      colunas,
    );
    expect(r.linhas).toEqual([{ date: "2026-08-01", origem: "instagram" }]);
  });

  it("sem coluna de data, RECUSA em vez de devolver zero aplicações", () => {
    // Zero aplicações e "não sei ler esta planilha" aparecem igual na tela — e
    // só um dos dois é verdade.
    const r = normalizar([{ Nome: "Ana" }], ["Nome"]);
    expect(r.linhas).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/coluna de data/i);
  });

  it("sem coluna de origem, agrupa como 'sem origem' e avisa", () => {
    const r = normalizar([{ "Carimbo de data/hora": "01/08/2026" }], ["Carimbo de data/hora"]);
    expect(r.linhas[0]!.origem).toBe("sem origem");
    expect(r.avisos.join(" ")).toMatch(/origem/i);
  });

  it("linha sem data legível é descartada E contada", () => {
    const r = normalizar(
      [
        { "Carimbo de data/hora": "01/08/2026", utm_source: "x" },
        { "Carimbo de data/hora": "", utm_source: "y" },
      ],
      colunas,
    );
    expect(r.linhas).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/1 resposta/i);
  });
});

describe("validação do spec", () => {
  it("métrica que a planilha não calcula é recusada", () => {
    expect(() => validarSpecDeAplicacoes(spec({ metrics: ["aplicacoes.receita"] }))).toThrow(
      ErroDeQuery,
    );
  });

  it("dimensão fora da planilha é recusada", () => {
    expect(() => validarSpecDeAplicacoes(spec({ dimensions: ["trafego.campaign"] }))).toThrow(
      /não tem/i,
    );
  });

  it("o spec do preset padrão passa", () => {
    expect(() => validarSpecDeAplicacoes(spec({ dimensions: ["aplicacoes.origem"] }))).not.toThrow();
  });
});

describe("execução em memória", () => {
  it("conta o total dentro do período", () => {
    const r = executarSobreLinhas(spec(), LINHAS);
    // Setembro fica de fora: o filtro de período é aplicado, não decorativo.
    expect(r.rows[0]!["aplicacoes.count"]).toBe(4);
  });

  it("agrupa por origem, do maior para o menor", () => {
    const r = executarSobreLinhas(spec({ dimensions: ["aplicacoes.origem"] }), LINHAS);
    expect(r.rows.map((l) => [l["aplicacoes.origem"], l["aplicacoes.count"]])).toEqual([
      ["instagram", 2],
      ["google", 1],
      ["sem origem", 1],
    ]);
  });

  it("agrupa por dia", () => {
    const r = executarSobreLinhas(spec({ dimensions: ["aplicacoes.date"] }), LINHAS);
    expect(r.rows).toHaveLength(3);
  });

  it("a semana começa na segunda, como no Postgres", () => {
    // As duas entidades precisam concordar sobre o que é "a semana de 3 de
    // agosto" — senão o gráfico de tráfego e o de aplicações não se sobrepõem.
    const r = executarSobreLinhas(
      spec({ dimensions: ["aplicacoes.date"], date_granularity: "week" }),
      [
        { date: "2026-08-06", origem: "x" }, // quinta
        { date: "2026-08-04", origem: "x" }, // terça
      ],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!["aplicacoes.date"]).toBe("2026-08-03");
  });

  it("agrupa por mês no primeiro dia", () => {
    const r = executarSobreLinhas(
      spec({
        dimensions: ["aplicacoes.date"],
        date_granularity: "month",
        filters: { "aplicacoes.date": { operator: "$gte", value: "2026-01-01" } },
      }),
      LINHAS,
    );
    expect(r.rows.map((l) => l["aplicacoes.date"]).sort()).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("filtro por origem funciona junto com o de data", () => {
    const r = executarSobreLinhas(
      spec({
        filters: {
          "aplicacoes.date": { operator: "$between", value: ["2026-08-01", "2026-08-31"] },
          "aplicacoes.origem": { operator: "$eq", value: "instagram" },
        },
      }),
      LINHAS,
    );
    expect(r.rows[0]!["aplicacoes.count"]).toBe(2);
  });

  it("filtro sobre campo que a planilha não tem é ERRO, não recorte ignorado", () => {
    expect(() =>
      executarSobreLinhas(
        spec({
          filters: {
            "aplicacoes.date": { operator: "$between", value: ["2026-08-01", "2026-08-31"] },
            "trafego.campaign": { operator: "$eq", value: "x" },
          },
        }),
        LINHAS,
      ),
    ).toThrow(ErroDeQuery);
  });

  it("o teto da planilha é menor que o do banco, e o corte avisa", () => {
    const muitas = Array.from({ length: TETO_DE_APLICACOES + 10 }, (_, i) => ({
      date: "2026-08-01",
      origem: `origem-${i}`,
    }));
    const r = executarSobreLinhas(
      spec({ dimensions: ["aplicacoes.origem"], limit: 10_000 }),
      muitas,
    );
    expect(r.rows).toHaveLength(TETO_DE_APLICACOES);
    expect(r.avisos.join(" ")).toMatch(/cortado/i);
  });

  it("sem amostra devolve zero linhas, não uma linha de zeros", () => {
    const r = executarSobreLinhas(spec({ dimensions: ["aplicacoes.origem"] }), []);
    expect(r.rows).toEqual([]);
  });

  it("as colunas saem rotuladas em português", () => {
    const r = executarSobreLinhas(spec({ dimensions: ["aplicacoes.origem"] }), LINHAS);
    expect(r.columns.map((c) => c.label)).toEqual(["Origem", "Aplicações"]);
  });
});
