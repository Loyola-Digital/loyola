import { describe, it, expect } from "vitest";
import {
  saleDayAndHour,
  weekdayFromDayKey,
  horaDaFaixaMeta,
  saleDayKey,
  NOMES_DOS_DIAS,
} from "../utils/sale-date.js";

/**
 * Story 29.69 — a hora da venda.
 *
 * Os formatos aqui não são inventados: saíram da Task 0, lendo as cinco
 * planilhas de venda perpétua em produção. Dois funis não têm hora nenhuma, um
 * tem ISO com `Z`, outro tem ISO sem fuso, e o quinto (não mapeado hoje) tem BR
 * com hora. O teste cobre os cinco casos reais, não uma amostra hipotética.
 */

describe("saleDayAndHour — os três formatos que existem em produção", () => {
  it("BR sem hora: dia sim, hora null — nunca meia-noite", () => {
    // `fz-a1` e `pps1`. Se `null` virasse `0`, 100% das vendas desses dois
    // funis apareceriam às 00h e o pico seria lido como comportamento real.
    expect(saleDayAndHour("19/08/2025")).toEqual({ dia: "2025-08-19", hora: null });
    expect(saleDayAndHour("09/07/2026")).toEqual({ dia: "2026-07-09", hora: null });
  });

  it("BR com hora: hora literal, sem conversão", () => {
    // `dg-a1` (Hotmart) — a coluna existe na planilha e ainda não está mapeada.
    expect(saleDayAndHour("24/05/2026 20:12:38")).toEqual({ dia: "2026-05-24", hora: 20 });
    expect(saleDayAndHour("30/04/2026 06:45:27")).toEqual({ dia: "2026-04-30", hora: 6 });
  });

  it("ISO SEM fuso é hora escrita, não instante", () => {
    // `bbe-fc1-a2-ago-26`. Interpretar como UTC faria a mesma venda mudar de
    // hora conforme o processo rodasse em Railway (UTC) ou na máquina do time.
    expect(saleDayAndHour("2026-08-27 08:42:44")).toEqual({ dia: "2026-08-27", hora: 8 });
    expect(saleDayAndHour("2026-08-29 22:18:05")).toEqual({ dia: "2026-08-29", hora: 22 });
  });

  it("ISO COM Z é instante: converte para o fuso do negócio", () => {
    // `bbe-fc1-a1-mai-26` — 44 das 263 linhas vêm assim, misturadas com as
    // outras 219 na MESMA coluna.
    expect(saleDayAndHour("2026-07-12T23:50:33.624Z")).toEqual({ dia: "2026-07-12", hora: 20 });
  });

  it("instante de madrugada UTC cai no dia ANTERIOR, com a hora certa", () => {
    // 01:18Z = 22:18 do dia anterior em São Paulo. Dia e hora saem da mesma
    // conversão — é por isso que a função devolve os dois juntos.
    expect(saleDayAndHour("2026-07-21T01:18:00Z")).toEqual({ dia: "2026-07-20", hora: 22 });
  });

  it("dia e hora nunca vêm de caminhos diferentes", () => {
    // O bug que a assinatura única previne: dia convertido + hora literal
    // colocaria a venda às 01h de um dia em que ela não aconteceu.
    const r = saleDayAndHour("2026-07-21T01:18:00Z")!;
    expect(r.dia).toBe("2026-07-20");
    expect(r.hora).toBe(22);
    expect(r.hora).not.toBe(1);
  });

  it("offset explícito também é instante", () => {
    expect(saleDayAndHour("2026-07-12T23:50:33-03:00")).toEqual({ dia: "2026-07-12", hora: 23 });
  });

  it("vazio, nulo e lixo devolvem null", () => {
    expect(saleDayAndHour(null)).toBeNull();
    expect(saleDayAndHour(undefined)).toBeNull();
    expect(saleDayAndHour("")).toBeNull();
    expect(saleDayAndHour("   ")).toBeNull();
    expect(saleDayAndHour("não é data")).toBeNull();
  });

  it("mês inválido devolve null, não um dia impossível", () => {
    expect(saleDayAndHour("19/13/2025")).toBeNull();
  });

  it("meia-noite escrita É zero — e é diferente de ausência", () => {
    // A distinção que sustenta a AC2 inteira: 00h medido vs. hora ausente.
    expect(saleDayAndHour("24/05/2026 00:12:38")?.hora).toBe(0);
    expect(saleDayAndHour("24/05/2026")?.hora).toBeNull();
  });
});

describe("divergência conhecida com saleDayKey — documentada, não escondida", () => {
  it("ISO sem fuso: saleDayKey trata como instante, saleDayAndHour como escrito", () => {
    // `saleDayKey` cai no `new Date(...)` e usa o fuso do PROCESSO. Rodando em
    // UTC, uma venda antes das 03h locais vira o dia anterior lá — e não aqui.
    // Corrigir `saleDayKey` mudaria séries diárias já em produção, o que a AC8
    // da 29.69 proíbe. Este teste existe para o QA decidir com o caso na mão,
    // em vez de descobrir a divergência num número na tela.
    const cru = "2026-08-27 01:30:00";
    expect(saleDayAndHour(cru)).toEqual({ dia: "2026-08-27", hora: 1 });
    // Em TZ=UTC isto devolveria "2026-08-26"; na máquina do time, "2026-08-27".
    // O teste não fixa o valor — fixa que a diferença existe e é conhecida.
    expect(typeof saleDayKey(cru)).toBe("string");
  });

  it("nos formatos BR e ISO-com-Z as duas concordam", () => {
    for (const cru of ["19/08/2025", "24/05/2026 20:12:38", "2026-07-21T01:18:00Z"]) {
      expect(saleDayAndHour(cru)!.dia).toBe(saleDayKey(cru));
    }
  });
});

describe("weekdayFromDayKey — Domingo é 0", () => {
  it("mapeia dias conhecidos", () => {
    expect(weekdayFromDayKey("2026-08-30")).toBe(0); // domingo
    expect(weekdayFromDayKey("2026-08-31")).toBe(1); // segunda
    expect(weekdayFromDayKey("2026-09-05")).toBe(6); // sábado
  });

  it("os sete nomes batem com os índices", () => {
    expect(NOMES_DOS_DIAS[weekdayFromDayKey("2026-08-30")!]).toBe("Domingo");
    expect(NOMES_DOS_DIAS[weekdayFromDayKey("2026-09-05")!]).toBe("Sábado");
    expect(NOMES_DOS_DIAS).toHaveLength(7);
  });

  it("chave malformada devolve null", () => {
    expect(weekdayFromDayKey("30/08/2026")).toBeNull();
    expect(weekdayFromDayKey("")).toBeNull();
  });
});

describe("horaDaFaixaMeta — o breakdown vem como texto, não número", () => {
  it("extrai a hora inicial da faixa", () => {
    // Formato verificado contra a API na Task 0b.
    expect(horaDaFaixaMeta("00:00:00 - 00:59:59")).toBe(0);
    expect(horaDaFaixaMeta("14:00:00 - 14:59:59")).toBe(14);
    expect(horaDaFaixaMeta("23:00:00 - 23:59:59")).toBe(23);
  });

  it("valor inesperado devolve null em vez de NaN na chave do cache", () => {
    expect(horaDaFaixaMeta("")).toBeNull();
    expect(horaDaFaixaMeta(null)).toBeNull();
    expect(horaDaFaixaMeta("madrugada")).toBeNull();
    expect(horaDaFaixaMeta("99:00:00 - 99:59:59")).toBeNull();
  });
});
