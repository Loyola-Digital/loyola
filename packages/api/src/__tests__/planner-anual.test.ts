/**
 * A matriz do calendário anual.
 *
 * O que estes testes protegem: a tela recebe SEMPRE doze colunas por esteira,
 * e o vocabulário dos dropdowns não aceita valor de fora. Uma coluna que falta
 * desalinha o ano inteiro; um "back end" solto ao lado de "Back-End" quebra
 * qualquer leitura por categoria depois.
 */

import { describe, expect, it } from "vitest";
import {
  CATEGORIAS,
  COR_DO_GRUPO,
  FUNIS,
  ROTULO_DO_GRUPO,
  celulaVazia,
  ehGrupo,
  gruposDoProjeto,
  limparCelula,
  limparCor,
  limparRotulo,
  montarMatriz,
  type CelulaGravada,
  type EsteiraDoAnual,
} from "../services/planner-anual.js";

const esteira = (id: string, nome: string, sortOrder = 0, grupo = "organico"): EsteiraDoAnual => ({
  id,
  grupo,
  nome,
  sortOrder,
});

const gravada = (
  trackId: string,
  mes: number,
  extra: Partial<CelulaGravada> = {},
): CelulaGravada => ({
  trackId,
  ano: 2026,
  mes,
  frequencia: null,
  produto: null,
  categoria: null,
  funil: null,
  ...extra,
});

describe("montarMatriz", () => {
  it("devolve doze meses mesmo sem nenhuma célula gravada", () => {
    // O banco guarda só o que foi preenchido; a tela precisa das doze colunas
    // de qualquer forma. Uma coluna que falta desalinha o ano inteiro.
    const [linha] = montarMatriz([esteira("t1", "Lançamento")], []);
    expect(linha!.meses).toHaveLength(12);
    expect(linha!.meses.every((m) => m.frequencia === null && m.funil === null)).toBe(true);
  });

  it("põe cada célula no mês certo", () => {
    const [linha] = montarMatriz(
      [esteira("t1", "Lançamento")],
      [
        gravada("t1", 1, { frequencia: "19, 20 e 21", funil: "Lançamento" }),
        gravada("t1", 4, { frequencia: "06, 07 e 08" }),
      ],
    );
    // Índice 0 é Janeiro — o mês 1 do banco.
    expect(linha!.meses[0]!.frequencia).toBe("19, 20 e 21");
    expect(linha!.meses[0]!.funil).toBe("Lançamento");
    expect(linha!.meses[3]!.frequencia).toBe("06, 07 e 08");
    expect(linha!.meses[1]!.frequencia).toBeNull();
  });

  it("não deixa célula de uma esteira aparecer na outra", () => {
    const linhas = montarMatriz(
      [esteira("t1", "A", 0), esteira("t2", "B", 1)],
      [gravada("t1", 1, { produto: "só da t1" })],
    );
    expect(linhas[0]!.meses[0]!.produto).toBe("só da t1");
    expect(linhas[1]!.meses[0]!.produto).toBeNull();
  });

  it("ordena pela ordem manual, com o nome desempatando", () => {
    const linhas = montarMatriz(
      [esteira("t3", "Zebra", 5), esteira("t1", "Beta", 1), esteira("t2", "Alfa", 1)],
      [],
    );
    expect(linhas.map((l) => l.nome)).toEqual(["Alfa", "Beta", "Zebra"]);
  });

  it("cada mês vazio é um objeto próprio", () => {
    // Compartilhar a mesma referência entre as 12 posições faria digitar em
    // Janeiro aparecer nos doze meses de uma vez.
    const [linha] = montarMatriz([esteira("t1", "A")], []);
    linha!.meses[0]!.produto = "só janeiro";
    expect(linha!.meses[1]!.produto).toBeNull();
  });
});

describe("limparCelula", () => {
  it('trata "" e espaço como ausência, não como valor', () => {
    // Guardar "" faria a tela mostrar um campo vazio como se estivesse
    // preenchido — e a célula nunca seria considerada limpa para apagar.
    const c = limparCelula({ frequencia: "   ", produto: "", categoria: "", funil: "" });
    expect(c).toEqual({ frequencia: null, produto: null, categoria: null, funil: null });
  });

  it("descarta categoria e funil fora do vocabulário", () => {
    const c = limparCelula({ categoria: "back end", funil: "Reels" });
    expect(c.categoria).toBeNull();
    expect(c.funil).toBeNull();
  });

  it("aceita os valores do vocabulário", () => {
    for (const cat of CATEGORIAS) expect(limparCelula({ categoria: cat }).categoria).toBe(cat);
    for (const f of FUNIS) expect(limparCelula({ funil: f }).funil).toBe(f);
  });

  it("apara o texto livre e respeita o limite", () => {
    expect(limparCelula({ frequencia: "  3x por mês  " }).frequencia).toBe("3x por mês");
    expect(limparCelula({ produto: "x".repeat(300) }).produto).toHaveLength(160);
  });
});

