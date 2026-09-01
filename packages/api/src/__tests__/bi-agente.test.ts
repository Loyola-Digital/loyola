/**
 * O agente que monta widget a partir de uma pergunta.
 *
 * O que estes testes protegem não é a qualidade da resposta do modelo — é o
 * fato de que **uma resposta ruim não vira consulta**. O modelo escolhe chaves;
 * o validador de sempre decide o que entra.
 */

import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  MAX_WIDGETS_POR_PERGUNTA,
  catalogoEmTexto,
  montarWidgets,
  propostaParaWidget,
  type WidgetProposto,
} from "../services/bi/agente.js";
import { CAMPOS } from "../services/bi/catalogo.js";

const proposta = (over: Partial<WidgetProposto> = {}): WidgetProposto => ({
  titulo: "Investimento",
  tipo: "kpi",
  entity: "trafego",
  metrics: ["trafego.spend"],
  ...over,
});

/** Um cliente de mentira que devolve as respostas na ordem dada. */
function clienteFalso(respostas: { explicacao: string; widgets: WidgetProposto[] }[]) {
  const chamadas: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create = vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    chamadas.push(params);
    const r = respostas.shift() ?? { explicacao: "", widgets: [] };
    return {
      content: [{ type: "tool_use", name: "montar_widgets", id: "t1", input: r }],
    } as unknown as Anthropic.Message;
  });
  return { cliente: { messages: { create } }, chamadas, create };
}

describe("o catálogo vai inteiro no prompt", () => {
  const texto = catalogoEmTexto();

  it("toda chave do catálogo aparece", () => {
    // É isto que troca "alucina um nome de coluna" por "escolhe da lista".
    for (const c of CAMPOS) expect(texto).toContain(c.key);
  });

  it("as descrições vão junto", () => {
    // São elas que distinguem CPL geral de CPL atribuído.
    expect(texto).toContain("Investimento");
    expect(texto).toMatch(/Fórmula:/);
  });

  it("as entidades estão separadas por seção", () => {
    expect(texto).toContain("## Entidade `trafego`");
    expect(texto).toContain("## Entidade `vendas`");
  });
});

describe("a proposta passa pelo validador de sempre", () => {
  it("um pedido simples vira widget", () => {
    const r = propostaParaWidget(proposta(), []);
    expect("widget" in r).toBe(true);
    if ("widget" in r) {
      expect(r.widget.spec.metrics).toEqual(["trafego.spend"]);
      expect(r.widget.tipo).toBe("kpi");
    }
  });

  it("métrica inventada é RECUSADA, não aproximada", () => {
    const r = propostaParaWidget(proposta({ metrics: ["trafego.faturamento_magico"] }), []);
    expect("erro" in r).toBe(true);
  });

  it("dimensão de outra entidade é recusada", () => {
    const r = propostaParaWidget(proposta({ dimensions: ["vendas.produto"] }), []);
    expect("erro" in r).toBe(true);
    if ("erro" in r) expect(r.erro).toMatch(/vendas|Vendas/);
  });

  it("filtro sobre campo inexistente é recusado antes de virar spec", () => {
    const r = propostaParaWidget(
      proposta({ filtros: [{ campo: "pg_user.usename", operador: "$eq", valores: ["postgres"] }] }),
      [],
    );
    expect("erro" in r).toBe(true);
    if ("erro" in r) expect(r.erro).toMatch(/inexistente/);
  });

  it("operador inventado é recusado", () => {
    const r = propostaParaWidget(
      proposta({
        filtros: [{ campo: "trafego.campaign", operador: "$drop_table", valores: ["x"] }],
      }),
      [],
    );
    expect("erro" in r).toBe(true);
  });

  it("métrica sem tradução no executor é recusada, mesmo existindo no catálogo", () => {
    // `cpl_atribuido` está no catálogo e não tem execução: o agente não pode
    // entregar um card que erra toda vez que carrega.
    const r = propostaParaWidget(proposta({ metrics: ["trafego.cpl_atribuido"] }), []);
    expect("erro" in r).toBe(true);
  });

  it("o filtro de data que o modelo mandar é substituído pelo do dashboard", () => {
    const r = propostaParaWidget(
      proposta({
        filtros: [{ campo: "trafego.date", operador: "$eq", valores: ["2020-01-01"] }],
      }),
      [],
    );
    expect("widget" in r).toBe(true);
    if ("widget" in r) {
      // O valor de fachada é substituído na execução pelo contexto; o que
      // importa é que a chave existe e o validador passou.
      expect(r.widget.spec.filters["trafego.date"]!.operator).toBe("$between");
    }
  });

  it("o widget novo não nasce por cima de quem já está lá", () => {
    const ocupado = [{ x: 0, y: 0, w: 12, h: 4 }];
    const r = propostaParaWidget(proposta(), ocupado);
    if ("widget" in r) expect(r.widget.geometria.y).toBeGreaterThanOrEqual(4);
  });

  it("entidade de planilha usa o validador dela", () => {
    const bom = propostaParaWidget(
      proposta({ entity: "aplicacoes", metrics: ["aplicacoes.count"] }),
      [],
    );
    expect("widget" in bom).toBe(true);

    const ruim = propostaParaWidget(
      proposta({ entity: "aplicacoes", metrics: ["aplicacoes.receita"] }),
      [],
    );
    expect("erro" in ruim).toBe(true);
  });
});

