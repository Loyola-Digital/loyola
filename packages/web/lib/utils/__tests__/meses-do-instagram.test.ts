import { describe, expect, it } from "vitest";
import {
  diferencaEntreMeses,
  limitesDoMes,
  mesesRecentes,
  rotuloDoMes,
} from "../meses-do-instagram";

const agora = new Date(2026, 8, 16, 10, 30); // 16/09/2026, horário local

describe("limitesDoMes", () => {
  it("mês fechado vai do dia 1 ao último dia", () => {
    const { since, until } = limitesDoMes("2026-08", agora);
    expect(new Date(since * 1000).getDate()).toBe(1);
    expect(new Date(since * 1000).getMonth()).toBe(7);
    expect(new Date(until * 1000).getDate()).toBe(31);
  });

  it("mês em curso termina AGORA, não no fim do mês", () => {
    // Pedir insights de dia que ainda não aconteceu faz a Meta recusar.
    const { until } = limitesDoMes("2026-09", agora);
    expect(until).toBe(Math.floor(agora.getTime() / 1000));
  });

  it("fevereiro de ano bissexto termina no dia 29", () => {
    expect(new Date(limitesDoMes("2024-02", agora).until * 1000).getDate()).toBe(29);
  });
});

describe("mesesRecentes", () => {
  it("do mais recente para o mais antigo, com o mês em curso marcado", () => {
    const m = mesesRecentes(3, agora);
    expect(m.map((x) => x.mes)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(m[0]!.parcial).toBe(true);
    expect(m[1]!.parcial).toBe(false);
  });

  it("atravessa a virada do ano", () => {
    const m = mesesRecentes(3, new Date(2026, 0, 10));
    expect(m.map((x) => x.mes)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

describe("rotuloDoMes", () => {
  it("nome do mês e ano curto", () => {
    expect(rotuloDoMes("2026-09")).toBe("Setembro/26");
  });
});

describe("diferencaEntreMeses", () => {
  it("contagem compara em %", () => {
    expect(diferencaEntreMeses(1_200_000, 1_000_000, "contagem")).toEqual({ valor: 20, unidade: "pct" });
  });

  it("taxa compara em pontos percentuais", () => {
    // 4,2% → 5,1%: "+21%" se confundiria com a própria taxa.
    expect(diferencaEntreMeses(5.1, 4.2, "taxa")).toEqual({ valor: 0.9, unidade: "pp" });
  });

  it("saldo compara em pessoas", () => {
    // De −932 para +7.040 não existe porcentagem que signifique algo.
    expect(diferencaEntreMeses(7040, -932, "saldo")).toEqual({ valor: 7972, unidade: "pessoas" });
  });

  it("base zero ou dado ausente vira traço", () => {
    expect(diferencaEntreMeses(10, 0, "contagem").valor).toBeNull();
    expect(diferencaEntreMeses(null, 10, "contagem").valor).toBeNull();
    expect(diferencaEntreMeses(10, null, "taxa")).toEqual({ valor: null, unidade: "pp" });
  });
});
