/**
 * Stories 29.70/29.71/29.72 — as regras da seção "Análise detalhada no período".
 *
 * O que estes casos protegem é a decisão de NÃO desenhar o painel por hora
 * quando a cobertura é baixa. Medido em produção: o `fz-a1` tem 5% das vendas
 * com hora, e o painel mostraria R$ 4.720 ao lado de um painel de dia da semana
 * com R$ 90.974 do mesmo período.
 */
import {
  PISO_DE_COBERTURA_HORARIA,
  coberturaDeHora,
  rotuloDaHora,
} from "@/lib/utils/perpetual-analise-horaria";

describe("coberturaDeHora", () => {
  it("100% de cobertura desenha o gráfico (bbe-fc1-a1: 187 de 187)", () => {
    const c = coberturaDeHora({
      totalVendas: 187,
      vendasComHora: 187,
      faturamentoComHora: 57549,
      faturamentoSemHora: 0,
    });
    expect(c.percentual).toBe(100);
    expect(c.abaixoDoPiso).toBe(false);
    expect(c.faturamentoTotal).toBe(57549);
  });

  it("5% NÃO desenha — o caso do fz-a1", () => {
    // 80 de 1.594 vendas com hora, R$ 4.720 de R$ 90.974. O painel por hora
    // mostraria 5% do funil ao lado de um painel de dia da semana com 100%.
    const c = coberturaDeHora({
      totalVendas: 1594,
      vendasComHora: 80,
      faturamentoComHora: 4720,
      faturamentoSemHora: 86254,
    });
    expect(c.percentual).toBe(5);
    expect(c.abaixoDoPiso).toBe(true);
    expect(c.faturamentoTotal).toBe(90974);
  });

  it("30% também não desenha — o caso do pps1", () => {
    const c = coberturaDeHora({
      totalVendas: 464,
      vendasComHora: 141,
      faturamentoComHora: 8545,
      faturamentoSemHora: 20861,
    });
    expect(c.percentual).toBe(30);
    expect(c.abaixoDoPiso).toBe(true);
  });

  it("exatamente no piso desenha — o corte é ABAIXO dele", () => {
    const c = coberturaDeHora({
      totalVendas: 100,
      vendasComHora: PISO_DE_COBERTURA_HORARIA,
      faturamentoComHora: 500,
      faturamentoSemHora: 500,
    });
    expect(c.percentual).toBe(PISO_DE_COBERTURA_HORARIA);
    expect(c.abaixoDoPiso).toBe(false);
  });

  it("período SEM VENDA não é cobertura baixa", () => {
    // Sem venda nenhuma o painel mostra o estado vazio, com outra mensagem.
    // Se caísse no aviso de cobertura, o texto diria "só 0% das vendas têm
    // hora" para um período que simplesmente não teve venda.
    const c = coberturaDeHora({
      totalVendas: 0,
      vendasComHora: 0,
      faturamentoComHora: 0,
      faturamentoSemHora: 0,
    });
    expect(c.percentual).toBe(0);
    expect(c.abaixoDoPiso).toBe(false);
  });

  it("o faturamento total soma as duas pontas", () => {
    // O gestor lê o percentual em vendas, mas confere em reais: uma venda
    // grande fora do corte muda a leitura mais que dez pequenas.
    const c = coberturaDeHora({
      totalVendas: 10,
      vendasComHora: 9,
      faturamentoComHora: 900,
      faturamentoSemHora: 5000,
    });
    expect(c.percentual).toBe(90);
    expect(c.faturamentoTotal).toBe(5900);
    // 90% das vendas, mas só 15% do faturamento — e o aviso mostra os dois.
    expect(c.faturamentoComHora / c.faturamentoTotal).toBeLessThan(0.2);
  });
});

describe("rotuloDaHora", () => {
  it("duas casas para o eixo não desalinhar", () => {
    expect(rotuloDaHora(0)).toBe("00h");
    expect(rotuloDaHora(9)).toBe("09h");
    expect(rotuloDaHora(23)).toBe("23h");
  });
});