describe("a conversa", () => {
  it("monta os widgets quando a resposta é válida", async () => {
    const { cliente } = clienteFalso([
      { explicacao: "Montei o investimento do período.", widgets: [proposta()] },
    ]);
    const r = await montarWidgets("quanto gastei?", { cliente, ocupados: [] });
    expect(r.widgets).toHaveLength(1);
    expect(r.explicacao).toContain("investimento");
    expect(r.avisos).toEqual([]);
  });

  it("erro do validador volta para o modelo, que acerta na segunda", async () => {
    const { cliente, chamadas, create } = clienteFalso([
      { explicacao: "tentativa 1", widgets: [proposta({ metrics: ["trafego.inventada"] })] },
      { explicacao: "tentativa 2", widgets: [proposta()] },
    ]);
    const r = await montarWidgets("quanto gastei?", { cliente, ocupados: [] });

    expect(create).toHaveBeenCalledTimes(2);
    expect(r.widgets).toHaveLength(1);
    expect(r.avisos).toEqual([]);
    // A mensagem de erro precisa ir INTEIRA: é ela que diz qual campo errou.
    const segunda = chamadas[1]!.messages.at(-1)!;
    expect(JSON.stringify(segunda.content)).toContain("trafego.inventada");
  });

  it("a correção responde o tool_use com um tool_result — senão a API recusa", async () => {
    // Este teste nasceu de um 400 em produção, com a IA morrendo justo quando
    // ia se corrigir:
    //
    //   "`tool_use` ids were found without `tool_result` blocks immediately
    //    after: toolu_01XSH3TmGzr7bpPo3LGAT6vo"
    //
    // Com `tool_choice` forçado, TODA resposta traz um `tool_use`, e a API
    // exige que a próxima mensagem do usuário comece pelo `tool_result` do
    // mesmo id. Mandar texto puro parecia inofensivo e quebrava a conversa.
    const { cliente, chamadas } = clienteFalso([
      { explicacao: "erra", widgets: [proposta({ metrics: ["trafego.inventada"] })] },
      { explicacao: "acerta", widgets: [proposta()] },
    ]);
    await montarWidgets("roas do público hot", { cliente, ocupados: [] });

    const conversa = chamadas[1]!.messages;
    // Todo `tool_use` do assistente é respondido logo em seguida.
    for (const [i, m] of conversa.entries()) {
      const blocos = Array.isArray(m.content) ? m.content : [];
      const usos = blocos.filter((b) => (b as { type?: string }).type === "tool_use");
      if (m.role !== "assistant" || usos.length === 0) continue;

      const seguinte = conversa[i + 1];
      expect(seguinte, "todo tool_use precisa de uma resposta").toBeDefined();
      expect(seguinte!.role).toBe("user");

      const resposta = Array.isArray(seguinte!.content) ? seguinte!.content : [];
      for (const uso of usos) {
        const casou = resposta.find(
          (b) =>
            (b as { type?: string }).type === "tool_result" &&
            (b as { tool_use_id?: string }).tool_use_id === (uso as { id: string }).id,
        );
        expect(casou, `sem tool_result para ${(uso as { id: string }).id}`).toBeDefined();
        // `is_error` é o que diz ao modelo que a chamada FALHOU — sem isso ele
        // pode achar que o widget passou e o usuário só quis outro.
        expect((casou as { is_error?: boolean }).is_error).toBe(true);
      }
    }

    // E o motivo continua indo inteiro: é ele que nomeia o campo errado.
    expect(JSON.stringify(conversa.at(-1)!.content)).toContain("trafego.inventada");
  });

  it("insistir no mesmo erro não vira laço: entrega o que passou e avisa", async () => {
    const { cliente, create } = clienteFalso([
      { explicacao: "a", widgets: [proposta({ metrics: ["trafego.x"] }), proposta()] },
      { explicacao: "b", widgets: [proposta({ metrics: ["trafego.x"] }), proposta()] },
    ]);
    const r = await montarWidgets("pergunta", { cliente, ocupados: [] });

    expect(create).toHaveBeenCalledTimes(2);
    expect(r.widgets).toHaveLength(1);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain("Investimento");
  });

  it("resposta sem ferramenta não quebra a rota", async () => {
    const create = vi.fn(async () => ({ content: [{ type: "text", text: "sei lá" }] }) as never);
    const r = await montarWidgets("?", { cliente: { messages: { create } }, ocupados: [] });
    expect(r.widgets).toEqual([]);
    expect(r.explicacao).toBeTruthy();
  });

  it("o teto de widgets por pergunta é respeitado", async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => proposta({ titulo: `w${i}` }));
    const { cliente } = clienteFalso([{ explicacao: "muitos", widgets: muitos }]);
    const r = await montarWidgets("tudo", { cliente, ocupados: [] });
    expect(r.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS_POR_PERGUNTA);
  });

  it("a ferramenta é obrigatória — o modelo não responde texto solto", async () => {
    const { cliente, chamadas } = clienteFalso([{ explicacao: "ok", widgets: [proposta()] }]);
    await montarWidgets("quanto gastei?", { cliente, ocupados: [] });
    expect(chamadas[0]!.tool_choice).toEqual({ type: "tool", name: "montar_widgets" });
  });

  it("as instruções proíbem inventar chave e mandam não pôr data", async () => {
    const { cliente, chamadas } = clienteFalso([{ explicacao: "", widgets: [] }]);
    await montarWidgets("x", { cliente, ocupados: [] });
    const sistema = String(chamadas[0]!.system);
    expect(sistema).toMatch(/Não invente chave/i);
    expect(sistema).toMatch(/NÃO inclua filtro de data/i);
  });
});

