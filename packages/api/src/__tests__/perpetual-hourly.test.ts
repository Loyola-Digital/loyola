import { describe, it, expect } from "vitest";
import { horaDaFaixaMeta, weekdayFromDayKey, NOMES_DOS_DIAS } from "../utils/sale-date.js";

/**
 * Story 29.69 (continuação) — as regras da rota horária que dão para provar sem
 * banco e sem planilha.
 *
 * O agrupamento em si vive dentro do handler Fastify (com Google Sheets e
 * Postgres), então o que se testa aqui é o que decide se o gráfico está certo:
 * a montagem das 24 e das 7 posições, o descarte da linha sem hora, e a
 * dedup de comprador por posição.
 */

/** Espelho da montagem da rota: 24 posições, sempre todas. */
function bucketsDeHora() {
  return Array.from({ length: 24 }, () => ({ faturamento: 0, vendas: 0 }));
}

interface Venda {
  dia: string;
  hora: number | null;
  bruto: number;
  comprador: string;
}

/** Espelho do laço da rota (AC2/AC5). */
function agregarPorHora(vendas: Venda[]) {
  const buckets = bucketsDeHora();
  const vistos = new Set<string>();
  let comHora = 0;
  let semHora = 0;
  for (const v of vendas) {
    if (v.hora === null) {
      semHora += 1;
      continue;
    }
    comHora += 1;
    const b = buckets[v.hora];
    b.faturamento += v.bruto;
    const k = `${v.hora}|${v.comprador}`;
    if (!vistos.has(k)) {
      vistos.add(k);
      b.vendas += 1;
    }
  }
  return { buckets, comHora, semHora };
}

describe("as 24 posições existem sempre (AC5)", () => {
  it("hora sem venda é 0, não posição ausente", () => {
    const { buckets } = agregarPorHora([
      { dia: "2026-09-01", hora: 14, bruto: 100, comprador: "a@x.com" },
    ]);
    expect(buckets).toHaveLength(24);
    // A hora 3 não teve venda: o gráfico precisa da barra zerada, senão o eixo
    // pula de 2h para 4h e a leitura de "melhor hora" fica errada.
    expect(buckets[3]).toEqual({ faturamento: 0, vendas: 0 });
    expect(buckets[14].faturamento).toBe(100);
  });
});

describe("venda sem hora não vira meia-noite (AC2)", () => {
  it("linha sem hora fica FORA do corte por hora e é contada na cobertura", () => {
    // Três dos cinco funis perpétuos não têm hora na planilha (Task 0). Se
    // essas vendas caíssem na hora 0, o painel diria que a madrugada é o
    // melhor horário do funil.
    const r = agregarPorHora([
      { dia: "2026-09-01", hora: null, bruto: 500, comprador: "a@x.com" },
      { dia: "2026-09-01", hora: null, bruto: 300, comprador: "b@x.com" },
      { dia: "2026-09-01", hora: 9, bruto: 100, comprador: "c@x.com" },
    ]);
    expect(r.buckets[0].faturamento).toBe(0);
    expect(r.buckets[0].vendas).toBe(0);
    expect(r.semHora).toBe(2);
    expect(r.comHora).toBe(1);
  });
});

describe("vendas é COMPRADOR, não linha (AC5)", () => {
  it("order bump na mesma hora não vira uma venda a mais", () => {
    // O bump chega numa linha própria com o mesmo e-mail e a mesma hora.
    // Contá-lo dobraria o pico exatamente nas horas de maior conversão.
    const { buckets } = agregarPorHora([
      { dia: "2026-09-01", hora: 20, bruto: 397, comprador: "a@x.com" },
      { dia: "2026-09-01", hora: 20, bruto: 97, comprador: "a@x.com" },
    ]);
    expect(buckets[20].vendas).toBe(1);
    // O faturamento SOMA os dois — é o mesmo checkout, e o bump é receita.
    expect(buckets[20].faturamento).toBe(494);
  });

  it("o mesmo comprador em horas diferentes conta nas duas", () => {
    // Deliberado, e o mesmo precedente da série diária (29.53): "quantos
    // compradores nesta hora?" e "quantos no período?" são perguntas
    // diferentes, e por isso a soma das 24 não bate com o total.
    const { buckets } = agregarPorHora([
      { dia: "2026-09-01", hora: 9, bruto: 100, comprador: "a@x.com" },
      { dia: "2026-09-02", hora: 21, bruto: 100, comprador: "a@x.com" },
    ]);
    expect(buckets[9].vendas).toBe(1);
    expect(buckets[21].vendas).toBe(1);
  });
});

describe("dia da semana não depende da Meta horária (AC7)", () => {
  it("as 7 posições saem do dia, que toda planilha tem", () => {
    // 2026-09-01 é uma terça-feira.
    expect(weekdayFromDayKey("2026-09-01")).toBe(2);
    expect(NOMES_DOS_DIAS[2]).toBe("Terça");
    expect(NOMES_DOS_DIAS).toHaveLength(7);
    expect(NOMES_DOS_DIAS[0]).toBe("Domingo");
  });

  it("funciona para venda SEM hora — é o ponto da AC7", () => {
    // `fz-a1` e `pps1` não têm hora nenhuma na planilha. Os três painéis de dia
    // da semana têm que funcionar mesmo assim.
    const dia = "2026-09-06"; // domingo
    expect(weekdayFromDayKey(dia)).toBe(0);
  });
});

describe("a hora da Meta vem como faixa de texto (Task 0b)", () => {
  it("extrai a hora inicial da faixa", () => {
    expect(horaDaFaixaMeta("00:00:00 - 00:59:59")).toBe(0);
    expect(horaDaFaixaMeta("14:00:00 - 14:59:59")).toBe(14);
    expect(horaDaFaixaMeta("23:00:00 - 23:59:59")).toBe(23);
  });

  it("faixa que não parseia devolve null — a linha é DESCARTADA, não vira 0", () => {
    // `upsertHourlyInsights` descarta essas linhas. Se virassem hora 0, o lixo
    // do parser se empilharia à meia-noite e pareceria pico de madrugada.
    expect(horaDaFaixaMeta("")).toBeNull();
    expect(horaDaFaixaMeta(null)).toBeNull();
    expect(horaDaFaixaMeta("madrugada")).toBeNull();
    expect(horaDaFaixaMeta("99:00:00 - 99:59:59")).toBeNull();
  });
});
