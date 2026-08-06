/**
 * Story 29.38 — regressão do merge PARCIAL da config do relatório perpétuo.
 *
 * O defeito: o PUT tratava campo AUSENTE como campo APAGADO. A tela de config
 * (41.7) sempre manda o formulário inteiro, então nunca expôs o problema. A aba
 * Análise MVP (29.35–29.37) manda só o que edita — e o primeiro salvamento
 * bem-sucedido teria zerado prefixo, produto, imposto e as três taxas de
 * plataforma, além de resetar `validado` e bloquear o relatório pelo §C.8.
 *
 * Estes testes existem para que a próxima pessoa que adicionar um campo ao PUT
 * descubra a regra por um teste vermelho, e não por um relatório em branco.
 */

import { describe, it, expect } from "vitest";
import { mergeConfigValues } from "../routes/perpetual-report-config.js";
import { perpetualReportConfigs } from "../db/schema.js";

type Row = typeof perpetualReportConfigs.$inferSelect;

/** Config COMPLETA, como a tela de config (41.7) deixa depois de preenchida. */
function existingRow(over: Partial<Row> = {}): Row {
  return {
    id: "cfg-1",
    funnelId: "f-1",
    prefixoCampanha: "[BBE]",
    produto: "Curso Completo",
    produtosOrderBump: ["Bump A", "Bump B"],
    temSplitFormato: true,
    origensPagas: ["meta", "google"],
    inicioTrafego: "2026-01-15",
    impostoPct: "0.1215",
    impostoOrigem: "manual",
    taxaPlataformaPct: "0.0499",
    taxaImpostoPct: "0.06",
    taxaOutrosPct: "0.02",
    margemDesejadaPct: "0.30",
    cmv: "12.50",
    gatewayPctVar: "0.025",
    funnelArchitecture: "vsl_direct",
    chainDefectReading: null,
    manualRates: { play_rate: { value: 0.4, source: "VTurb", windowStart: "2026-07-01", windowEnd: "2026-07-31", measuredAt: "2026-08-01" } },
    ceilings: { play_rate: { value: 0.6, source: "melhor_historico" } },
    validado: true,
    validadoEm: new Date("2026-08-01"),
    validadoPor: "u-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-08-01"),
    ...over,
  } as Row;
}

describe("Story 29.38 — PUT parcial não apaga o que não veio", () => {
  it("salvar SÓ a arquitetura preserva os 11 campos originais", () => {
    const before = existingRow();
    const v = mergeConfigValues({ funnelArchitecture: "presell_to_vsl" }, before);

    expect(v.funnelArchitecture).toBe("presell_to_vsl");

    // Os 11 que o bug apagava. Sem esta lista explícita, um `toEqual` no objeto
    // inteiro esconderia qual campo regrediu.
    expect(v.prefixoCampanha).toBe("[BBE]");
    expect(v.produto).toBe("Curso Completo");
    expect(v.produtosOrderBump).toEqual(["Bump A", "Bump B"]);
    expect(v.temSplitFormato).toBe(true);
    expect(v.origensPagas).toEqual(["meta", "google"]);
    expect(v.inicioTrafego).toBe("2026-01-15");
    expect(v.impostoPct).toBe("0.1215");
    expect(v.taxaPlataformaPct).toBe("0.0499");
    expect(v.taxaImpostoPct).toBe("0.06");
    expect(v.taxaOutrosPct).toBe("0.02");
    expect(v.margemDesejadaPct).toBe("0.30");
  });

  it("salvar SÓ as premissas do produto preserva cadeia, tetos e taxas", () => {
    const before = existingRow();
    const v = mergeConfigValues(
      { margemDesejadaPct: 0.35, cmv: 20, gatewayPctVar: 0.03 },
      before,
    );

    expect(v.margemDesejadaPct).toBe("0.35");
    expect(v.cmv).toBe("20");
    expect(v.gatewayPctVar).toBe("0.03");

    // 29.36/29.37 — o que a outra seção da mesma aba havia gravado.
    expect(v.funnelArchitecture).toBe("vsl_direct");
    expect(v.manualRates).toEqual(before.manualRates);
    expect(v.ceilings).toEqual(before.ceilings);
    // E as taxas do relatório, que nada têm a ver com esta seção.
    expect(v.impostoPct).toBe("0.1215");
    expect(v.taxaPlataformaPct).toBe("0.0499");
  });

  it("null EXPLÍCITO limpa o campo — não é o mesmo que ausente", () => {
    const before = existingRow();

    const limpo = mergeConfigValues({ prefixoCampanha: null }, before);
    expect(limpo.prefixoCampanha).toBeNull();
    // ...e só ele.
    expect(limpo.produto).toBe("Curso Completo");

    const ausente = mergeConfigValues({}, before);
    expect(ausente.prefixoCampanha).toBe("[BBE]");
  });

  it("INSERT (sem config prévia) aplica os defaults, sem estourar", () => {
    const v = mergeConfigValues({ funnelArchitecture: "vsl_direct" }, undefined);

    expect(v.funnelArchitecture).toBe("vsl_direct");
    expect(v.produtosOrderBump).toEqual([]);
    expect(v.temSplitFormato).toBe(false);
    expect(v.origensPagas).toEqual(["meta"]);
    expect(v.manualRates).toEqual({});
    expect(v.ceilings).toEqual({});
    expect(v.prefixoCampanha).toBeNull();
    expect(v.impostoPct).toBeNull();
  });

  it("PUT completo da tela de config (41.7) segue substituindo tudo", () => {
    const before = existingRow();
    const v = mergeConfigValues(
      {
        prefixoCampanha: "[NOVO]",
        produto: "Outro Produto",
        produtosOrderBump: [],
        temSplitFormato: false,
        origensPagas: ["meta"],
        inicioTrafego: "2026-06-01",
        impostoPct: 0.08,
        taxaPlataformaPct: 0.05,
        taxaImpostoPct: 0.07,
        taxaOutrosPct: 0.01,
      },
      before,
    );

    expect(v.prefixoCampanha).toBe("[NOVO]");
    expect(v.produto).toBe("Outro Produto");
    expect(v.temSplitFormato).toBe(false);
    expect(v.inicioTrafego).toBe("2026-06-01");
    expect(v.impostoPct).toBe("0.08");
    expect(v.taxaOutrosPct).toBe("0.01");
    // O que a tela de config não conhece continua intocado — é justamente o que
    // permite as duas telas coexistirem sobre a mesma linha.
    expect(v.funnelArchitecture).toBe("vsl_direct");
    expect(v.manualRates).toEqual(before.manualRates);
  });

  it("`false` e `[]` sobrevivem — `??` os teria trocado pelo default", () => {
    // Este caso é sutil: `existing.temSplitFormato === false` com `previous ?? fallback`
    // devolve `false` corretamente, mas um `||` no lugar do `??` devolveria o
    // fallback. O teste trava a escolha do operador.
    const before = existingRow({ temSplitFormato: false, produtosOrderBump: [] });
    const v = mergeConfigValues({ funnelArchitecture: "vsl_direct" }, before);

    expect(v.temSplitFormato).toBe(false);
    expect(v.produtosOrderBump).toEqual([]);
  });

  it("zero é preservado, não confundido com ausente", () => {
    // `cmv: 0` é legítimo (produto digital sem custo unitário). Sob `??` no valor
    // de entrada, `0` sobreviveria; sob `||`, viraria null. Trava isso também.
    const v = mergeConfigValues({ cmv: 0, gatewayPctVar: 0 }, existingRow());
    expect(v.cmv).toBe("0");
    expect(v.gatewayPctVar).toBe("0");
  });
});
