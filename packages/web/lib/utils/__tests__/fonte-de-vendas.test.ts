import { describe, it, expect } from "vitest";
import {
  escolherFonteDeVendas,
  valorDaLinha,
  totalizarVendas,
  type LinhaComNamed,
} from "../fonte-de-vendas";

/**
 * Story 18.72.
 *
 * O gate do @qa (QA-1872-01) pediu que este teste parta de linhas CRUAS com o
 * mapping real, não de um hook mockado: com mock, ele passa mesmo se o campo de
 * valor estiver errado, porque o mock devolve o que o teste espera.
 *
 * Por isso as linhas abaixo são as que a rota realmente monta a partir da aba
 * `n8n-Kiwify` do `bbe-pr2-ago-26` — `value` já traduzido de `valorBruto` pelo
 * backend, no vocabulário comum.
 */

/** Como a rota entrega uma linha de `stage_sales_spreadsheets`. */
function linhaDaEtapa(utm_source: string, valor: string): LinhaComNamed {
  return { named: { utm_source, value: valor, date: "2026-08-28", email: "x@y.com" } };
}

/** Como a linha chegaria se o backend NÃO traduzisse o vocabulário. */
function linhaSemTraducao(utm_source: string, valorBruto: string): LinhaComNamed {
  return { named: { utm_source, valorBruto, date: "2026-08-28" } };
}

describe("escolherFonteDeVendas — nunca soma as duas", () => {
  it("etapa sem funnel_spreadsheets usa a planilha da etapa (o caso do relato)", () => {
    const r = escolherFonteDeVendas({
      temPlanilhaDoFunil: false,
      planilhasDaEtapa: [{ rows: [linhaDaEtapa("meta", "1.097,00"), linhaDaEtapa("meta", "797,00")] }],
    });
    expect(r.origem).toBe("stage_sales_spreadsheets");
    expect(r.linhas).toHaveLength(2);
  });

  it("com as DUAS fontes, vence funnel_spreadsheets — o fz-l2-jun-26 não pode mudar", () => {
    const doFunil = [linhaDaEtapa("meta", "500,00")];
    const daEtapa = [linhaDaEtapa("meta", "1.097,00"), linhaDaEtapa("org", "797,00")];
    const r = escolherFonteDeVendas({
      temPlanilhaDoFunil: true,
      linhasDoFunil: doFunil,
      planilhasDaEtapa: [{ rows: daEtapa }],
    });

    expect(r.origem).toBe("funnel_spreadsheets");
    expect(r.linhas).toHaveLength(1);
    // A regressão que este teste existe para impedir: somar as duas daria 3.
    expect(r.linhas).not.toHaveLength(3);
    expect(totalizarVendas(r.linhas).faturamento).toBe(500);
  });

  it("etapa com várias planilhas junta as linhas das duas", () => {
    const r = escolherFonteDeVendas({
      temPlanilhaDoFunil: false,
      planilhasDaEtapa: [
        { rows: [linhaDaEtapa("meta", "100,00")] },
        { rows: [linhaDaEtapa("org", "200,00")] },
      ],
    });
    expect(r.linhas).toHaveLength(2);
    expect(totalizarVendas(r.linhas).faturamento).toBe(300);
  });

  it("nenhuma planilha é ausência declarada, não erro", () => {
    const r = escolherFonteDeVendas({ temPlanilhaDoFunil: false, planilhasDaEtapa: [] });
    expect(r.origem).toBe("nenhuma");
    expect(r.linhas).toHaveLength(0);
    expect(r.erro).toBeUndefined();
  });

  it("planilha cadastrada e vazia não é 'nenhuma planilha'", () => {
    const r = escolherFonteDeVendas({ temPlanilhaDoFunil: true, linhasDoFunil: [], planilhasDaEtapa: [] });
    expect(r.origem).toBe("funnel_spreadsheets");
  });

  it("quem decide a fonte é o CADASTRO, não quantas linhas caem na janela", () => {
    // A primeira versão decidia por `linhasDoFunil.length > 0`. Com uma janela
    // curta em que o funil não vendeu, ela trocava de fonte sozinha e o número
    // da tela mudava ao mexer no filtro de período — sem nada explicando.
    const janelaSemVendaNoFunil = escolherFonteDeVendas({
      temPlanilhaDoFunil: true,
      linhasDoFunil: [],
      planilhasDaEtapa: [{ rows: [linhaDaEtapa("meta", "1.097,00")] }],
    });
    expect(janelaSemVendaNoFunil.origem).toBe("funnel_spreadsheets");
    expect(janelaSemVendaNoFunil.linhas).toHaveLength(0);

    const janelaComVenda = escolherFonteDeVendas({
      temPlanilhaDoFunil: true,
      linhasDoFunil: [linhaDaEtapa("meta", "500,00")],
      planilhasDaEtapa: [{ rows: [linhaDaEtapa("meta", "1.097,00")] }],
    });
    // Mesma fonte nas duas janelas: a origem não depende do filtro de período.
    expect(janelaComVenda.origem).toBe(janelaSemVendaNoFunil.origem);
  });

  it("AC4 — falha de leitura vira erro, não silêncio", () => {
    const r = escolherFonteDeVendas({
      temPlanilhaDoFunil: false,
      planilhasDaEtapa: [{ rows: [], erro: "Google Sheets: 403" }],
    });
    // Sem isto, "não consegui ler" e "não vendeu" são a mesma tela.
    expect(r.erro).toContain("403");
    expect(r.linhas).toHaveLength(0);
  });

  it("AC4 — uma planilha ilegível entre várias ainda reporta o erro", () => {
    const r = escolherFonteDeVendas({
      temPlanilhaDoFunil: false,
      planilhasDaEtapa: [
        { rows: [linhaDaEtapa("meta", "100,00")] },
        { rows: [], erro: "timeout" },
      ],
    });
    expect(r.linhas).toHaveLength(1);
    expect(r.erro).toContain("timeout");
  });
});

