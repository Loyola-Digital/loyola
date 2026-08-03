import { describe, it, expect } from "vitest";
import {
  resolverColunaPreco,
  mediana,
  moda,
  valorBrl,
  produtosComPrecoContaminado,
  LIMITE_PRECOS_DISTINTOS,
  type LinhaVendaValor,
} from "../services/launch-report-sales-value";

/** Atalho: linha BRL (sem coluna de moeda — o caso normal do Loyola). */
function brl(produto: string, preco: number, data = "2026-07-15"): LinhaVendaValor {
  return { produto, preco, data };
}

/** Atalho: linha marcada com moeda estrangeira. */
function fx(produto: string, preco: number, moeda = "USD", data = "2026-07-15"): LinhaVendaValor {
  return { produto, preco, moeda, data };
}

describe("resolverColunaPreco — §2.4 nunca usar 'valor da oferta'", () => {
  const headers = ["E-mail", "Produto", "Preço", "Valor oferta", "Líquido", "Data Criação"];

  it("respeita o mapping quando ele aponta para uma coluna legítima (caso PG02)", () => {
    const r = resolverColunaPreco("Preço", headers);
    expect(r.coluna).toBe("Preço");
    expect(r.origem).toBe("mapping");
    expect(r.mappingDivergente).toBe(false);
  });

  it("ignora o mapping e usa Preço quando ele aponta para 'Valor oferta' (caso PG04 real)", () => {
    // Config real do stage de Captação Paga do dg-pg04 em produção (2026-07-30).
    const r = resolverColunaPreco("Valor oferta", headers);
    expect(r.coluna).toBe("Preço");
    expect(r.origem).toBe("header-preco");
    expect(r.mappingDivergente).toBe(true);
    expect(r.colunaDoMapping).toBe("Valor oferta");
  });

  it("também rejeita 'valor pago' e variações de caixa/acento", () => {
    expect(resolverColunaPreco("valor pago", headers).coluna).toBe("Preço");
    expect(resolverColunaPreco("VALOR DA OFERTA", headers).coluna).toBe("Preço");
    expect(resolverColunaPreco("Valor de Oferta", headers).coluna).toBe("Preço");
  });

  it("aceita 'Preco' sem cedilha nos cabeçalhos", () => {
    const r = resolverColunaPreco("Valor oferta", ["Produto", "Preco"]);
    expect(r.coluna).toBe("Preco");
    expect(r.mappingDivergente).toBe(true);
  });

  it("sem coluna de preço na planilha, devolve o mapping e não marca divergência", () => {
    // Não há para onde escapar: quem decide bloquear é o motor, não este helper.
    const r = resolverColunaPreco("Valor oferta", ["E-mail", "Produto", "Valor oferta"]);
    expect(r.coluna).toBe("Valor oferta");
    expect(r.origem).toBe("mapping");
    expect(r.mappingDivergente).toBe(false);
  });

  it("sem mapping nenhum, cai na coluna de preço", () => {
    expect(resolverColunaPreco(null, headers).coluna).toBe("Preço");
    expect(resolverColunaPreco("", headers).origem).toBe("header-preco");
  });

  it("sem mapping e sem coluna de preço → nenhuma", () => {
    const r = resolverColunaPreco(null, ["E-mail", "Produto"]);
    expect(r.coluna).toBeNull();
    expect(r.origem).toBe("nenhuma");
  });
});

