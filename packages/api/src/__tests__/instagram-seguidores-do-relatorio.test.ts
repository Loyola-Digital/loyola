import { describe, expect, it } from "vitest";
import { montarSeguidores } from "../routes/instagram-reports.js";

/**
 * O relatório de um mês fechado exibia o total de seguidores de HOJE sob o
 * rótulo "Total ao fim do mês" — então o relatório de outubro mostrava o número
 * de novembro. Social Media perguntou se dava para "puxar esse número de outra
 * forma"; dá: o que a Meta entrega certo é o ganho/perda do PERÍODO, e o total
 * histórico simplesmente não existe na API.
 */

const AGORA = new Date("2026-11-24T12:00:00.000Z");

describe("montarSeguidores", () => {
  it("mês corrente: o total de agora É o total do mês, e o início sai por subtração", () => {
    const r = montarSeguidores({
      month: "2026-11",
      totalMedido: 154_340,
      gained: 1_200,
      lost: 200,
      follows: [10, 20],
      agora: AGORA,
    });
    expect(r.endOfMonth).toBe(154_340);
    expect(r.net).toBe(1_000);
    expect(r.startOfMonth).toBe(153_340);
  });

  // O ponto do conserto: em mês fechado o total de hoje não pode posar de
  // "fim do mês".
  it("mês fechado: não finge saber o total do fechamento", () => {
    const r = montarSeguidores({
      month: "2026-10",
      totalMedido: 154_340,
      gained: 900,
      lost: 100,
      follows: [],
      agora: AGORA,
    });
    expect(r.endOfMonth).toBeNull();
    expect(r.startOfMonth).toBeNull();
    // mas o número medido continua disponível, com a data em que foi medido
    expect(r.totalMedido).toBe(154_340);
    expect(r.totalMedidoEm).toBe(AGORA.toISOString());
    // e o saldo do período segue valendo: esse a Meta dá certo
    expect(r.net).toBe(800);
  });

  it("soma os follows dos posts, ignorando os que não têm o dado", () => {
    const r = montarSeguidores({
      month: "2026-10",
      totalMedido: null,
      gained: 0,
      lost: 0,
      follows: [12, null, 8, null, 1],
      agora: AGORA,
    });
    expect(r.ganhosPorPost).toBe(21);
  });

  // `null` é "nenhum post tinha o dado"; 0 seria "os posts não trouxeram
  // ninguém" — conclusões diferentes.
  it("sem nenhum dado de follows, devolve null e não zero", () => {
    const r = montarSeguidores({
      month: "2026-10",
      totalMedido: null,
      gained: 0,
      lost: 0,
      follows: [null, null],
      agora: AGORA,
    });
    expect(r.ganhosPorPost).toBeNull();
  });

  it("zero de verdade é zero", () => {
    const r = montarSeguidores({
      month: "2026-10",
      totalMedido: null,
      gained: 0,
      lost: 0,
      follows: [0, 0],
      agora: AGORA,
    });
    expect(r.ganhosPorPost).toBe(0);
  });

  it("sem total medido, não inventa data de medição", () => {
    const r = montarSeguidores({
      month: "2026-11",
      totalMedido: null,
      gained: 5,
      lost: 1,
      follows: [],
      agora: AGORA,
    });
    expect(r.endOfMonth).toBeNull();
    expect(r.startOfMonth).toBeNull();
    expect(r.totalMedidoEm).toBeNull();
    expect(r.net).toBe(4);
  });
});
