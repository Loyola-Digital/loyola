/**
 * A mesma campanha vinculada em mais de um funil.
 *
 * Este teste nasce de um caso de produção: a campanha
 * `bbe-a2-ago-26--venda-perpetuo--hot_cbo_vencedores` estava selecionada tanto
 * no `bbe-fc1-a1-mai-26` quanto no `bbe-fc1-a2-ago-26`. O índice era um mapa
 * `campanha → funil`, o segundo vínculo era ignorado, e o log inteiro do A2
 * caía no A1 — 2.076 entradas de um lado, zero do outro.
 *
 * O que resolve é a evidência que já existia e era ignorada: o A2 tem
 * `matchCode` `bbe-a2`, que está no nome da campanha.
 */

import { describe, expect, it } from "vitest";
import { desempatarPorNome } from "../services/meta-activity-log-sync.js";

const A1 = "funil-a1";
const A2 = "funil-a2";

/** Os códigos como estão em produção: o A1 sem `matchCode`, o A2 com. */
const CODIGOS = [
  { funnelId: A1, code: "bbe-fc1-a1-mai-26" },
  { funnelId: A2, code: "bbe-a2" },
];

const CAMPANHA_REAL = "bbe-a2-ago-26--venda-perpetuo--hot_cbo_vencedores";

describe("desempatarPorNome", () => {
  it("o caso de produção: a campanha do A2 vai para o A2", () => {
    // A ordem dos candidatos põe o A1 primeiro de propósito — é a ordem que
    // fazia o código antigo escolher errado.
    expect(desempatarPorNome(CAMPANHA_REAL, [A1, A2], CODIGOS)).toBe(A2);
  });

  it("a ordem dos candidatos não decide nada quando há evidência", () => {
    expect(desempatarPorNome(CAMPANHA_REAL, [A2, A1], CODIGOS)).toBe(A2);
  });

  it("um candidato só passa direto, sem consultar código", () => {
    expect(desempatarPorNome(CAMPANHA_REAL, [A1], CODIGOS)).toBe(A1);
    // Inclusive quando o nome contradiz: se só um funil reivindica a campanha,
    // não há disputa para resolver.
    expect(desempatarPorNome("nome-que-nao-casa-com-nada", [A1], CODIGOS)).toBe(A1);
  });

  it("o código MAIS LONGO vence, porque é o mais específico", () => {
    const codigos = [
      { funnelId: "curto", code: "fz-a1" },
      { funnelId: "longo", code: "fz-a1-jul26" },
    ];
    expect(desempatarPorNome("fz-a1-jul26--vendas", ["curto", "longo"], codigos)).toBe("longo");
  });

  it("nenhum código casando mantém o primeiro — estável entre execuções", () => {
    // Alternar o destino a cada sync espalharia o mesmo dia por dois funis.
    expect(desempatarPorNome("campanha-sem-codigo", [A1, A2], CODIGOS)).toBe(A1);
  });

  it("empate de comprimento mantém o primeiro, sem par ou ímpar", () => {
    const codigos = [
      { funnelId: "x", code: "aa-01" },
      { funnelId: "y", code: "bb-02" },
    ];
    expect(desempatarPorNome("aa-01 e bb-02 juntos", ["x", "y"], codigos)).toBe("x");
  });

  it("campanha sem nome mantém o primeiro", () => {
    // Sem nome não há como comparar com código nenhum.
    expect(desempatarPorNome(null, [A1, A2], CODIGOS)).toBe(A1);
    expect(desempatarPorNome("", [A1, A2], CODIGOS)).toBe(A1);
  });

  it("sem candidato nenhum, devolve null em vez de inventar funil", () => {
    expect(desempatarPorNome(CAMPANHA_REAL, [], CODIGOS)).toBeNull();
  });

  it("compara sem caixa", () => {
    expect(desempatarPorNome("BBE-A2-AGO-26--VENDA", [A1, A2], CODIGOS)).toBe(A2);
  });
});
