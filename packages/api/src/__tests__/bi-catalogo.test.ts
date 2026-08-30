import { describe, expect, it } from "vitest";
import {
  CAMPOS,
  ENTIDADES,
  campo,
  catalogoParaApi,
  dimensoesDa,
  metricasDa,
} from "../services/bi/catalogo.js";

describe("catálogo — integridade", () => {
  it("T1 · nenhuma chave duplicada", () => {
    const vistas = new Set<string>();
    const dup: string[] = [];
    for (const c of CAMPOS) {
      if (vistas.has(c.key)) dup.push(c.key);
      vistas.add(c.key);
    }
    expect(dup).toEqual([]);
  });

  it("T2 · toda entidade citada existe na lista de entidades", () => {
    const conhecidas = new Set(ENTIDADES.map((e) => e.key));
    for (const c of CAMPOS) expect(conhecidas.has(c.entity)).toBe(true);
  });

  it("T3 · toda métrica com fórmula de razão declara nullWhenEmpty", () => {
    // Uma taxa que devolve 0 sem denominador contamina média, ordenação e
    // export — é a regra 1 do épico.
    const razoes = CAMPOS.filter((c) => c.formula?.includes("/"));
    expect(razoes.length).toBeGreaterThan(0);
    for (const c of razoes) {
      expect(c.nullWhenEmpty, `${c.key} é razão e não declara nullWhenEmpty`).toBe(true);
    }
  });

  it("T4 · toda métrica atribuída tem a geral correspondente", () => {
    // As duas famílias existem de propósito. Uma sem a outra vira "o número",
    // e a diferença entre elas some.
    const atribuidas = CAMPOS.filter((c) => c.familia === "atribuido");
    expect(atribuidas.length).toBeGreaterThan(0);
    for (const a of atribuidas) {
      const par = a.key.replace(/_atribuido$/, "_geral");
      expect(campo(par), `${a.key} não tem par geral (${par})`).not.toBeNull();
      expect(campo(par)?.familia).toBe("geral");
    }
  });

  it("T4b · métrica de família tem o rótulo dizendo qual é", () => {
    for (const c of CAMPOS.filter((x) => x.familia)) {
      expect(c.label, `${c.key} não diz a família no rótulo`).toMatch(/\((Geral|Atribuído)\)/);
    }
  });

  it("a chave segue `entidade.campo` e bate com a entidade declarada", () => {
    for (const c of CAMPOS) expect(c.key.startsWith(`${c.entity}.`)).toBe(true);
  });

  it("toda métrica não derivada declara agregação de verdade", () => {
    // `none` só é válido para derivada: uma métrica base sem agregação não
    // sabe como somar linhas.
    for (const c of CAMPOS.filter((x) => x.role === "metric" && !x.formula)) {
      expect(c.aggregation, `${c.key} é base e não agrega`).not.toBe("none");
    }
  });

  it("toda métrica derivada NÃO agrega (calcula depois)", () => {
    // Média de razão não é razão de médias: somar CPLs diários e dividir por N
    // dá um número que não existe.
    for (const c of CAMPOS.filter((x) => x.formula)) {
      expect(c.aggregation, `${c.key} é derivada e não pode agregar`).toBe("none");
    }
  });

  it("todo campo tem descrição útil", () => {
    for (const c of CAMPOS) expect(c.description.length).toBeGreaterThan(15);
  });
});

describe("catálogo — consulta", () => {
  it("cada entidade tem ao menos uma dimensão de data", () => {
    // Toda query exige filtro de data (regra 3): entidade sem data seria
    // inconsultável.
    for (const e of ENTIDADES) {
      const temData = dimensoesDa(e.key).some((d) => d.semanticType === "date");
      expect(temData, `${e.key} não tem dimensão de data`).toBe(true);
    }
  });

  it("cada entidade tem ao menos uma métrica", () => {
    for (const e of ENTIDADES) expect(metricasDa(e.key).length).toBeGreaterThan(0);
  });

  it("a resposta da API separa métricas de dimensões sem perder campo", () => {
    const api = catalogoParaApi();
    expect(api.metrics.length + api.dimensions.length).toBe(CAMPOS.length);
    expect(api.entities).toHaveLength(ENTIDADES.length);
  });

  it("`aplicacoes` é declarada como planilha — o executor depende disso", () => {
    expect(ENTIDADES.find((e) => e.key === "aplicacoes")?.fonte).toBe("planilha");
  });

  it("campo inexistente devolve null, não lança", () => {
    expect(campo("trafego.nao_existe")).toBeNull();
    expect(campo("'; DROP TABLE users; --")).toBeNull();
  });
});