describe("quando a IA falha, a mensagem diz o que fazer", () => {
  function clienteQueFalha(erro: { status?: number; message?: string }, vezes = 99) {
    let n = 0;
    const create = vi.fn(async () => {
      n += 1;
      if (n <= vezes) throw Object.assign(new Error(erro.message ?? "falhou"), erro);
      return {
        content: [
          {
            type: "tool_use",
            name: "montar_widgets",
            id: "t",
            input: { explicacao: "ok", widgets: [proposta()] },
          },
        ],
      } as unknown as Anthropic.Message;
    });
    return { cliente: { messages: { create } }, create };
  }

  it("chave recusada NÃO é 'tente de novo' — é problema de configuração", async () => {
    const { cliente, create } = clienteQueFalha({ status: 401 });
    await expect(montarWidgets("x", { cliente, ocupados: [] })).rejects.toThrow(/chave/i);
    // E não repete: repetir com chave errada só atrasa a mensagem que resolve.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("modelo inexistente diz isso", async () => {
    const { cliente } = clienteQueFalha({ status: 404 });
    await expect(montarWidgets("x", { cliente, ocupados: [] })).rejects.toThrow(/modelo/i);
  });

  it("sobrecarga é repetida e passa sozinha", async () => {
    // 500 e 429 passam com o tempo — merecem a segunda chance.
    const { cliente, create } = clienteQueFalha({ status: 529, message: "overloaded" }, 1);
    const r = await montarWidgets("x", { cliente, ocupados: [] });
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.widgets).toHaveLength(1);
  });

  it("limite de uso vira mensagem com prazo, não erro genérico", async () => {
    const { cliente } = clienteQueFalha({ status: 429 });
    await expect(montarWidgets("x", { cliente, ocupados: [] })).rejects.toThrow(/limite de uso/i);
  });

  it("erro sem status preserva a mensagem original", async () => {
    const { cliente } = clienteQueFalha({ message: "socket hang up" });
    await expect(montarWidgets("x", { cliente, ocupados: [] })).rejects.toThrow(/socket hang up/);
  });
});

