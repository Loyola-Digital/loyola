/**
 * As regras de edição de um widget.
 *
 * O teste que mais importa é o da cascata: trocar a métrica sem arrastar junto a
 * ordenação, as séries e as colunas derivadas deixa referência morta — e
 * referência morta não dá erro, dá gráfico vazio.
 */

import { describe, expect, it } from "vitest";
import {
  ROTULO_DO_OPERADOR,
  adicionarMetricaDeOutraEntidade,
  aridade,
  atualizarDimensoes,
  atualizarMetricas,
  chaveDeBusca,
  descrever,
  dimensoesAgrupadas,
  metricasAgrupadas,
  operadoresPara,
  podeEditarDimensoes,
  podeEditarMetricas,
  referenciasNaExpressao,
  removerConsultaExtra,
  tipoSugerido,
} from "./edicao";
import type { CampoDoCatalogo, QuerySpec, Widget } from "./tipos";

const CAMPOS: CampoDoCatalogo[] = [
  campo("trafego.spend", "Investimento", "metric", "currency"),
  campo("trafego.cpm", "CPM", "metric", "currency"),
  campo("trafego.ctr", "CTR", "metric", "percent"),
  campo("trafego.impressions", "Impressões", "metric", "number"),
  campo("trafego.date", "Data", "dimension", "date"),
  campo("trafego.campaign", "Campanha", "dimension", "text"),
];

function campo(
  key: string,
  label: string,
  role: "metric" | "dimension",
  semanticType: CampoDoCatalogo["semanticType"],
): CampoDoCatalogo {
  return {
    key,
    label,
    entity: "trafego",
    role,
    semanticType,
    aggregation: "sum",
    dataType: "number",
    description: `Descrição de ${label}`,
  };
}

const rotulo = (k: string) => CAMPOS.find((c) => c.key === k)?.label ?? k;

