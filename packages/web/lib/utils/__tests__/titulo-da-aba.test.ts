/**
 * O nome da aba.
 *
 * O que estes testes protegem é a precedência: as rotas de projeto são as mais
 * profundas do app, e um prefixo genérico casando antes faria toda tela dentro
 * de uma empresa se chamar "Empresas" — que é o mesmo problema de todas se
 * chamarem "Loyola X".
 */

import { describe, expect, it } from "vitest";
import { nomeDaRota, tituloDaAba } from "../titulo-da-aba";

describe("nomeDaRota", () => {
  it("acha a tela pelo caminho", () => {
    expect(nomeDaRota("/bi")).toBe("BI");
    expect(nomeDaRota("/swipe-files")).toBe("Swipe Files");
    expect(nomeDaRota("/planner")).toBe("Calendário");
  });

  it("vale também para o que está dentro da tela", () => {
    expect(nomeDaRota("/bi/dashboards/abc")).toBe("BI");
  });

  it("a rota profunda ganha do prefixo genérico", () => {
    // Sem isto tudo dentro de `/projects/...` viraria "Empresas".
    expect(nomeDaRota("/projects/1/funnels/2")).toBe("Funil");
    expect(nomeDaRota("/projects/1/funnels/2/campaign-log")).toBe("Log de campanha");
    expect(nomeDaRota("/projects/1/instagram")).toBe("Instagram");
  });

  it("a empresa sozinha continua sendo Empresas", () => {
    expect(nomeDaRota("/projects/1")).toBe("Empresas");
  });

  it("não confunde prefixo com começo de outra palavra", () => {
    // `/tasks` não pode casar com `/task-force`, nem `/bi` com `/big-algo`.
    expect(nomeDaRota("/big-numbers")).toBeNull();
    expect(nomeDaRota("/tasksomething")).toBeNull();
  });

  it("devolve null quando não há nome melhor", () => {
    expect(nomeDaRota("/")).toBeNull();
    expect(nomeDaRota("/rota-que-nao-existe")).toBeNull();
  });
});

describe("tituloDaAba", () => {
  it("usa o template do app", () => {
    expect(tituloDaAba("/bi")).toBe("BI | Loyola X");
  });

  it("o contexto vem primeiro — é o que distingue duas abas iguais", () => {
    expect(tituloDaAba("/projects/1/funnels/2", "FZ BLACK")).toBe("FZ BLACK · Funil | Loyola X");
  });

  it("contexto sem rota conhecida ainda nomeia a aba", () => {
    expect(tituloDaAba("/", "Alguma coisa")).toBe("Alguma coisa | Loyola X");
  });

  it("sem nada, fica o nome do produto", () => {
    expect(tituloDaAba("/")).toBe("Loyola X");
  });

  it("contexto em branco não vira separador solto", () => {
    // `"  · BI | Loyola X"` seria o resultado de não aparar antes.
    expect(tituloDaAba("/bi", "   ")).toBe("BI | Loyola X");
    expect(tituloDaAba("/bi", null)).toBe("BI | Loyola X");
  });
});

describe("etapa dentro do funil", () => {
  it("a etapa ganha do funil", () => {
    // `/funnels/x/stages/y` não é a tela do funil: sem esta ordem, abrir uma
    // etapa mostraria "Funil" na aba.
    expect(nomeDaRota("/projects/1/funnels/2/stages/3")).toBe("Etapa");
  });

  it("o log continua ganhando de todos", () => {
    expect(nomeDaRota("/projects/1/funnels/2/campaign-log")).toBe("Log de campanha");
  });

  it("o contexto junta funil e etapa", () => {
    // "Vendas" sozinho se repete em todo funil; o que separa as abas é o funil
    // na frente.
    expect(tituloDaAba("/projects/1/funnels/2/stages/3", "bbe-fh · Vendas")).toBe(
      "bbe-fh · Vendas · Etapa | Loyola X",
    );
  });
});