describe("celulaVazia", () => {
  it("vazia quando os quatro campos estão em branco", () => {
    expect(celulaVazia({ frequencia: null, produto: null, categoria: null, funil: null })).toBe(
      true,
    );
  });

  it("um campo qualquer já a torna preenchida", () => {
    // Cada um sozinho precisa segurar a célula: limpar o funil e manter a
    // frequência não pode apagar a linha.
    expect(
      celulaVazia({ frequencia: "Diário", produto: null, categoria: null, funil: null }),
    ).toBe(false);
    expect(
      celulaVazia({ frequencia: null, produto: null, categoria: null, funil: "DR - VSL" }),
    ).toBe(false);
  });
});

describe("ehGrupo", () => {
  it("aceita os três da lateral e recusa o resto", () => {
    expect(ehGrupo("organico")).toBe(true);
    expect(ehGrupo("trafego")).toBe(true);
    expect(ehGrupo("ascensao")).toBe(true);
    expect(ehGrupo("ORGÂNICO")).toBe(false);
    expect(ehGrupo("outro")).toBe(false);
  });
});

/**
 * A faixa do grupo é renomeável e pinta com a cor que a empresa escolher.
 *
 * O que estes testes protegem: sem personalização a tela vê o padrão (a
 * tabela guarda só o que mudou, então "sem linha" é o caso comum, não a
 * exceção), apagar o nome volta ao padrão em vez de deixar uma faixa muda, e
 * cor que não é hexadecimal não chega ao `background-color` do navegador.
 */
describe("gruposDoProjeto", () => {
  it("sem personalização nenhuma, entrega os três padrões na ordem", () => {
    const g = gruposDoProjeto([]);
    expect(g.map((x) => x.id)).toEqual(["organico", "trafego", "ascensao"]);
    expect(g[0].rotulo).toBe(ROTULO_DO_GRUPO.organico);
    expect(g[0].cor).toBe(COR_DO_GRUPO.organico);
  });

  it("aplica só o que a empresa mudou, mantendo o resto no padrão", () => {
    const g = gruposDoProjeto([{ grupo: "trafego", rotulo: "MÍDIA PAGA", cor: "#112233" }]);
    expect(g[1]).toEqual({ id: "trafego", rotulo: "MÍDIA PAGA", cor: "#112233" });
    expect(g[0].rotulo).toBe(ROTULO_DO_GRUPO.organico);
    expect(g[2].cor).toBe(COR_DO_GRUPO.ascensao);
  });

  it("nome apagado volta ao padrão — faixa colorida sem texto não diz nada", () => {
    const g = gruposDoProjeto([{ grupo: "organico", rotulo: "   ", cor: null }]);
    expect(g[0].rotulo).toBe(ROTULO_DO_GRUPO.organico);
    expect(g[0].cor).toBe(COR_DO_GRUPO.organico);
  });

  it("cor inválida cai no padrão em vez de ir para o CSS", () => {
    const g = gruposDoProjeto([{ grupo: "ascensao", rotulo: null, cor: "red; content: x" }]);
    expect(g[2].cor).toBe(COR_DO_GRUPO.ascensao);
  });

  it("grupo desconhecido na tabela é ignorado", () => {
    const g = gruposDoProjeto([{ grupo: "inventado", rotulo: "X", cor: "#000000" }]);
    expect(g).toHaveLength(3);
    expect(g.some((x) => x.rotulo === "X")).toBe(false);
  });
});

describe("limparCor", () => {
  it("normaliza para minúsculo e aceita a forma de três dígitos", () => {
    expect(limparCor("#AABBCC")).toBe("#aabbcc");
    expect(limparCor("#F0A")).toBe("#ff00aa");
  });

  it("recusa o que não é hexadecimal", () => {
    for (const v of ["red", "rgb(1,2,3)", "#12345", "", null, undefined, "#gggggg"]) {
      expect(limparCor(v)).toBeNull();
    }
  });
});

describe("limparRotulo", () => {
  it("corta em 40 para não estourar a coluna do banco", () => {
    expect(limparRotulo("x".repeat(80))).toHaveLength(40);
  });

  it("só espaço é ausência", () => {
    expect(limparRotulo("  ")).toBeNull();
  });
});
