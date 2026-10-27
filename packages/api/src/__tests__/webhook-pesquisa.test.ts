/**
 * A resposta de pesquisa que chega por webhook (`services/webhook-pesquisa.ts`).
 *
 * O que estes testes seguram é a diferença para a fonte de leads: aqui as
 * colunas são as PERGUNTAS de quem envia, não um conjunto fixo. Duas regras
 * carregam o número da faixa e por isso estão cobertas uma a uma: a união das
 * chaves (e não as chaves da primeira resposta) e o achatamento do corpo
 * aninhado.
 */

import { describe, it, expect } from "vitest";
import {
  COLUNA_DATA,
  achatarCorpo,
  idDaPesquisa,
  inferirContentType,
  montarPrevia,
  motivoDeNaoLer,
  pesquisaComoPlanilhaId,
  respostasComoPlanilha,
} from "../services/webhook-pesquisa.js";
import { campoDoApelido, fonteComoPlanilhaId, idDaFonte } from "../services/webhook-leads.js";

const EM = (iso: string) => new Date(iso);

describe("idDaPesquisa", () => {
  it("reconhece a pesquisa por webhook e devolve o id", () => {
    const id = "3f1c0a9e-0000-4000-8000-000000000009";
    expect(idDaPesquisa(pesquisaComoPlanilhaId(id))).toBe(id);
  });

  it("deixa passar a planilha de verdade do Google", () => {
    expect(idDaPesquisa("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")).toBeNull();
  });

  it("não confunde com a fonte de LEADS por webhook, nem ela com esta", () => {
    const id = "3f1c0a9e-0000-4000-8000-000000000009";
    // O prefixo dos leads é `webhook:`; o desta é `webhook-pesquisa:`. Um
    // reconhecer o outro entregaria nove colunas de lead ao motor de scoring.
    expect(idDaPesquisa(fonteComoPlanilhaId(id))).toBeNull();
    expect(idDaFonte(pesquisaComoPlanilhaId(id))).toBeNull();
  });

  it("recusa o prefixo sem id", () => {
    expect(idDaPesquisa("webhook-pesquisa:")).toBeNull();
    expect(idDaPesquisa("webhook-pesquisa:   ")).toBeNull();
  });
});

describe("achatarCorpo", () => {
  it("mantém chave rasa e apara o espaço do valor", () => {
    expect([...achatarCorpo({ email: "  ana@x.com " }).entries()]).toEqual([
      ["email", "ana@x.com"],
    ]);
  });

  it("desce no objeto aninhado com ponto", () => {
    const m = achatarCorpo({ contato: { email: "ana@x.com", telefone: "11999" } });
    expect(m.get("contato.email")).toBe("ana@x.com");
    expect(m.get("contato.telefone")).toBe("11999");
  });

  it("desce no array com índice — o formato de quem manda `fields[]`", () => {
    const m = achatarCorpo({
      fields: [
        { label: "Faturamento", value: "Acima de 100 mil" },
        { label: "Profissão", value: "Dentista" },
      ],
    });
    expect(m.get("fields[0].value")).toBe("Acima de 100 mil");
    expect(m.get("fields[1].label")).toBe("Profissão");
  });

  it("número e booleano viram texto; nulo vira célula vazia", () => {
    const m = achatarCorpo({ idade: 42, aceita: true, obs: null });
    expect(m.get("idade")).toBe("42");
    expect(m.get("aceita")).toBe("true");
    expect(m.get("obs")).toBe("");
  });

  it("para na profundidade máxima em vez de inventar coluna com lixo", () => {
    const m = achatarCorpo({ a: { b: { c: { d: { e: "fundo" } } } } });
    expect([...m.keys()].some((k) => k.includes("fundo"))).toBe(false);
    expect(m.has("a.b.c")).toBe(false);
  });

  it("ignora chave vazia", () => {
    expect(achatarCorpo({ "": "nada", ok: "sim" }).has("")).toBe(false);
  });
});

describe("respostasComoPlanilha", () => {
  it("a data de recebimento é a primeira coluna, no formato da planilha", () => {
    const { headers, rows } = respostasComoPlanilha([
      { payload: { email: "ana@x.com" }, recebidoEm: EM("2026-10-23T14:05:09-03:00") },
    ]);
    expect(headers[0]).toBe(COLUNA_DATA);
    expect(rows[0][0]).toBe("23/10/2026 14:05:09");
  });

  it("os cabeçalhos são a UNIÃO das chaves, não as da primeira resposta", () => {
    // Pergunta acrescentada no meio do lançamento: sem a união, a coluna não
    // existiria e as respostas novas sairiam da conta sem avisar.
    const { headers, rows } = respostasComoPlanilha([
      { payload: { email: "a@x.com", faturamento: "até 10 mil" }, recebidoEm: EM("2026-10-01T10:00:00Z") },
      {
        payload: { email: "b@x.com", faturamento: "100 mil+", profissao: "Dentista" },
        recebidoEm: EM("2026-10-02T10:00:00Z"),
      },
    ]);
    expect(headers).toEqual([COLUNA_DATA, "email", "faturamento", "profissao"]);
    // Quem respondeu antes da pergunta existir fica com a célula vazia.
    expect(rows[0]).toEqual(["01/10/2026 07:00:00", "a@x.com", "até 10 mil", ""]);
    expect(rows[1][3]).toBe("Dentista");
  });

  it("a coluna de recebimento não é disputada por uma chave de mesmo nome", () => {
    const { headers, rows } = respostasComoPlanilha([
      { payload: { recebido_em: "mentira", email: "a@x.com" }, recebidoEm: EM("2026-10-03T12:00:00Z") },
    ]);
    expect(headers).toEqual([COLUNA_DATA, "email"]);
    expect(rows[0][0]).toBe("03/10/2026 09:00:00");
  });

  it("ordem das colunas é a de primeira aparição, e cada linha segue essa ordem", () => {
    const { headers, rows } = respostasComoPlanilha([
      { payload: { b: "1", a: "2" }, recebidoEm: EM("2026-10-01T10:00:00Z") },
      { payload: { a: "3", b: "4" }, recebidoEm: EM("2026-10-02T10:00:00Z") },
    ]);
    expect(headers).toEqual([COLUNA_DATA, "b", "a"]);
    expect(rows[1].slice(1)).toEqual(["4", "3"]);
  });

  it("sem resposta nenhuma devolve só a coluna de data, e não quebra", () => {
    expect(respostasComoPlanilha([])).toEqual({
      headers: [COLUNA_DATA],
      rows: [],
      totalRows: 0,
    });
  });

  it("payload nulo no banco não derruba a leitura das outras respostas", () => {
    const { rows, totalRows } = respostasComoPlanilha([
      { payload: null as unknown as Record<string, unknown>, recebidoEm: EM("2026-10-01T10:00:00Z") },
      { payload: { email: "a@x.com" }, recebidoEm: EM("2026-10-02T10:00:00Z") },
    ]);
    expect(totalRows).toBe(2);
    expect(rows[0][1]).toBe("");
    expect(rows[1][1]).toBe("a@x.com");
  });
});