describe("saldo esgotado — o erro mais provável, e o menos óbvio", () => {
  it("vira uma frase que diz quem resolve, não 'tente de novo'", async () => {
    // A Anthropic manda saldo baixo como 400 com "Plans & Billing" — conselho
    // inútil para quem está olhando um dashboard.
    const create = vi.fn(async () => {
      throw Object.assign(
        new Error(
          '400 {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing"}}',
        ),
        { status: 400 },
      );
    });
    await expect(
      montarWidgets("x", { cliente: { messages: { create } }, ocupados: [] }),
    ).rejects.toThrow(/sem saldo/i);
    // E não repete: sem saldo, repetir não muda nada.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("a mensagem avisa que o problema é maior que o BI", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("credit balance is too low"), { status: 400 });
    });
    await expect(
      montarWidgets("x", { cliente: { messages: { create } }, ocupados: [] }),
    ).rejects.toThrow(/chat e os Minds/i);
  });
});

describe("os passos que a tela mostra", () => {
  it("cada etapa do trabalho vira um passo, na ordem", async () => {
    // "Montando…" por vinte segundos é indistinguível de travado.
    const { cliente } = clienteFalso([{ explicacao: "ok", widgets: [proposta()] }]);
    const passos: string[] = [];
    await montarWidgets("quanto gastei?", {
      cliente,
      ocupados: [],
      aoProgredir: (p) => passos.push(p.tipo),
    });
    expect(passos).toEqual(["lendo", "pensando", "montou"]);
  });

  it("o passo de montagem diz o título e o tipo de gráfico", async () => {
    const { cliente } = clienteFalso([
      { explicacao: "ok", widgets: [proposta({ titulo: "Gasto por campanha", tipo: "barra" })] },
    ]);
    const montou: { titulo?: string; grafico?: string }[] = [];
    await montarWidgets("x", {
      cliente,
      ocupados: [],
      aoProgredir: (p) => {
        if (p.tipo === "montou") montou.push(p);
      },
    });
    expect(montou[0]).toMatchObject({ titulo: "Gasto por campanha", grafico: "barra" });
  });

  it("a autocorreção aparece como passo, não como silêncio", async () => {
    // Quando a IA erra uma chave e se corrige, quem está olhando precisa ver.
    const { cliente } = clienteFalso([
      { explicacao: "a", widgets: [proposta({ metrics: ["trafego.inventada"] })] },
      { explicacao: "b", widgets: [proposta()] },
    ]);
    const passos: string[] = [];
    await montarWidgets("x", { cliente, ocupados: [], aoProgredir: (p) => passos.push(p.tipo) });
    expect(passos).toContain("corrigindo");
    // E a segunda passada é anunciada como tal.
    expect(passos.filter((p) => p === "pensando")).toHaveLength(2);
  });

  it("sem callback, nada quebra", async () => {
    const { cliente } = clienteFalso([{ explicacao: "ok", widgets: [proposta()] }]);
    await expect(montarWidgets("x", { cliente, ocupados: [] })).resolves.toBeTruthy();
  });
});