describe("mediana", () => {
  it("ímpar → elemento do meio", () => {
    expect(mediana([99, 44.9, 297])).toBe(99);
  });

  it("par → média dos dois centrais", () => {
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  it("lista vazia → null, não 0", () => {
    expect(mediana([])).toBeNull();
  });

  it("não muta a entrada", () => {
    const v = [3, 1, 2];
    mediana(v);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("moda", () => {
  it("devolve o valor mais frequente", () => {
    expect(moda([44.9, 99, 44.9, 44.9, 99])).toBe(44.9);
  });

  it("agrupa centavos sem sofrer de ponto flutuante", () => {
    expect(moda([0.1 + 0.2, 0.3, 0.3, 99])).toBe(0.3);
  });

  it("empate de frequência → menor valor (conservador: não inflar faturamento)", () => {
    expect(moda([99, 44.9])).toBe(44.9);
  });

  it("lista vazia → null", () => {
    expect(moda([])).toBeNull();
  });
});

describe("valorBrl (§2.4)", () => {
  it("sem coluna de moeda, devolve os preços intactos — degradação correta", () => {
    // Caminho normal do Loyola: a planilha não mapeia moeda, então nenhuma linha
    // é "estrangeira" e a detecção nem liga.
    const linhas = [brl("Imersão", 297), brl("Imersão", 297), brl("GPT para Negócios", 99)];
    const r = valorBrl(linhas);
    expect(r.valores).toEqual([297, 297, 99]);
    expect(r.linhasConvertidas).toBe(0);
    expect(r.produtosConvertidos).toEqual([]);
  });

  it("converte pelo modal do mesmo dia quando mediana_fx < mediana_brl × 0,5", () => {
    const linhas = [
      brl("Imersão", 297, "2026-07-15"),
      brl("Imersão", 297, "2026-07-15"),
      brl("Imersão", 297, "2026-07-15"),
      fx("Imersão", 55, "USD", "2026-07-15"), // 55 < 297 × 0,5 → converte
    ];
    const r = valorBrl(linhas);
    expect(r.valores[3]).toBe(297);
    expect(r.linhasConvertidas).toBe(1);
    expect(r.produtosConvertidos).toEqual(["Imersão"]);
  });

  it("NÃO converte quando o preço estrangeiro já está na faixa BRL", () => {
    // mediana_fx (280) não é < mediana_brl (297) × 0,5 → o preço já foi convertido
    // na origem; mexer nele seria corromper o dado.
    const linhas = [brl("Imersão", 297), brl("Imersão", 297), fx("Imersão", 280)];
    const r = valorBrl(linhas);
    expect(r.valores[2]).toBe(280);
    expect(r.linhasConvertidas).toBe(0);
  });

  it("cai para o modal de qualquer dia quando não há BRL no dia da linha", () => {
    const linhas = [
      brl("Imersão", 297, "2026-07-10"),
      brl("Imersão", 297, "2026-07-10"),
      fx("Imersão", 55, "USD", "2026-07-20"), // nenhum BRL em 20/07
    ];
    const r = valorBrl(linhas);
    expect(r.valores[2]).toBe(297);
    expect(r.linhasConvertidas).toBe(1);
  });

  it("prefere o modal do MESMO dia ao de outro dia (preço fixo por lote)", () => {
    const linhas = [
      brl("Imersão", 197, "2026-07-10"), // lote 1
      brl("Imersão", 197, "2026-07-10"),
      brl("Imersão", 197, "2026-07-10"),
      brl("Imersão", 397, "2026-07-20"), // lote 2
      brl("Imersão", 397, "2026-07-20"),
      fx("Imersão", 40, "USD", "2026-07-20"),
    ];
    const r = valorBrl(linhas);
    expect(r.valores[5]).toBe(397); // o lote do dia, não o do lote anterior
  });

  it("a decisão de converter é POR PRODUTO", () => {
    const linhas = [
      brl("Imersão", 297),
      brl("Imersão", 297),
      fx("Imersão", 55), // converte
      brl("Combo", 99),
      brl("Combo", 99),
      fx("Combo", 95), // não converte — já está na faixa
    ];
    const r = valorBrl(linhas);
    expect(r.valores[2]).toBe(297);
    expect(r.valores[5]).toBe(95);
    expect(r.produtosConvertidos).toEqual(["Imersão"]);
    expect(r.linhasConvertidas).toBe(1);
  });

  it("produto sem par BRL não é convertido — não há referência para comparar", () => {
    const linhas = [brl("Imersão", 297), fx("Só em dólar", 55)];
    const r = valorBrl(linhas);
    expect(r.valores[1]).toBe(55);
    expect(r.linhasConvertidas).toBe(0);
  });

  it("preserva a ordem da entrada nos valores de saída", () => {
    const linhas = [brl("A", 10), brl("B", 20), brl("C", 30)];
    expect(valorBrl(linhas).valores).toEqual([10, 20, 30]);
  });

  it("conta preços distintos por produto (insumo do W4)", () => {
    const linhas = [
      brl("Imersão", 197),
      brl("Imersão", 197),
      brl("Imersão", 297),
      brl("Imersão", 397),
      brl("Combo", 99),
    ];
    const r = valorBrl(linhas);
    expect(r.precoDistintoPorProduto).toEqual({ "Imersão": 3, Combo: 1 });
  });

  it("produto null cai no bucket (sem produto), não é descartado", () => {
    const r = valorBrl([{ produto: null, preco: 50, data: "2026-07-15" }]);
    expect(r.precoDistintoPorProduto).toEqual({ "(sem produto)": 1 });
  });

  it("lista vazia não explode", () => {
    const r = valorBrl([]);
    expect(r.valores).toEqual([]);
    expect(r.linhasConvertidas).toBe(0);
    expect(r.precoDistintoPorProduto).toEqual({});
  });
});

describe("produtosComPrecoContaminado (insumo do W4)", () => {
  it("sinaliza produto acima do limite de 15 valores distintos", () => {
    const r = produtosComPrecoContaminado({ Contaminado: 42, Normal: 3 });
    expect(r).toEqual([{ produto: "Contaminado", valoresDistintos: 42 }]);
  });

  it("o limite é exclusivo: exatamente 15 não sinaliza, 16 sinaliza", () => {
    expect(produtosComPrecoContaminado({ P: LIMITE_PRECOS_DISTINTOS })).toEqual([]);
    expect(produtosComPrecoContaminado({ P: LIMITE_PRECOS_DISTINTOS + 1 })).toHaveLength(1);
  });

  it("ordena do mais contaminado para o menos", () => {
    const r = produtosComPrecoContaminado({ A: 20, B: 99, C: 30 });
    expect(r.map((x) => x.produto)).toEqual(["B", "C", "A"]);
  });

  it("nada acima do limite → lista vazia", () => {
    expect(produtosComPrecoContaminado({ A: 1, B: 2 })).toEqual([]);
  });
});