describe("montarPrevia", () => {
  const casadas = new Map([
    ["Qual seu faturamento mensal?", { perguntaId: "q1", rotulo: "Faturamento" }],
  ]);

  it("abre pela coluna de data, que quem envia não precisa mandar", () => {
    const linhas = montarPrevia(new Map([["email", "ana@x.com"]]), new Map(), campoDoApelido);
    expect(linhas[0].coluna).toBe(COLUNA_DATA);
    expect(linhas[0].destino).toEqual({ tipo: "data" });
  });

  it("mostra a pergunta do modelo que casou com a coluna", () => {
    const [, linha] = montarPrevia(
      new Map([["Qual seu faturamento mensal?", "Acima de 100 mil"]]),
      casadas,
      campoDoApelido,
    );
    expect(linha.destino).toEqual({ tipo: "pergunta", perguntaId: "q1", rotulo: "Faturamento" });
    expect(linha.exemplo).toBe("Acima de 100 mil");
  });

  it("reconhece contato pelos mesmos apelidos que a recepção usa", () => {
    const linhas = montarPrevia(
      new Map([
        ["whats", "11999990000"],
        ["origem", "ig"],
      ]),
      new Map(),
      campoDoApelido,
    );
    expect(linhas[1].destino).toEqual({ tipo: "contato", campo: "telefone" });
    expect(linhas[2].destino).toEqual({ tipo: "contato", campo: "utmSource" });
  });

  it("pergunta do modelo ganha do apelido de contato na mesma coluna", () => {
    // "Qual o seu e-mail?" é pergunta do formulário; se o apelido vencesse, a
    // prévia diria que a resposta vira o campo de contato e não pontua.
    const casadaNoEmail = new Map([["email", { perguntaId: "q9", rotulo: "E-mail" }]]);
    const [, linha] = montarPrevia(
      new Map([["email", "ana@x.com"]]),
      casadaNoEmail,
      campoDoApelido,
    );
    expect(linha.destino).toEqual({ tipo: "pergunta", perguntaId: "q9", rotulo: "E-mail" });
  });

  it("coluna que ninguém reclama fica como não usada, e não some", () => {
    const [, linha] = montarPrevia(
      new Map([["observacao_interna", "veio do grupo 3"]]),
      new Map(),
      campoDoApelido,
    );
    expect(linha).toEqual({
      coluna: "observacao_interna",
      exemplo: "veio do grupo 3",
      destino: { tipo: "nao_usado" },
    });
  });
});

describe("inferirContentType", () => {
  it("reconhece os pares do formulário, que a tela promete aceitar", () => {
    // Sem isto o parser caía no JSON.parse e recusava TODO envio por
    // formulário colado na prévia.
    expect(inferirContentType("email=ana%40x.com&faixa=A")).toContain("urlencoded");
  });

  it("JSON, mesmo quando é o array que o n8n manda", () => {
    expect(inferirContentType('  {"email":"a@x.com"} ')).toBe("application/json");
    expect(inferirContentType('[{"body":{"email":"a@x.com"}}]')).toBe("application/json");
  });
});

describe("motivoDeNaoLer", () => {
  it("diz a linha e a coluna onde o JSON quebra", () => {
    // O caso real: o exemplo foi copiado de um lugar que cortou as linhas e
    // uma string ficou sem fechar. "Não consegui ler" não dava para agir.
    const cortado = ['{', '  "a": "um",', '  "b": "dois', '  "c": "tres"', "}"].join("\n");
    const motivo = motivoDeNaoLer(cortado);
    expect(motivo).toMatch(/linha \d+, coluna \d+/);
    expect(motivo).toMatch(/cortada ao copiar/);
  });

  it("separa o JSON válido e vazio do JSON inválido", () => {
    expect(motivoDeNaoLer("{}")).toMatch(/sem nenhum campo/);
    expect(motivoDeNaoLer("   ")).toMatch(/vazio/);
    expect(motivoDeNaoLer("resposta recebida")).toMatch(/não parece JSON/);
  });
});