describe("valorDaLinha — AC2, o campo certo e o formato certo", () => {
  it("lê o vocabulário comum, com separador de milhar", () => {
    expect(valorDaLinha(linhaDaEtapa("meta", "1.097,00"))).toBe(1097);
    expect(valorDaLinha(linhaDaEtapa("meta", "797,00"))).toBe(797);
    expect(valorDaLinha(linhaDaEtapa("meta", "12.345,67"))).toBeCloseTo(12345.67, 2);
  });

  it("linha SEM tradução de vocabulário devolve zero — o modo de falha do gate", () => {
    // Se o backend deixar de traduzir valorBruto→value, o teste denuncia:
    // a contagem continuaria certa e o faturamento sairia R$ 0.
    const linha = linhaSemTraducao("meta", "1.097,00");
    expect(valorDaLinha(linha)).toBe(0);
    expect(totalizarVendas([linha])).toEqual({ vendas: 1, faturamento: 0 });
  });

  it("aceita en-US e valor sem separador", () => {
    expect(valorDaLinha(linhaDaEtapa("meta", "1,234.56"))).toBeCloseTo(1234.56, 2);
    expect(valorDaLinha(linhaDaEtapa("meta", "1097"))).toBe(1097);
  });

  it("símbolo de moeda, vazio e lixo não viram NaN", () => {
    expect(valorDaLinha(linhaDaEtapa("meta", "R$ 1.097,00"))).toBe(1097);
    expect(valorDaLinha(linhaDaEtapa("meta", ""))).toBe(0);
    expect(valorDaLinha({ named: {} })).toBe(0);
    expect(Number.isNaN(valorDaLinha(linhaDaEtapa("meta", "grátis")))).toBe(false);
  });
});

describe("totalizarVendas — uma linha é uma venda", () => {
  it("conta linhas e soma valores", () => {
    const linhas = [
      linhaDaEtapa("meta", "1.097,00"),
      linhaDaEtapa("meta", "2.194,00"),
      linhaDaEtapa("meta", "797,00"),
    ];
    expect(totalizarVendas(linhas)).toEqual({ vendas: 3, faturamento: 4088 });
  });

  it("conjunto vazio é zero, não NaN", () => {
    expect(totalizarVendas([])).toEqual({ vendas: 0, faturamento: 0 });
  });
});
