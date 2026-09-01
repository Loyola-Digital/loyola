/**
 * A regra da Etapa de Aplicação.
 *
 * O que estes testes protegem, em ordem de importância: a venda não pode ser
 * contada duas vezes, o casamento por e-mail não pode falhar por caixa alta, e
 * "não houve base para calcular" não pode virar "ninguém converteu".
 */

import { describe, expect, it } from "vitest";
import {
  SEM_ORIGEM,
  dedupKey,
  dentroDoPeriodo,
  emailComparavel,
  resumir,
  sanitizarUtm,
  type AplicacaoDaEtapa,
  type VendaDaAplicacao,
} from "../services/etapa-de-aplicacao.js";
import { dataDaCelula, valorEmReais } from "../routes/stage-application.js";

const aplicacao = (over: Partial<AplicacaoDaEtapa> = {}): AplicacaoDaEtapa => ({
  email: "joao@gmail.com",
  data: new Date("2026-08-10"),
  utmSource: "meta-ads",
  utmMedium: "publico-frio",
  ...over,
});

const venda = (over: Partial<VendaDaAplicacao> = {}): VendaDaAplicacao => ({
  email: "joao@gmail.com",
  valor: 1000,
  utmSource: "meta-ads",
  utmMedium: "publico-frio",
  data: new Date("2026-08-12"),
  chave: "p1|linha|0",
  ...over,
});

describe("emailComparavel", () => {
  it("casa o que o humano digitou com o que o gateway gravou", () => {
    // O caso real: formulário com caixa alta e espaço, Kiwify em minúsculo.
    expect(emailComparavel(" Joao@Gmail.com ")).toBe(emailComparavel("joao@gmail.com"));
  });

  it("não inventa equivalência de Gmail", () => {
    // Pontos e `+tag` são endereços diferentes para o resto do sistema.
    // Igualá-los aqui faria esta tela discordar de todas as outras.
    expect(emailComparavel("j.oao@gmail.com")).not.toBe(emailComparavel("joao@gmail.com"));
    expect(emailComparavel("joao+x@gmail.com")).not.toBe(emailComparavel("joao@gmail.com"));
  });
});

describe("sanitizarUtm", () => {
  it("trata o lixo que a automação escreve como texto", () => {
    // Sem isto, nasce uma origem chamada "null" ao lado de "Sem Track" — o
    // mesmo grupo partido em dois.
    for (const lixo of ["null", "undefined", "-", "n/a", "NA", "  ", ""]) {
      expect(sanitizarUtm(lixo)).toBeNull();
    }
  });

  it("preserva a origem de verdade, com a caixa que veio", () => {
    expect(sanitizarUtm(" Meta-Ads ")).toBe("Meta-Ads");
  });
});

describe("dedupKey", () => {
  it("com transactionId, o retry do gateway não vira duas vendas", () => {
    expect(dedupKey("p1", 5, "tx-99")).toBe(dedupKey("p1", 8, "tx-99"));
  });

  it("sem transactionId, cada linha é uma venda", () => {
    // Recompra do mesmo cliente é venda de verdade: colapsar por e-mail
    // esconderia receita.
    expect(dedupKey("p1", 5, null)).not.toBe(dedupKey("p1", 6, null));
  });

  it("planilhas diferentes nunca colidem", () => {
    expect(dedupKey("p1", 5, "tx-99")).not.toBe(dedupKey("p2", 5, "tx-99"));
  });
});

describe("dentroDoPeriodo", () => {
  const de = new Date("2026-08-01");
  const ate = new Date("2026-08-31");

  it("corta o que está fora", () => {
    expect(dentroDoPeriodo(new Date("2026-07-31"), de, ate)).toBe(false);
    expect(dentroDoPeriodo(new Date("2026-09-01"), de, ate)).toBe(false);
    expect(dentroDoPeriodo(new Date("2026-08-15"), de, ate)).toBe(true);
  });

  it("linha sem data ENTRA", () => {
    // Descartá-la sumiria com receita real por uma célula mal formatada, e o
    // total deixaria de bater com a planilha que o time abre para conferir.
    expect(dentroDoPeriodo(null, de, ate)).toBe(true);
  });
});

