import { describe, it, expect } from "vitest";
import {
  antesDe,
  hojeSaoPaulo,
  horaSaoPaulo,
  julgar,
  leituraDoItem,
  textoDoAlerta,
  type Leitura,
  type Regra,
} from "../services/alertas-de-funil.js";
import type { ItemDeFunil } from "../services/por-funil.js";

/**
 * O que decide se a pessoa é interrompida.
 *
 * A pergunta aqui não é "a soma está certa" — isso é SQL, conferido contra o
 * painel. É "quando a gente cala a boca": piso de gasto, um aviso por
 * dia, e o silêncio quando não há dado. Errar para o lado de falar demais é o
 * jeito conhecido de a pessoa desligar a notificação inteira.
 */

const HOJE = "2026-10-14";

function regra(over: Partial<Regra> = {}): Regra {
  return {
    id: "r1",
    projectId: "p1",
    metrica: "roas",
    comparador: "menor",
    valor: "1",
    gastoMinimo: null,
    janelaDias: 1,
    ...over,
  };
}

const leitura = (over: Partial<Leitura> = {}): Leitura => ({
  valor: 0.5,
  gasto: 1000,
  faturamento: 500,
  ...over,
});

describe("julgar", () => {
  it("dispara quando o valor fica abaixo do limiar", () => {
    expect(julgar(regra(), leitura(), HOJE).estourou).toBe(true);
  });

  it("não dispara dentro da faixa", () => {
    const v = julgar(regra(), leitura({ valor: 1.5 }), HOJE);
    expect(v.estourou).toBe(false);
    expect(v.motivo).toBe("dentro_da_faixa");
  });

  it("`maior` inverte a comparação", () => {
    const r = regra({ comparador: "maior", valor: "2" });
    expect(julgar(r, leitura({ valor: 3 }), HOJE).estourou).toBe(true);
    expect(julgar(r, leitura({ valor: 1 }), HOJE).estourou).toBe(false);
  });

  it("cala a boca quando já avisou hoje NESTE projeto", () => {
    const v = julgar(regra(), leitura(), HOJE, HOJE);
    expect(v.estourou).toBe(false);
    expect(v.motivo).toBe("ja_avisou_hoje");
  });

  it("volta a falar no dia seguinte", () => {
    expect(julgar(regra(), leitura(), HOJE, "2026-10-13").estourou).toBe(true);
  });

  it("regra global num projeto novo não herda o aviso de outro", () => {
    // O dedupe é por (regra, projeto): a mesma regra dispara em DG e em BBE no
    // mesmo dia. Guardar o dia na regra calaria o segundo.
    expect(julgar(regra({ projectId: null }), leitura(), HOJE, null).estourou).toBe(true);
  });

  it("o piso de gasto segura o alarme do começo do dia", () => {
    // R$ 12 gastos e ROAS zero é o estado normal das 8h — não é notícia.
    const v = julgar(regra({ gastoMinimo: "500" }), leitura({ valor: 0, gasto: 12 }), HOJE);
    expect(v.estourou).toBe(false);
    expect(v.motivo).toBe("gasto_abaixo_do_piso");
  });

  it("alcançado o piso, o mesmo caso dispara", () => {
    expect(
      julgar(regra({ gastoMinimo: "500" }), leitura({ valor: 0, gasto: 500 }), HOJE).estourou,
    ).toBe(true);
  });

  it("o piso é checado ANTES de faltar dado", () => {
    // Importa a ordem: projeto parado tem gasto 0 E valor nulo. O motivo certo
    // é o piso, senão a tela diz "sem dado" para quem só não investiu ainda.
    const v = julgar(regra({ gastoMinimo: "100" }), leitura({ valor: null, gasto: 0 }), HOJE);
    expect(v.motivo).toBe("gasto_abaixo_do_piso");
  });

  it("sem dado na janela não inventa alerta", () => {
    const v = julgar(regra(), leitura({ valor: null }), HOJE);
    expect(v.estourou).toBe(false);
    expect(v.motivo).toBe("sem_dado");
  });

  describe("investiu e não vendeu", () => {
    const r = regra({ metrica: "investiu_sem_vender", valor: "300" });

    it("dispara com gasto no limiar e faturamento zero", () => {
      expect(julgar(r, leitura({ valor: 0, gasto: 300, faturamento: 0 }), HOJE).estourou).toBe(true);
    });

    it("UMA venda já basta para calar", () => {
      // O alerta é sobre o silêncio total, não sobre venda fraca — para isso
      // existe o ROAS.
      expect(julgar(r, leitura({ valor: 1, gasto: 5000, faturamento: 1 }), HOJE).estourou).toBe(
        false,
      );
    });

    it("gasto abaixo do limiar não é notícia", () => {
      expect(julgar(r, leitura({ valor: 0, gasto: 299, faturamento: 0 }), HOJE).estourou).toBe(
        false,
      );
    });
  });
});

