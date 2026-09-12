import { describe, expect, it } from "vitest";
import { montarDiario, totaisDoDiario } from "../sendflow-diario";

const serie = (pares: [string, number][]) => ({
  porDia: pares.map(([date, valor]) => ({ date, valor })),
});
const vazia = { porDia: [] };

describe("montarDiario", () => {
  it("junta as três séries na mesma linha do dia", () => {
    const linhas = montarDiario(
      serie([["2026-09-11", 16]]),
      serie([["2026-09-11", 2]]),
      serie([["2026-09-11", 30]]),
      [],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      date: "2026-09-11",
      entrou: 16,
      saiu: 2,
      cliques: 30,
      saldo: 14,
    });
  });

  it("mantém o dia que só tem saída", () => {
    // Partir da série de entradas faria este dia desaparecer da tabela — e um
    // dia de esvaziamento é justamente o que se quer ver.
    const linhas = montarDiario(vazia, serie([["2026-09-10", 5]]), vazia, []);
    expect(linhas[0]).toMatchObject({
      date: "2026-09-10",
      entrou: 0,
      saiu: 5,
      saldo: -5,
    });
  });

  it("mantém o dia que só teve disparo", () => {
    // A mensagem saiu e ninguém entrou. É informação, não ausência de dado.
    const linhas = montarDiario(vazia, vazia, vazia, [
      { quando: "2026-09-12T09:30:00Z" },
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      date: "2026-09-12",
      disparos: 1,
      entrou: 0,
      saiu: 0,
    });
  });

  it("conta vários disparos no mesmo dia", () => {
    const linhas = montarDiario(vazia, vazia, vazia, [
      { quando: "2026-09-12T09:00:00Z" },
      { quando: "2026-09-12T18:00:00Z" },
      { quando: "2026-09-11T10:00:00Z" },
    ]);
    expect(linhas.find((l) => l.date === "2026-09-12")!.disparos).toBe(2);
    expect(linhas.find((l) => l.date === "2026-09-11")!.disparos).toBe(1);
  });

  it("ignora disparo sem data", () => {
    // É o agendado que nunca rodou: não pertence a dia nenhum, e jogá-lo em
    // "hoje" inventaria atividade que não houve.
    const linhas = montarDiario(vazia, vazia, vazia, [{ quando: null }]);
    expect(linhas).toHaveLength(0);
  });

  it("ordena do mais recente para o mais antigo", () => {
    const linhas = montarDiario(
      serie([
        ["2026-09-01", 3],
        ["2026-09-12", 2],
        ["2026-09-10", 4],
      ]),
      vazia,
      vazia,
      [],
    );
    expect(linhas.map((l) => l.date)).toEqual([
      "2026-09-12",
      "2026-09-10",
      "2026-09-01",
    ]);
  });

  it("saldo negativo aparece como negativo", () => {
    const linhas = montarDiario(
      serie([["2026-09-11", 1]]),
      serie([["2026-09-11", 9]]),
      vazia,
      [],
    );
    expect(linhas[0]!.saldo).toBe(-8);
  });

  it("aguenta série ausente e ponto sem data", () => {
    const linhas = montarDiario(
      { porDia: [{ date: "", valor: 5 }] } as never,
      undefined as never,
      vazia,
      undefined as never,
    );
    expect(linhas).toHaveLength(0);
  });

  it("soma o mesmo dia repetido na série", () => {
    // O SendFlow manda uma chave por dia, mas somar é mais seguro que
    // sobrescrever: se um dia vier duas vezes, perder metade é pior.
    const linhas = montarDiario(
      serie([
        ["2026-09-11", 4],
        ["2026-09-11", 6],
      ]),
      vazia,
      vazia,
      [],
    );
    expect(linhas[0]!.entrou).toBe(10);
  });
});

describe("totaisDoDiario", () => {
  it("soma as colunas", () => {
    const linhas = montarDiario(
      serie([
        ["2026-09-11", 16],
        ["2026-09-10", 4],
      ]),
      serie([["2026-09-11", 2]]),
      serie([["2026-09-11", 50]]),
      [{ quando: "2026-09-11T09:00:00Z" }],
    );
    expect(totaisDoDiario(linhas)).toEqual({
      entrou: 20,
      saiu: 2,
      cliques: 50,
      disparos: 1,
    });
  });

  it("tudo zero em lista vazia", () => {
    expect(totaisDoDiario([])).toEqual({
      entrou: 0,
      saiu: 0,
      cliques: 0,
      disparos: 0,
    });
  });
});