describe("resumir", () => {
  it("conta aplicações, vendas e quem converteu", () => {
    const r = resumir(
      [aplicacao(), aplicacao({ email: "maria@x.com" })],
      [venda(), venda({ email: "fora@x.com", chave: "p1|linha|1", valor: 500 })],
    );
    expect(r.aplicacoes).toBe(2);
    expect(r.vendas).toBe(2);
    expect(r.valorTotal).toBe(1500);
    // Só o João se aplicou E comprou.
    expect(r.converteram).toBe(1);
    expect(r.taxaDeConversao).toBe(50);
  });

  it("a venda repetida não é contada duas vezes", () => {
    const r = resumir([aplicacao()], [venda(), venda()]);
    expect(r.vendas).toBe(1);
    expect(r.valorTotal).toBe(1000);
  });

  it("casa e-mail com caixa e espaço diferentes", () => {
    // É o caso que faria a taxa aparecer em zero e o time desconfiar da tela.
    const r = resumir(
      [aplicacao({ email: emailComparavel(" JOAO@Gmail.com ") })],
      [venda({ email: emailComparavel("joao@gmail.com") })],
    );
    expect(r.converteram).toBe(1);
  });

  it("sem aplicação a taxa é null, não zero", () => {
    // Zero afirmaria "ninguém converteu"; null diz "não houve base".
    const r = resumir([], [venda()]);
    expect(r.taxaDeConversao).toBeNull();
    expect(r.vendas).toBe(1);
  });

  it("origem que trouxe aplicação e nenhuma venda continua na tabela", () => {
    // É exatamente o que se procura numa etapa de aplicação: o canal que enche
    // o formulário e não vende. Somem-lo esconderia a resposta.
    const r = resumir(
      [aplicacao({ utmSource: "organico", utmMedium: "bio" }), aplicacao()],
      [venda()],
    );
    const organico = r.porUtmSource.find((x) => x.origem === "organico");
    expect(organico).toBeDefined();
    expect(organico?.aplicacoes).toBe(1);
    expect(organico?.vendas).toBe(0);
  });

  it("sem UTM, a linha cai em Sem Track em vez de sumir", () => {
    const r = resumir(
      [aplicacao({ utmSource: "", utmMedium: "" })],
      [venda({ utmSource: "", utmMedium: "", chave: "p1|linha|9" })],
    );
    const s = r.porUtmSource.find((x) => x.origem === SEM_ORIGEM);
    expect(s?.vendas).toBe(1);
    expect(s?.aplicacoes).toBe(1);
  });

  it("a quebra vem do maior valor para o menor", () => {
    const r = resumir(
      [],
      [
        venda({ utmSource: "pequeno", valor: 100, chave: "a" }),
        venda({ utmSource: "grande", valor: 900, chave: "b" }),
      ],
    );
    expect(r.porUtmSource[0]?.origem).toBe("grande");
  });

  it("a soma da quebra bate com o total", () => {
    // Se estes dois números divergirem na tela, ninguém confia em nenhum.
    const vendas = [
      venda({ chave: "a", valor: 100, utmSource: "x" }),
      venda({ chave: "b", valor: 250, utmSource: "y" }),
      venda({ chave: "c", valor: 700, utmSource: "x" }),
    ];
    const r = resumir([aplicacao()], vendas);
    const somaSource = r.porUtmSource.reduce((acc, o) => acc + o.valor, 0);
    expect(somaSource).toBe(r.valorTotal);
    const somaVendas = r.porUtmSource.reduce((acc, o) => acc + o.vendas, 0);
    expect(somaVendas).toBe(r.vendas);
  });
});

describe("os parsers, contra o que as planilhas reais escrevem", () => {
  // Mapeamentos conferidos no dg-pg04: `Valor oferta`, `Preço Original`,
  // `Data Criação`. Os formatos abaixo são os que aparecem nessas colunas.
  it("lê valor em real brasileiro e em decimal com ponto", () => {
    expect(valorEmReais("R$ 1.234,56")).toBe(1234.56);
    expect(valorEmReais("R$ 297,00")).toBe(297);
    // A Kiwify exporta com ponto decimal: tratar o ponto como milhar aqui
    // transformaria R$ 1.234,56 em R$ 123.456.
    expect(valorEmReais("1234.56")).toBe(1234.56);
    expect(valorEmReais("297")).toBe(297);
  });

  it("célula vazia ou riscada vale zero, não NaN", () => {
    // NaN contamina a soma inteira e o total vira "—" na tela.
    for (const v of ["", "-", "  ", undefined]) expect(valorEmReais(v)).toBe(0);
  });

  it("lê data brasileira e ISO", () => {
    expect(dataDaCelula("12/08/2026")?.getMonth()).toBe(7);
    expect(dataDaCelula("12/08/2026")?.getDate()).toBe(12);
    expect(dataDaCelula("2026-08-12")?.toISOString().slice(0, 10)).toBe("2026-08-12");
  });

  it("texto que não é data vira null, e a venda entra assim mesmo", () => {
    // `dentroDoPeriodo(null, …)` é `true` de propósito: melhor contar a venda
    // sem data que sumir com receita real por uma célula mal formatada.
    expect(dataDaCelula("sem data")).toBeNull();
    expect(dentroDoPeriodo(dataDaCelula("sem data"), new Date("2026-08-01"), null)).toBe(true);
  });
});
