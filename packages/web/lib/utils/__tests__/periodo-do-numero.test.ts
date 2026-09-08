import { describe, it, expect } from "vitest";
import { periodoDoNumero, diaEMes } from "@/lib/utils/periodo-do-numero";

/**
 * Story 44.31 — a tela declara de que período é o número que mostra.
 *
 * O caso que motivou: `bbe-pr2-ago-26/Captação Paga` exibia CAC R$ 743,58 na
 * aba Cadeia de CAC e R$ 855,11 no Panorama, no mesmo dia. Os dois certos —
 * histórico inteiro contra 30 dias — e nenhuma das telas dizendo qual.
 *
 * ⚠️ Este arquivo mora em `lib/utils/__tests__` porque o `vitest.config` do web
 * só coleta `lib/utils/**\/*.test.ts`. Um `.test.tsx` de componente NUNCA roda:
 * o teste existiria sem nunca ter executado.
 */

describe("Story 44.31 — janela PEDIDA", () => {
  it("declara o intervalo pedido e a cobertura", () => {
    const r = periodoDoNumero({
      range: { from: "2026-09-01", to: "2026-09-07" },
      serie: { de: "2026-09-01", ate: "2026-09-07" },
      dias: 7,
    });
    expect(r.historico).toBe(false);
    expect(r.texto).toBe("01/09 a 07/09 · 7 dias com dado");
  });

  it("NÃO escreve 'todo o histórico' quando houve janela", () => {
    const r = periodoDoNumero({ range: { from: "2026-09-01", to: "2026-09-07" }, dias: 7 });
    expect(r.texto).not.toContain("histórico");
  });
});

describe("Story 44.31 AC2 — sem janela pedida, é o histórico e a tela diz", () => {
  it("marca 'Todo o histórico' e usa as datas da série", () => {
    // O caso real do `fz-a1`: seis meses de dados na aba, contra 90 dias na aba
    // Meta Ads ao lado — 2,4× no mesmo campo, com o mesmo rótulo.
    const r = periodoDoNumero({
      range: { from: null, to: null },
      serie: { de: "2026-03-13", ate: "2026-09-07" },
      dias: 179,
    });
    expect(r.historico).toBe(true);
    expect(r.texto).toBe("Todo o histórico · 13/03 a 07/09 · 179 dias com dado");
  });

  it("um `range` pela metade conta como não pedido", () => {
    // Meio range é ambiguidade; tratá-lo como janela produziria "01/09 a null".
    const r = periodoDoNumero({
      range: { from: "2026-09-01", to: null },
      serie: { de: "2026-03-13", ate: "2026-09-07" },
      dias: 179,
    });
    expect(r.historico).toBe(true);
    expect(r.texto).toContain("13/03 a 07/09");
  });
});

describe("Story 44.31 — o que NÃO se declara", () => {
  it("sem janela e sem série, não há texto — nada é inventado", () => {
    const r = periodoDoNumero({ range: { from: null, to: null } });
    expect(r.texto).toBeNull();
    expect(r.intervalo).toBeNull();
  });

  it("zero dias com dado não vira '0 dias com dado'", () => {
    // `0` ali afirmaria uma medição vazia; a ausência da frase é a resposta.
    const r = periodoDoNumero({
      range: { from: null, to: null },
      serie: { de: "2026-09-01", ate: "2026-09-07" },
      dias: 0,
    });
    expect(r.cobertura).toBeNull();
    expect(r.texto).toBe("Todo o histórico · 01/09 a 07/09");
  });

  it("dias ausente (não medido) também omite a cobertura", () => {
    const r = periodoDoNumero({
      range: { from: "2026-09-01", to: "2026-09-07" },
      dias: null,
    });
    expect(r.cobertura).toBeNull();
    expect(r.texto).toBe("01/09 a 07/09");
  });
});

describe("Story 44.31 — a cobertura é 'dias COM DADO', não dias de calendário", () => {
  /**
   * ⚠️ Um funil parado três semanas tem menos dias com dado que dias entre as
   * datas. Rotular só "dias" convidaria a dividir investimento por ele e achar
   * um diário que não existe.
   */
  it("o rótulo diz 'com dado' mesmo quando difere do vão das datas", () => {
    const r = periodoDoNumero({
      range: { from: null, to: null },
      serie: { de: "2026-08-01", ate: "2026-09-07" }, // 38 dias de calendário
      dias: 15, // e só 15 com campanha
    });
    expect(r.texto).toContain("15 dias com dado");
    expect(r.texto).toContain("01/08 a 07/09");
  });

  it("um dia só fica no singular", () => {
    const r = periodoDoNumero({
      range: { from: "2026-09-07", to: "2026-09-07" },
      dias: 1,
    });
    expect(r.texto).toBe("07/09 a 07/09 · 1 dia com dado");
  });
});

describe("diaEMes", () => {
  it("converte ISO para dd/mm", () => {
    expect(diaEMes("2026-03-13")).toBe("13/03");
  });

  it("devolve a entrada quando ela não é ISO — nunca 'undefined/undefined'", () => {
    expect(diaEMes("sem data")).toBe("sem data");
  });
});