describe("textoDoAlerta", () => {
  it("connect rate vira porcentagem com o alvo junto", () => {
    const t = textoDoAlerta(
      regra({ metrica: "connect_rate", valor: "0.6" }),
      leitura({ valor: 0.412, gasto: 1234 }),
      "DG & CPDF",
    );
    expect(t.titulo).toBe("DG & CPDF: connect rate em 41,2%");
    expect(t.corpo).toContain("Abaixo de 60%");
    expect(t.corpo).toContain("hoje");
  });

  it("ROAS mostra os dois lados da conta", () => {
    const t = textoDoAlerta(
      regra({ janelaDias: 7 }),
      leitura({ valor: 0.83, gasto: 28993, faturamento: 24000 }),
      "BBE",
    );
    expect(t.titulo).toBe("BBE: ROAS em 0,83");
    expect(t.corpo).toContain("nos últimos 7 dias");
  });

  it("ROAS de um dia fala em dia FECHADO, não em hoje", () => {
    // A série de vendas não tem o dia corrente: dizer "hoje" mandaria a pessoa
    // procurar na tela um número que ainda não existe.
    const t = textoDoAlerta(regra(), leitura({ valor: 0.5, gasto: 1000 }), "PP");
    expect(t.corpo).toContain("no último dia fechado");
    expect(t.corpo).not.toContain("hoje");
  });

  it("investiu e não vendeu fala do gasto, não do zero", () => {
    const t = textoDoAlerta(
      regra({ metrica: "investiu_sem_vender", valor: "300" }),
      leitura({ valor: 0, gasto: 1500, faturamento: 0 }),
      "PP",
    );
    expect(t.titulo).toContain("sem venda");
    expect(t.titulo).toContain("PP");
  });
});

const item = (over: Partial<ItemDeFunil> = {}): ItemDeFunil => ({
  chave: "f1",
  nome: "dg-pg05-out-26",
  gasto: 1000,
  lpViews: 400,
  linkClicks: 1000,
  faturamento: 500,
  ...over,
});

describe("leituraDoItem", () => {
  it("ROAS é faturamento sobre gasto do PRÓPRIO funil", () => {
    const l = leituraDoItem("roas", item({ gasto: 1776, faturamento: 5818 }));
    expect(l.valor).toBeCloseTo(3.276, 3);
  });

  it("funil que faturou sem mídia atribuída não tem ROAS — e não tem ROAS zero", () => {
    // Zero diria "a mídia foi um desastre"; o certo é "não há o que dividir".
    expect(leituraDoItem("roas", item({ gasto: 0, faturamento: 670 })).valor).toBeNull();
  });

  it("connect rate sem clique no link é ausência, não 0%", () => {
    expect(leituraDoItem("connect_rate", item({ linkClicks: 0, lpViews: 0 })).valor).toBeNull();
  });

  it("connect rate é lp_views sobre link_clicks", () => {
    const l = leituraDoItem("connect_rate", item({ lpViews: 412, linkClicks: 1000 }));
    expect(l.valor).toBeCloseTo(0.412, 3);
    expect(l.faturamento).toBeNull();
  });

  it("investiu e não vendeu julga o faturamento do funil", () => {
    const l = leituraDoItem("investiu_sem_vender", item({ gasto: 516, faturamento: 0 }));
    expect(l.valor).toBe(0);
    expect(l.gasto).toBe(516);
  });

  it("o gasto sem funil atravessa como qualquer outro item", () => {
    // Campanha que nenhuma etapa reivindica não pode ficar fora da rede.
    const l = leituraDoItem("roas", item({ chave: "", gasto: 200, faturamento: 0 }));
    expect(l.valor).toBe(0);
  });
});

describe("textoDoAlerta fala do funil, com o projeto ao lado", () => {
  it("o título é o funil e o corpo começa pelo projeto", () => {
    const t = textoDoAlerta(
      regra({ metrica: "investiu_sem_vender", valor: "300" }),
      leitura({ valor: 0, gasto: 516, faturamento: 0 }),
      "dg-bf26",
      "DG & CPDF",
    );
    // `\s` e não um espaço: o `toLocaleString` de pt-BR separa a moeda com
    // espaço não separável, e a comparação literal falharia sem aparecer por quê.
    expect(t.titulo).toMatch(/^dg-bf26: R\$\s516 sem venda$/);
    expect(t.corpo.startsWith("DG & CPDF · ")).toBe(true);
  });

  it("sem projeto não sobra separador solto no corpo", () => {
    const t = textoDoAlerta(regra(), leitura(), "DG & CPDF (sem funil)");
    expect(t.corpo).not.toContain("·");
  });
});

describe("o dia é o de São Paulo", () => {
  it("1h UTC ainda é o dia anterior aqui", () => {
    // O container roda em UTC. Sem a conversão, o dedupe viraria às 21h e o
    // alerta repetiria no mesmo dia de trabalho.
    expect(hojeSaoPaulo(new Date("2026-10-15T01:00:00Z"))).toBe("2026-10-14");
    expect(horaSaoPaulo(new Date("2026-10-15T01:00:00Z"))).toBe(22);
  });

  it("meio-dia UTC é o mesmo dia", () => {
    expect(hojeSaoPaulo(new Date("2026-10-14T12:00:00Z"))).toBe("2026-10-14");
    expect(horaSaoPaulo(new Date("2026-10-14T12:00:00Z"))).toBe(9);
  });
});

describe("antesDe", () => {
  /**
   * A janela das métricas de faturamento é ancorada no último dia FECHADO da
   * série de vendas — o dia corrente nunca está lá — e é esta conta que acha
   * o começo dela.
   */
  it("anda para trás dentro do mês", () => {
    expect(antesDe("2026-10-13", 6)).toBe("2026-10-07");
  });

  it("atravessa a virada do mês", () => {
    expect(antesDe("2026-10-03", 6)).toBe("2026-09-27");
  });

  it("atravessa a virada do ano", () => {
    expect(antesDe("2026-01-02", 7)).toBe("2025-12-26");
  });

  it("não escorrega por causa do fuso", () => {
    // Datar ao meio-dia UTC é o que impede o -3 de São Paulo de jogar o
    // resultado para o dia anterior.
    expect(antesDe("2026-03-01", 1)).toBe("2026-02-28");
    expect(antesDe("2026-10-13", 0)).toBe("2026-10-13");
  });
});
