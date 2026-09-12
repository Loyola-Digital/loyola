import { describe, expect, it } from "vitest";
import {
  alvoDoFunil,
  casarCampanha,
  tokenDoFunil,
} from "../services/sendflow-casamento.js";

const c = (name: string) => ({ name });

describe("tokenDoFunil", () => {
  it("pega produto e edição, descarta mês e ano", () => {
    expect(tokenDoFunil("fz-m3-set-26")).toBe("fz-m3");
    expect(tokenDoFunil("dg-pg02-abr-26")).toBe("dg-pg02");
  });

  it("nome sem hífen volta inteiro", () => {
    expect(tokenDoFunil("Perpetuo")).toBe("Perpetuo");
  });
});

describe("alvoDoFunil", () => {
  it("normaliza o token — é o que faz FZM3 casar com fz-m3", () => {
    expect(alvoDoFunil("fz-m3-set-26", null)).toBe("fzm3");
  });

  it("o matchCode manda quando existe", () => {
    // O override para quando o nome no SendFlow não tem relação nenhuma com o
    // do funil, e nenhuma normalização salvaria.
    expect(alvoDoFunil("fz-m3-set-26", "Black Friday")).toBe("blackfriday");
  });

  it("matchCode vazio ou só espaço não conta como override", () => {
    expect(alvoDoFunil("fz-m3-set-26", "   ")).toBe("fzm3");
    expect(alvoDoFunil("fz-m3-set-26", "")).toBe("fzm3");
  });
});

describe("casarCampanha", () => {
  it("acha FZM3 para o funil fz-m3-set-26 — o caso relatado", () => {
    // Antes: "fzm3".includes("fz-m3") é falso, e a tela dizia "nenhuma
    // campanha encontrada" sem mencionar que a causa era um hífen.
    const achada = casarCampanha([c("Outra"), c("FZM3")], "fz-m3-set-26", null);
    expect(achada?.name).toBe("FZM3");
  });

  it("acha a campanha com hífen a partir do funil com hífen", () => {
    expect(
      casarCampanha([c("FZ M3 Setembro")], "fz-m3-set-26", null)?.name,
    ).toBe("FZ M3 Setembro");
    expect(casarCampanha([c("fz-m3")], "fz-m3-set-26", null)?.name).toBe(
      "fz-m3",
    );
  });

  it("o limite conhecido: o token é cortado ANTES de normalizar", () => {
    /*
     * Um funil chamado `fzm3-set-26` (sem hífen no produto) gera o token
     * `fzm3-set` — os dois primeiros segmentos —, que normalizado é `fzm3set`
     * e não casa com `FZM3`.
     *
     * Fica registrado em vez de corrigido: o corte por segmento é o que
     * descarta mês e ano, e adivinhar onde termina o produto num nome sem
     * separador exigiria conhecer a lista de produtos. Quem nomear o funil
     * assim usa o `matchCode`, que existe para isto.
     */
    expect(casarCampanha([c("FZM3")], "fzm3-set-26", null)).toBeNull();
    expect(casarCampanha([c("FZM3")], "fzm3-set-26", "FZM3")?.name).toBe(
      "FZM3",
    );
  });

  it("ignora acento e caixa", () => {
    expect(
      casarCampanha([c("LANÇAMENTO")], "lancamento-x", "lancamento")?.name,
    ).toBe("LANÇAMENTO");
  });

  it("prefere o exato ao parcial", () => {
    // `fzm3` está contido em `fzm30`. Sem a passada exata, a ordem da lista
    // decidiria — e entregaria a campanha do funil vizinho.
    const campanhas = [c("FZM30"), c("FZM3")];
    expect(casarCampanha(campanhas, "fz-m3-set-26", null)?.name).toBe("FZM3");
  });

  it("cai no parcial quando não há exato", () => {
    expect(
      casarCampanha([c("FZM3 - Setembro 2026")], "fz-m3-set-26", null)?.name,
    ).toBe("FZM3 - Setembro 2026");
  });

  it("devolve null quando nada casa", () => {
    expect(casarCampanha([c("BBE")], "fz-m3-set-26", null)).toBeNull();
    expect(casarCampanha([], "fz-m3-set-26", null)).toBeNull();
  });

  it("campanha sem nome não quebra nem casa por acidente", () => {
    // Chave vazia contém qualquer coisa? Não — é o contrário, e sem a guarda
    // um `name: null` casaria com todo funil.
    expect(casarCampanha([{ name: null }], "fz-m3-set-26", null)).toBeNull();
  });

  it("funil sem nome nem matchCode não casa com o primeiro da lista", () => {
    expect(casarCampanha([c("FZM3")], "", null)).toBeNull();
  });
});
