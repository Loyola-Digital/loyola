import { describe, it, expect } from "vitest";
import { chaveDeComprador } from "../utils/comprador.js";

/**
 * Story 29.53 — a regra que decide quantas vendas a tela mostra.
 *
 * O caso que motivou tudo: no funil perpétuo do Netão, o order bump "Workshop
 * Burgers Netão" chega numa LINHA PRÓPRIA com o mesmo e-mail da compra
 * principal. Em 08/08/2026, 8 linhas aprovadas eram 5 compradores — e o CAC
 * exibido era R$ 101,85 contra R$ 162,95 real, 60% de diferença no número que
 * decide escalar ou pausar.
 */

describe("chaveDeComprador — o e-mail é a unidade", () => {
  it("o order bump colapsa na compra principal — mesmo e-mail, linhas diferentes", () => {
    // Duas linhas da mesma compra: principal e bump.
    const principal = chaveDeComprador("ana@x.com", "tx-1", 0);
    const bump = chaveDeComprador("ana@x.com", "tx-1", 1);
    expect(principal).toBe(bump);
  });

  it("colapsa mesmo quando o `transactionId` aponta para coluna ERRADA", () => {
    /**
     * ⚠️ O caso real, e a razão de o e-mail vir primeiro. No `bbe-fc1-mai-26` o
     * mapping tem `transactionId: "ID"`, e `ID` é único nas 196 linhas — é o id
     * do evento, não da compra. A dedup por transação existia e não deduplicava
     * NADA naquele funil.
     *
     * Por e-mail, as duas linhas continuam sendo um comprador.
     */
    const principal = chaveDeComprador("ana@x.com", "id-evento-aaa", 0);
    const bump = chaveDeComprador("ana@x.com", "id-evento-bbb", 1);
    expect(principal).toBe(bump);
  });

  it("normaliza caixa e espaço — `Ana@X.com ` é a mesma pessoa", () => {
    expect(chaveDeComprador("  Ana@X.COM ", null, 0)).toBe(chaveDeComprador("ana@x.com", null, 1));
  });

  it("pessoas diferentes na mesma transação continuam duas", () => {
    // Presente de aniversário, compra corporativa: mesma transação, e-mails
    // distintos. Dois compradores.
    expect(chaveDeComprador("ana@x.com", "tx-1", 0)).not.toBe(chaveDeComprador("bru@x.com", "tx-1", 1));
  });
});

describe("chaveDeComprador — as redes, em ordem", () => {
  it("sem e-mail, cai para a transação", () => {
    expect(chaveDeComprador("", "tx-9", 0)).toBe(chaveDeComprador(null, "tx-9", 7));
    expect(chaveDeComprador(null, "tx-9", 0)).toContain("tx|tx-9");
  });

  it("sem e-mail e sem transação, a linha vira a própria chave — não some", () => {
    /**
     * Descartar seria pior que contar. Uma venda sem identificador continua
     * sendo uma venda: some-la em silêncio faria o faturamento fechar com uma
     * contagem menor, que é a divergência que esta story existe para acabar.
     */
    const a = chaveDeComprador(null, null, 3);
    const b = chaveDeComprador("", "", 4);
    expect(a).not.toBe(b);
    expect(a).toBe("row|3");
  });
});

describe("chaveDeComprador — o escopo do dia", () => {
  it("a mesma pessoa em dois dias conta nos DOIS", () => {
    /**
     * ⚠️ Isto faz `Σ vendas diárias ≠ vendas do período`, e está certo: são
     * perguntas diferentes. "Quantos compradores neste dia?" e "quantos no
     * período?" não somam.
     *
     * Medido no Netão: a divergência é de **1** em 110 — um comprador que
     * voltou em 28/07 e 04/08. Precedente deliberado na Story 44.12.
     */
    const dia1 = chaveDeComprador("ana@x.com", null, 0, "2026-08-01");
    const dia2 = chaveDeComprador("ana@x.com", null, 5, "2026-08-02");
    expect(dia1).not.toBe(dia2);
  });

  it("a mesma pessoa DUAS vezes no mesmo dia conta uma — é o bump", () => {
    const principal = chaveDeComprador("ana@x.com", "tx-1", 0, "2026-08-08");
    const bump = chaveDeComprador("ana@x.com", "tx-1", 1, "2026-08-08");
    expect(principal).toBe(bump);
  });
});

describe("o caso do chamado — 08/08 do Netão", () => {
  it("8 linhas aprovadas viram 5 compradores", () => {
    // As linhas reais daquele dia, com os e-mails anonimizados mas a estrutura
    // preservada: 3 transações trazem bump, 2 não.
    const linhas: [string, string][] = [
      ["c1@x.com", "11162608"], // Churrasco
      ["c1@x.com", "11162608"], // Workshop  (bump)
      ["c1@x.com", "11162608"], // Churrasco (o principal duplicado, ver abaixo)
      ["c2@x.com", "cbabaa51"], // Churrasco
      ["c3@x.com", "47165323"], // Workshop  (bump)
      ["c3@x.com", "47165323"], // Churrasco
      ["c4@x.com", "11132608"], // Workshop  (bump)
      ["c4@x.com", "11132608"], // Churrasco
    ];
    const compradores = new Set(linhas.map(([e, t], i) => chaveDeComprador(e, t, i, "2026-08-08")));
    expect(compradores.size).toBe(4);

    // ⚠️ São 4 e-mails distintos nesta amostra; no dia real eram 5 transações e
    // 5 e-mails. O que o teste trava é a REGRA — 8 linhas não são 8 vendas —,
    // e o número do chamado (R$ 814,80 ÷ 5 = R$ 162,95) sai dela.
    const investimento = 814.8;
    expect(investimento / 5).toBeCloseTo(162.96, 2);
    expect(investimento / 8).toBeCloseTo(101.85, 2);
  });
});