function spec(over: Partial<QuerySpec> = {}): QuerySpec {
  return {
    entity: "trafego",
    metrics: ["trafego.spend"],
    dimensions: [],
    filters: { "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] } },
    order_by: [],
    limit: 500,
    date_granularity: "day",
    ...over,
  };
}

function widget(over: Partial<Widget> = {}): Widget {
  return {
    id: "w1",
    tipo: "kpi",
    titulo: "Investimento",
    spec: spec(),
    specsExtras: [],
    derivadas: [],
    geometria: { x: 0, y: 0, w: 3, h: 2 },
    opcoes: {},
    ...over,
  };
}

describe("T3 · operadores por tipo do campo", () => {
  it("texto ganha os de texto e não os de ordem", () => {
    const ops = operadoresPara("text");
    expect(ops).toContain("$like");
    expect(ops).not.toContain("$gt");
  });

  it("número ganha comparação e não ganha padrão de texto", () => {
    const ops = operadoresPara("currency");
    expect(ops).toContain("$gte");
    expect(ops).not.toContain("$like");
  });

  it("data ganha intervalo e limites, sem lista", () => {
    const ops = operadoresPara("date");
    expect(ops).toContain("$between");
    expect(ops).not.toContain("$in");
  });

  it("todo operador tem rótulo em português", () => {
    for (const t of ["text", "date", "number"]) {
      for (const op of operadoresPara(t)) expect(ROTULO_DO_OPERADOR[op]).toBeTruthy();
    }
  });

  it("a aridade diz quantos campos a tela desenha", () => {
    expect(aridade("$isnull")).toBe(0);
    expect(aridade("$between")).toBe(2);
    expect(aridade("$in")).toBe("lista");
    expect(aridade("$eq")).toBe(1);
  });
});

describe("pickers agrupados", () => {
  it("métricas saem por tipo, não numa lista plana", () => {
    const grupos = metricasAgrupadas(CAMPOS.filter((c) => c.role === "metric"));
    expect(grupos.map((g) => g.titulo)).toEqual(
      expect.arrayContaining(["Dinheiro", "Taxas", "Contagens"]),
    );
  });

  it("dimensões separam tempo de atributo", () => {
    const grupos = dimensoesAgrupadas(CAMPOS.filter((c) => c.role === "dimension"));
    expect(grupos.map((g) => g.titulo)).toEqual(expect.arrayContaining(["Tempo", "Atributos"]));
  });

  it("a busca ignora acento", () => {
    // Quem digita "impressoes" precisa achar "Impressões".
    const grupos = metricasAgrupadas(CAMPOS, "impressoes");
    expect(grupos.flatMap((g) => g.campos).map((c) => c.key)).toEqual(["trafego.impressions"]);
  });

  it("a busca também olha a descrição", () => {
    expect(chaveDeBusca("Investimento")).toBe("investimento");
    const grupos = metricasAgrupadas(CAMPOS, "descrição de cpm");
    expect(grupos.flatMap((g) => g.campos)).toHaveLength(1);
  });
});

describe("T2 · editabilidade", () => {
  it("widget com coluna derivada tem métricas travadas, COM motivo", () => {
    const r = podeEditarMetricas(
      widget({
        derivadas: [
          { name: "lucro", label: "Lucro", expression: "q0.a - q1.b", mode: "scalar", semanticType: "currency" },
        ],
      }),
    );
    expect(r.pode).toBe(false);
    // O motivo precisa existir: campo cinza sem explicação vira suporte.
    expect(r.motivo).toMatch(/colunas calculadas/i);
  });

  it("widget com mais de uma consulta também trava", () => {
    expect(podeEditarMetricas(widget({ specsExtras: [spec()] })).pode).toBe(false);
  });

  it("widget simples é livre", () => {
    expect(podeEditarMetricas(widget()).pode).toBe(true);
    expect(podeEditarDimensoes(widget()).pode).toBe(true);
  });

  it("dimensões travam quando a derivada por linha depende da chave de merge", () => {
    const r = podeEditarDimensoes(
      widget({
        mergeKey: "trafego.date",
        derivadas: [
          { name: "l", label: "L", expression: "q0.a - q1.b", mode: "row", semanticType: "number" },
        ],
      }),
    );
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("trafego.date");
  });
});

describe("T1 · a cascata ao trocar métrica", () => {
  const original = widget({
    spec: spec({
      metrics: ["trafego.spend", "trafego.cpm"],
      dimensions: ["trafego.campaign"],
      order_by: [{ field: "trafego.cpm", direction: "desc" }],
    }),
    opcoes: { series: ["trafego.spend", "trafego.cpm"] },
    derivadas: [
      {
        name: "dobro",
        label: "Dobro do CPM",
        expression: "q0.trafego.cpm * 2",
        mode: "scalar",
        semanticType: "currency",
      },
    ],
  });

  it("a ordenação, as séries e a derivada são atualizadas JUNTAS", () => {
    const { widget: novo, avisos } = atualizarMetricas(original, ["trafego.spend"]);

    expect(novo.spec.metrics).toEqual(["trafego.spend"]);
    expect(novo.spec.order_by).toEqual([]);
    expect(novo.opcoes.series).toEqual(["trafego.spend"]);
    expect(novo.derivadas).toEqual([]);
    // Três coisas mudaram: a pessoa precisa ver as três antes de salvar.
    expect(avisos).toHaveLength(3);
  });

  it("acrescentar métrica não mexe em nada do que existia", () => {
    const { widget: novo, avisos } = atualizarMetricas(original, [
      "trafego.spend",
      "trafego.cpm",
      "trafego.ctr",
    ]);
    expect(novo.spec.order_by).toHaveLength(1);
    expect(novo.derivadas).toHaveLength(1);
    expect(avisos).toEqual([]);
  });

  it("o widget original não é mutado", () => {
    atualizarMetricas(original, []);
    expect(original.spec.metrics).toHaveLength(2);
    expect(original.derivadas).toHaveLength(1);
  });
});

describe("cascata ao trocar dimensão", () => {
  it("a chave de merge cai junto com a dimensão que a sustentava", () => {
    const antes = widget({
      spec: spec({
        dimensions: ["trafego.date"],
        order_by: [{ field: "trafego.date", direction: "asc" }],
      }),
      mergeKey: "trafego.date",
    });
    const { widget: novo, avisos } = atualizarDimensoes(antes, ["trafego.campaign"]);
    expect(novo.mergeKey).toBeUndefined();
    expect(novo.spec.order_by).toEqual([]);
    expect(avisos.join(" ")).toMatch(/casava as consultas/i);
  });
});

describe("referências na expressão", () => {
  it("encontra todas as colunas mencionadas", () => {
    expect(referenciasNaExpressao("q0.revenue - q1.spend * 2")).toEqual([
      { query: 0, coluna: "revenue" },
      { query: 1, coluna: "spend" },
    ]);
  });

  it("expressão sem referência devolve lista vazia", () => {
    expect(referenciasNaExpressao("1 + 2")).toEqual([]);
  });
});

describe("T4 · a frase descritiva", () => {
  it("diz métrica, dimensão e período", () => {
    const frase = descrever(
      spec({ metrics: ["trafego.spend"], dimensions: ["trafego.date"] }),
      rotulo,
      { start: "2026-08-01", end: "2026-08-26" },
    );
    expect(frase).toContain("Investimento por Data");
    expect(frase).toContain("de 2026-08-01 a 2026-08-26");
  });

  it("inclui os filtros, que é o que a pessoa esquece de conferir", () => {
    const frase = descrever(
      spec({ filters: { "trafego.campaign": { operator: "$ncontains", value: "teste" } } }),
      rotulo,
    );
    expect(frase).toContain("Campanha não contém teste");
  });

  it("a granularidade aparece quando não é diária", () => {
    const frase = descrever(
      spec({ dimensions: ["trafego.date"], date_granularity: "week" }),
      rotulo,
    );
    expect(frase).toContain("por semana");
  });

  it("lista longa de valores é resumida", () => {
    const frase = descrever(
      spec({
        filters: {
          "trafego.campaign": { operator: "$in", value: ["a", "b", "c", "d", "e"] },
        },
      }),
      rotulo,
    );
    expect(frase).toContain("e mais 2");
  });

  it("a ordenação entra no fim", () => {
    const frase = descrever(
      spec({ dimensions: ["trafego.campaign"], order_by: [{ field: "trafego.spend", direction: "desc" }] }),
      rotulo,
    );
    expect(frase).toContain("ordenado por Investimento");
  });

  it("duas métricas saem com 'e', não com vírgula solta", () => {
    const frase = descrever(spec({ metrics: ["trafego.spend", "trafego.cpm"] }), rotulo);
    expect(frase.startsWith("Investimento e CPM")).toBe(true);
  });
});

describe("tipo sugerido", () => {
  it("sem dimensão é KPI", () => {
    expect(tipoSugerido(spec())).toBe("kpi");
  });

  it("por data é linha", () => {
    expect(tipoSugerido(spec({ dimensions: ["trafego.date"] }))).toBe("linha");
  });

  it("por atributo é barra", () => {
    expect(tipoSugerido(spec({ dimensions: ["trafego.campaign"] }))).toBe("barra");
  });

  it("muita coluna vira tabela", () => {
    expect(
      tipoSugerido(
        spec({
          dimensions: ["trafego.campaign"],
          metrics: ["trafego.spend", "trafego.cpm", "trafego.ctr", "trafego.impressions"],
        }),
      ),
    ).toBe("tabela");
  });
});

describe("AC5 · auto-split entre entidades", () => {
  const receita: CampoDoCatalogo = {
    key: "vendas.revenue",
    label: "Receita",
    entity: "vendas",
    role: "metric",
    semanticType: "currency",
    aggregation: "sum",
    dataType: "number",
    description: "Soma do valor das vendas",
  };

  it("métrica de outra entidade vira uma segunda consulta sozinha", () => {
    const base = widget({ spec: spec({ dimensions: ["trafego.date"] }) });
    const { widget: novo, avisos } = adicionarMetricaDeOutraEntidade(base, receita);

    expect(novo.specsExtras).toHaveLength(1);
    expect(novo.specsExtras[0]!.entity).toBe("vendas");
    expect(novo.specsExtras[0]!.metrics).toEqual(["vendas.revenue"]);
    expect(avisos.join(" ")).toMatch(/segunda consulta/i);
  });

  it("as dimensões são espelhadas na entidade nova", () => {
    // Sem espelhar, a segunda consulta devolveria um total só — e não teria
    // como casar linha a linha com a primeira.
    const base = widget({ spec: spec({ dimensions: ["trafego.date"] }) });
    const { widget: novo } = adicionarMetricaDeOutraEntidade(base, receita);
    expect(novo.specsExtras[0]!.dimensions).toEqual(["vendas.date"]);
  });

  it("a chave de merge é escolhida e ANUNCIADA", () => {
    const base = widget({ spec: spec({ dimensions: ["trafego.date"] }) });
    const { widget: novo, avisos } = adicionarMetricaDeOutraEntidade(base, receita);
    expect(novo.mergeKey).toBe("trafego.date");
    expect(avisos.join(" ")).toContain("trafego.date");
  });

  it("segunda métrica da mesma entidade entra na consulta que já existe", () => {
    const base = widget({ spec: spec({ dimensions: ["trafego.date"] }) });
    const passo1 = adicionarMetricaDeOutraEntidade(base, receita).widget;
    const passo2 = adicionarMetricaDeOutraEntidade(passo1, {
      ...receita,
      key: "vendas.count",
      label: "Vendas",
    });
    expect(passo2.widget.specsExtras).toHaveLength(1);
    expect(passo2.widget.specsExtras[0]!.metrics).toHaveLength(2);
  });

  it("o teto de quatro consultas é respeitado", () => {
    const base = widget({ specsExtras: [spec(), spec(), spec()] });
    const { widget: novo, avisos } = adicionarMetricaDeOutraEntidade(base, receita);
    expect(novo.specsExtras).toHaveLength(3);
    expect(avisos.join(" ")).toMatch(/no maximo quatro|no máximo quatro/i);
  });

  it("remover a consulta leva junto as derivadas que dependiam dela", () => {
    const base = widget({
      specsExtras: [spec()],
      mergeKey: "trafego.date",
      derivadas: [
        {
          name: "lucro",
          label: "Lucro",
          expression: "q1.vendas.revenue - q0.trafego.spend",
          mode: "row",
          semanticType: "currency",
        },
      ],
    });
    const { widget: novo, avisos } = removerConsultaExtra(base, 0);
    expect(novo.specsExtras).toEqual([]);
    expect(novo.derivadas).toEqual([]);
    expect(novo.mergeKey).toBeUndefined();
    expect(avisos.join(" ")).toMatch(/Lucro/);
  });
});
